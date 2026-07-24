#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { digest, stableJson, validateBrokerEnvelope } from './release-lib.mjs';

const NUTRIENT_IDS = new Set([1003, 1004, 1005, 1008, 1079, 1087, 1089, 1092, 1093, 2000]);
const valueFor = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`Invalid provider date: ${value}`);
  return parsed.toISOString().slice(0, 10);
}

function validateBrokerResults(results, apiId, operation) {
  assert(Array.isArray(results) && results.length > 0, 'Broker result array required.');
  for (const result of results) {
    assert(result?.api_id === apiId && result.operation === operation, 'Broker result operation mismatch.');
    assert(result.status === 'ok' && !result.error, 'Only successful broker results may be exported.');
    assert(Array.isArray(result.records), 'Broker result records missing.');
    assert(typeof result.source?.retrieved_at === 'string', 'Broker retrieval timestamp missing.');
    assert(result.source?.attribution && result.source?.docs_url, 'Broker source metadata missing.');
  }
}

function aggregateQuota(results) {
  const remaining = results
    .map((result) => result.quota?.remaining)
    .filter((value) => Number.isFinite(value));
  return {
    remaining: remaining.length ? Math.min(...remaining) : null,
    state: results.every((result) => result.quota?.status === 'reported')
      ? 'reported'
      : 'broker-managed',
  };
}

function fooddataRecords(results) {
  validateBrokerResults(results, 'data_gov', 'fooddata_get');
  const records = [];
  for (const result of results) {
    for (const food of result.records) {
      assert(Number.isInteger(food.fdcId) && food.fdcId > 0, 'FoodData FDC ID missing.');
      const retrievedAt = result.source.retrieved_at;
      records.push({
        recordType: 'food',
        fdcId: food.fdcId,
        description: String(food.description ?? '').trim(),
        dataType: String(food.dataType ?? '').trim(),
        publicationDate: isoDate(food.publicationDate),
        foodCategory: typeof food.foodCategory === 'string'
          ? food.foodCategory
          : String(food.foodCategory?.description ?? '').trim() || null,
        retrievedAt,
      });
      for (const nutrient of food.foodNutrients ?? []) {
        if (
          !NUTRIENT_IDS.has(nutrient.nutrientId) ||
          !Number.isFinite(nutrient.amount) ||
          !nutrient.nutrientName ||
          !nutrient.unitName ||
          !nutrient.basis
        ) continue;
        records.push({
          recordType: 'nutrient',
          fdcId: food.fdcId,
          nutrientId: nutrient.nutrientId,
          nutrientName: String(nutrient.nutrientName).trim(),
          amount: nutrient.amount,
          unitName: String(nutrient.unitName).trim(),
          basis: String(nutrient.basis).replace(/^per\s+/i, '').trim(),
          retrievedAt,
        });
      }
    }
  }
  const foodIds = records.filter(({ recordType }) => recordType === 'food').map(({ fdcId }) => fdcId);
  assert(new Set(foodIds).size === foodIds.length && foodIds.length >= 15, 'FoodData export requires at least 15 unique foods.');
  assert(records.some(({ recordType }) => recordType === 'nutrient'), 'FoodData export contains no complete nutrient records.');
  return records;
}

function krogerRecords(results) {
  validateBrokerResults(results, 'kroger', 'search_products');
  const records = [];
  for (const result of results) {
    for (const product of result.records) {
      assert(product.productId && product.upc && product.brand && product.description, 'Incomplete Kroger product identity.');
      for (const item of product.items ?? []) {
        if (!item.itemId || !item.size) continue;
        records.push({
          recordType: 'product-item',
          productId: String(product.productId),
          upc: String(product.upc),
          brand: String(product.brand),
          description: String(product.description),
          itemId: String(item.itemId),
          size: String(item.size),
          soldBy: item.soldBy ? String(item.soldBy) : null,
          regularPrice: Number.isFinite(item.price?.regular) ? item.price.regular : null,
          promotionalPrice: Number.isFinite(item.price?.promo) ? item.price.promo : null,
          curbside: item.fulfillment?.curbside === true,
          delivery: item.fulfillment?.delivery === true,
          inStore: item.fulfillment?.inStore === true,
          shipToHome: item.fulfillment?.shipToHome === true,
          stockLevel: item.inventory?.stockLevel ? String(item.inventory.stockLevel) : null,
          retrievedAt: result.source.retrieved_at,
        });
      }
    }
  }
  assert(new Set(records.map(({ productId }) => productId)).size >= 25, 'Kroger export requires at least 25 unique exact products.');
  return records;
}

export function buildBrokerEnvelope(providerId, results) {
  const records = providerId === 'fooddata' ? fooddataRecords(results)
    : providerId === 'kroger' ? krogerRecords(results)
      : null;
  assert(records, `Unsupported broker-export provider: ${providerId}`);
  const retrievedAt = records.map(({ retrievedAt }) => retrievedAt).sort().at(-1);
  const envelope = {
    schemaVersion: '1.0.0',
    providerId,
    operation: providerId === 'fooddata' ? 'fooddata_get_batch' : 'search_products',
    parameters: providerId === 'fooddata'
      ? {
          fdcIds: records.filter(({ recordType }) => recordType === 'food').map(({ fdcId }) => fdcId).sort((a, b) => a - b).join(','),
          perRequestLimit: 1,
        }
      : {
          locationId: '53100516',
          productIds: records.map(({ productId }) => productId).sort().join(','),
          perRequestLimit: 50,
        },
    retrievedAt,
    source: providerId === 'fooddata'
      ? {
          attribution: 'USDA FoodData Central',
          documentationUrl: 'https://fdc.nal.usda.gov/api-guide.html',
        }
      : {
          attribution: 'The Kroger Co.',
          documentationUrl: 'https://www.postman.com/kroger/the-kroger-co-s-public-workspace/documentation/ki6utqb/kroger-public-apis',
        },
    quota: aggregateQuota(results),
    warnings: [...new Set(results.flatMap((result) => result.warnings ?? []))],
    truncated: results.some((result) => result.truncated === true),
    records,
    contentDigest: '',
  };
  const unsigned = { ...envelope };
  delete unsigned.contentDigest;
  envelope.contentDigest = digest(unsigned);
  return validateBrokerEnvelope(envelope);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const providerId = valueFor('--provider');
  const input = valueFor('--input');
  const output = valueFor('--output');
  if (!providerId || !input || !output) {
    throw new Error('Usage: broker-envelope.mjs --provider fooddata|kroger --input <broker-results.json> --output <envelope.json>');
  }
  const envelope = buildBrokerEnvelope(providerId, JSON.parse(readFileSync(path.resolve(input), 'utf8')));
  writeFileSync(path.resolve(output), stableJson(envelope), { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${providerId}: wrote ${envelope.records.length} bounded records to ${output}.\n`);
}
