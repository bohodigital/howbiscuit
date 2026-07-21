import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { load as parseYaml } from 'js-yaml';
import { z } from 'zod';

import { isSafeEditorialUrl } from './contracts.mjs';
import { stableJson } from './stable-json.mjs';

export const PRODUCT_RECORD_SCHEMA_VERSION = '1.0.0';
const MAX_RECORD_BYTES = 256 * 1024;
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
function validCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function plainTextSchema(minimum = 1) {
  return z.string().trim().min(minimum).refine(
    (value) => !/[\u0000-\u001f\u007f<>{}`]/.test(value),
    'Record text must be single-line plain text without HTML, MDX, template expressions, or control characters.',
  );
}
function validGtin(value, lengths) {
  if (!lengths.includes(value.length) || !/^\d+$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
const placeholderIdentifierPattern = /^(?:unknown|none|n\/a|na|tbd|pending|example|placeholder)$/i;
const safeIdentifier = (schema) => schema.refine((value) => !placeholderIdentifierPattern.test(value), 'Identifiers cannot be placeholders.').nullable();
const date = z.string().refine(validCalendarDate, 'Dates must be real YYYY-MM-DD calendar dates.');
const nonEmpty = plainTextSchema();
const descriptive = plainTextSchema(40);
const idList = z.array(id).default([]);
const status = z.enum(['draft', 'published', 'retired']);
const gtinIdentifier = safeIdentifier(z.string().regex(/^\d{8}(?:\d{4}|\d{5}|\d{6})?$/).refine((value) => validGtin(value, [8, 12, 13, 14]), 'GTIN checksum is invalid.'));
const upcIdentifier = safeIdentifier(z.string().regex(/^\d{12}$/).refine((value) => validGtin(value, [12]), 'UPC checksum is invalid.'));
const eanIdentifier = safeIdentifier(z.string().regex(/^(?:\d{8}|\d{13})$/).refine((value) => validGtin(value, [8, 13]), 'EAN checksum is invalid.'));
const mpnIdentifier = safeIdentifier(z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/));
const asinIdentifier = safeIdentifier(z.string().regex(/^[A-Z0-9]{10}$/));
const skuIdentifier = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/).refine((value) => !placeholderIdentifierPattern.test(value), 'Retailer SKUs cannot be placeholders.');
const provenanceState = z.enum(['tested', 'personally-used', 'researched', 'listed-without-recommendation']);
const rankingPattern = /\b(?:best(?:\s+(?:overall|value))?|top\s+pick|winner|number\s+one)\b/i;
const articleRankingPattern = /\b(?:best\s+(?:overall|value)|top\s+pick|winner|number\s+one)\b|\bbest\b[^\n.!?]{0,48}\b(?:product|model|option|choice|value|buy|purchase|pick)\b|\b(?:this|that|the)\s+(?:[a-z0-9-]{1,32}\s+){1,5}(?:is|was|remains)\s+(?:the\s+)?best\b/i;
const liveClaimPattern = /\b(?:live\s+(?:price|offer|availability)|real[- ]time\s+(?:price|offer|availability)|currently available|in stock|near you|local availability)\b/i;
const rawPricePattern = /(?:[$€£]\s*\d|\b\d+(?:[.,]\d{1,2})?\s*(?:dollars?|euros?|pounds?)\b)/i;
const currencyCodePricePattern = /(?:\b[A-Z]{3}\s+\d|\b\d+(?:[.,]\d{1,2})?\s+[A-Z]{3}\b)/;
const firstHandProvenancePattern = /(?:\b(?:we|i|our\s+team|how\s+biscuit)\s+(?:have\s+|personally\s+)?(?:used|tested|tried|owned|handled)\b|\b(?:hands?-on\s+)?(?:used|tested|tried|owned|handled)\s+by\s+(?:us|me|our\s+team|how\s+biscuit)\b|\b(?:our|my|how\s+biscuit(?:'s|’s))\s+(?:hands?-on\s+)?(?:use|testing|experience|trial)\b)/i;
const recommendationProvenancePattern = /(?:\b(?:we|i|our\s+team|how\s+biscuit)\s+(?:personally\s+)?recommend(?:ed|s|ing)?\b|\brecommend(?:ed|s|ing)?\s+by\s+(?:us|me|our\s+team|how\s+biscuit)\b|\b(?:our|my|how\s+biscuit(?:'s|’s))\s+recommendation\b)/i;

const product = z.object({
  schemaVersion: z.literal(PRODUCT_RECORD_SCHEMA_VERSION),
  id,
  displayName: nonEmpty,
  brand: nonEmpty,
  model: nonEmpty,
  exactVariant: nonEmpty,
  productType: id,
  manufacturerIdentifiers: z.object({
    gtin: gtinIdentifier,
    upc: upcIdentifier,
    ean: eanIdentifier,
    mpn: mpnIdentifier,
    asin: asinIdentifier,
    retailerSkus: z.array(z.object({ merchant: nonEmpty, sku: skuIdentifier }).strict()).default([]),
  }).strict(),
  variantAttributes: z.record(id, nonEmpty).refine((value) => Object.keys(value).length > 0, 'At least one exact variant attribute is required.'),
  description: descriptive,
  sourceIds: idList,
  mediaIds: idList,
  provenance: z.object({ state: provenanceState, notes: nonEmpty }).strict(),
  status,
}).strict();

const productGroup = z.object({
  schemaVersion: z.literal(PRODUCT_RECORD_SCHEMA_VERSION),
  id,
  title: nonEmpty,
  purpose: descriptive,
  memberProductIds: z.array(id).min(1),
  inclusionCriteria: z.array(nonEmpty).min(1),
  exclusionCriteria: z.array(nonEmpty).min(1),
  methodology: descriptive,
  evidenceBasis: descriptive,
  testingIds: idList,
  sourceIds: idList,
  recommendationState: z.enum(['listed-only', 'researched', 'recommended', 'best']),
  status,
  reviewDate: date.nullable(),
  reviewHorizon: nonEmpty.nullable(),
}).strict().superRefine((record, context) => {
  if ((record.reviewDate === null) === (record.reviewHorizon === null)) {
    context.addIssue({ code: 'custom', path: ['reviewDate'], message: 'Exactly one review date or review horizon is required.' });
  }
  if (new Set(record.memberProductIds).size !== record.memberProductIds.length) {
    context.addIssue({ code: 'custom', path: ['memberProductIds'], message: 'Product group members must be unique.' });
  }
  if ((record.recommendationState === 'best' || rankingPattern.test(record.title)) && record.testingIds.length + record.sourceIds.length === 0) {
    context.addIssue({ code: 'custom', path: ['evidenceBasis'], message: 'A best group requires explicit testing or source evidence.' });
  }
});

const merchantDestination = z.object({
  schemaVersion: z.literal(PRODUCT_RECORD_SCHEMA_VERSION),
  id,
  productId: id,
  exactVariant: nonEmpty,
  merchant: nonEmpty,
  exactUrl: z.string().refine((value) => {
    if (!isSafeEditorialUrl(value)) return false;
    const url = new URL(value);
    return url.protocol === 'https:' && url.hash === '' && url.search === '';
  }, 'Handoff 2 merchant destinations require credential-free HTTPS URLs without query parameters or fragments.'),
  market: z.string().regex(/^[A-Z]{2}(?:-[A-Z0-9]{2,8})?$/),
  relationship: z.enum(['unpaid', 'future-affiliate']),
  capturedDate: date,
  verificationNotes: nonEmpty,
  status,
}).strict().superRefine((record, context) => {
  if (record.status === 'published' && record.relationship !== 'unpaid') {
    context.addIssue({ code: 'custom', path: ['relationship'], message: 'Handoff 2 may publish only unpaid destinations.' });
  }
});

const priceClaim = z.object({
  schemaVersion: z.literal(PRODUCT_RECORD_SCHEMA_VERSION),
  id,
  amount: z.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  productId: id,
  destinationId: id.nullable(),
  sourceId: id.nullable(),
  observedDate: date,
  displayWording: nonEmpty,
  context: nonEmpty,
  reviewDate: date.nullable(),
  status,
}).strict().superRefine((record, context) => {
  if ((record.destinationId === null) === (record.sourceId === null)) {
    context.addIssue({ code: 'custom', path: ['destinationId'], message: 'Exactly one destination or source is required.' });
  }
  if (record.reviewDate !== null && record.reviewDate < record.observedDate) {
    context.addIssue({ code: 'custom', path: ['reviewDate'], message: 'reviewDate cannot precede observedDate.' });
  }
  if (liveClaimPattern.test(`${record.displayWording} ${record.context}`)) {
    context.addIssue({ code: 'custom', path: ['displayWording'], message: 'Static price claims cannot imply live or local availability.' });
  }
});

const recommendationClaim = z.object({
  schemaVersion: z.literal(PRODUCT_RECORD_SCHEMA_VERSION),
  id,
  productGroupId: id,
  evaluatedProductIds: z.array(id).min(1),
  methodology: descriptive,
  evidence: descriptive,
  testingIds: idList,
  sourceIds: idList,
  reviewDate: date,
  limitations: z.array(nonEmpty).min(1),
  wording: nonEmpty,
  status,
}).strict().superRefine((record, context) => {
  if (new Set(record.evaluatedProductIds).size !== record.evaluatedProductIds.length) {
    context.addIssue({ code: 'custom', path: ['evaluatedProductIds'], message: 'Evaluated products must be unique.' });
  }
  if (record.testingIds.length + record.sourceIds.length === 0) {
    context.addIssue({ code: 'custom', path: ['evidence'], message: 'Recommendation claims require testing or source IDs.' });
  }
});

export function createProductSchemas() {
  return Object.freeze({ product, productGroup, merchantDestination, priceClaim, recommendationClaim });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function loadKind(root, directory, schema) {
  const recordRoot = path.join(root, 'content', directory);
  if (!existsSync(recordRoot)) return new Map();
  const records = new Map();
  for (const entry of readdirSync(recordRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) throw new Error(`content/${directory}/${entry.name}: unexpected record entry`);
    const filePath = path.join(recordRoot, entry.name);
    const fileStatus = lstatSync(filePath);
    if (fileStatus.isSymbolicLink() || !fileStatus.isFile() || fileStatus.size > MAX_RECORD_BYTES) throw new Error(`content/${directory}/${entry.name}: unsafe record file`);
    const parsed = schema.parse(parseYaml(readFileSync(filePath, 'utf8')));
    if (records.has(parsed.id)) throw new Error(`Duplicate ${directory} ID: ${parsed.id}`);
    records.set(parsed.id, Object.freeze({ ...parsed, recordDigest: sha256(stableJson(parsed)) }));
  }
  return records;
}

function requireRecord(records, recordId, label) {
  const record = records.get(recordId);
  if (!record) throw new Error(`${label}: unresolved record ${recordId}`);
  return record;
}

function requireEditorialRecord(records, recordId, label) {
  const record = requireRecord(records, recordId, label);
  if (!['active', 'published'].includes(record.status)) throw new Error(`${label}: record ${recordId} is ${record.status}`);
  return record;
}

function sameMembers(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function canonicalProductFingerprint(record) {
  const normalize = (value) => value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
  return stableJson({
    brand: normalize(record.brand),
    model: normalize(record.model),
    exactVariant: normalize(record.exactVariant),
    variantAttributes: Object.fromEntries(Object.entries(record.variantAttributes)
      .map(([key, value]) => [key, normalize(value)])
      .sort(([left], [right]) => left.localeCompare(right, 'en'))),
  });
}

function extractHttpUrls(text) {
  return [...text.matchAll(/https?:\/\/[^\s<>"'\]}]+/gi)].map((match) => match[0].replace(/[),.;:!?]+$/, ''));
}

function looksLikeMerchantUrl(value, registeredDestinations = []) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (registeredDestinations.some(({ exactUrl }) => {
    const registered = new URL(exactUrl);
    return url.href === registered.href || url.hostname === registered.hostname;
  })) return true;
  return /(?:^|\.)(?:amazon|ebay|walmart|target|bestbuy|homedepot|lowes|etsy|aliexpress|merchant|shop|store)(?:\.|$)/i.test(url.hostname)
    || /\/(?:dp|gp\/product|ip|item|items|p|product|products|buy|cart|checkout)(?:\/|$)/i.test(url.pathname);
}

function assertNoUngovernedCommerceText(text, label, { allowRanking = false, registeredDestinations = [], allowedEditorialUrls = [] } = {}) {
  if (rawPricePattern.test(text) || currencyCodePricePattern.test(text)) throw new Error(`${label}: raw price text is not allowed; use a structured dated price claim`);
  if (liveClaimPattern.test(text)) throw new Error(`${label}: live or local availability language belongs to Handoff 3`);
  if (!allowRanking && articleRankingPattern.test(text)) throw new Error(`${label}: unsupported ranking language requires a governed recommendation claim`);
  const allowedUrls = new Set(allowedEditorialUrls
    .filter((value) => /^https?:\/\//i.test(value))
    .map((value) => new URL(value).href));
  for (const url of extractHttpUrls(text)) {
    const normalized = new URL(url).href;
    if (looksLikeMerchantUrl(url, registeredDestinations) || !allowedUrls.has(normalized)) {
      throw new Error(`${label}: merchant URLs must be represented by destination IDs and every raw URL must match a governed source or preview`);
    }
  }
}

function assertProvenanceTextMatchesState(record) {
  const text = `${record.description} ${record.provenance.notes}`;
  if (['researched', 'listed-without-recommendation'].includes(record.provenance.state) && firstHandProvenancePattern.test(text)) {
    throw new Error(`Product ${record.id}: ${record.provenance.state} provenance cannot claim first-hand use or testing`);
  }
  if (record.provenance.state === 'listed-without-recommendation' && recommendationProvenancePattern.test(text)) {
    throw new Error(`Product ${record.id}: listed-without-recommendation provenance cannot make a recommendation claim`);
  }
}

function escapeMarkdownText(value) {
  return String(value).trim().replace(/\s+/g, ' ').replace(/([\\`*_[\]{}()<>#+!|>$])/g, '\\$1');
}

function markdownUrl(value) {
  return new URL(value).href.replaceAll('(', '%28').replaceAll(')', '%29');
}

export async function loadProductRecords(root, editorial) {
  const schemas = createProductSchemas();
  const records = {
    products: loadKind(root, 'products', schemas.product),
    productGroups: loadKind(root, 'product-groups', schemas.productGroup),
    merchantDestinations: loadKind(root, 'merchant-destinations', schemas.merchantDestination),
    priceClaims: loadKind(root, 'price-claims', schemas.priceClaim),
    recommendationClaims: loadKind(root, 'recommendation-claims', schemas.recommendationClaim),
  };

  const identifiers = new Map();
  const canonicalProducts = new Map();
  const provenanceTestingByProduct = new Map();
  for (const record of records.products.values()) {
    const fingerprint = canonicalProductFingerprint(record);
    if (canonicalProducts.has(fingerprint)) throw new Error(`Product ${record.id}: canonical identity duplicates ${canonicalProducts.get(fingerprint)}`);
    canonicalProducts.set(fingerprint, record.id);
    for (const [kind, value] of Object.entries(record.manufacturerIdentifiers)) {
      if (kind === 'retailerSkus') {
        for (const mapping of value) {
          const key = `retailer-sku:${mapping.merchant.toLowerCase()}:${mapping.sku}`;
          if (identifiers.has(key)) throw new Error(`Product ${record.id}: duplicate identifier also used by ${identifiers.get(key)}`);
          identifiers.set(key, record.id);
        }
      } else if (value !== null) {
        const key = `${kind}:${value}`;
        if (identifiers.has(key)) throw new Error(`Product ${record.id}: duplicate identifier also used by ${identifiers.get(key)}`);
        identifiers.set(key, record.id);
      }
    }
    const sources = record.sourceIds.map((sourceId) => requireEditorialRecord(editorial.sources, sourceId, `Product ${record.id}`));
    const testing = record.provenance.state === 'tested'
      ? [...editorial.testing.values()].filter((item) => item.productIds.includes(record.id) && item.status === 'active' && item.claimState === 'hands-on-tested')
      : record.provenance.state === 'personally-used'
        ? [...editorial.testing.values()].filter((item) => item.productIds.includes(record.id) && item.status === 'active' && item.claimState === 'owner-experience')
        : [];
    for (const mediaId of record.mediaIds) requireEditorialRecord(editorial.mediaRights, mediaId, `Product ${record.id}`);
    if (record.provenance.state === 'researched' && sources.length === 0) throw new Error(`Product ${record.id}: researched provenance requires a source`);
    if (['tested', 'personally-used'].includes(record.provenance.state) && testing.length === 0) {
      throw new Error(`Product ${record.id}: ${record.provenance.state} provenance requires matching testing evidence`);
    }
    assertProvenanceTextMatchesState(record);
    provenanceTestingByProduct.set(record.id, Object.freeze(testing));
    assertNoUngovernedCommerceText([
      record.displayName, record.brand, record.model, record.exactVariant, record.description, record.provenance.notes,
      ...Object.values(record.variantAttributes),
    ].join(' '), `Product ${record.id}`);
  }

  for (const group of records.productGroups.values()) {
    for (const productId of group.memberProductIds) {
      const productRecord = requireRecord(records.products, productId, `Product group ${group.id}`);
      if (group.status === 'published' && productRecord.status !== 'published') throw new Error(`Product group ${group.id}: publishable groups require publishable members`);
    }
    for (const sourceId of group.sourceIds) requireEditorialRecord(editorial.sources, sourceId, `Product group ${group.id}`);
    for (const testingId of group.testingIds) requireEditorialRecord(editorial.testing, testingId, `Product group ${group.id}`);
  }
  for (const destination of records.merchantDestinations.values()) {
    const productRecord = requireRecord(records.products, destination.productId, `Merchant destination ${destination.id}`);
    if (destination.exactVariant !== productRecord.exactVariant) throw new Error(`Merchant destination ${destination.id}: exact variant does not match product ${productRecord.id}`);
    if (destination.status === 'published' && productRecord.status !== 'published') throw new Error(`Merchant destination ${destination.id}: publishable destination requires a publishable product`);
    assertNoUngovernedCommerceText(`${destination.merchant} ${destination.verificationNotes}`, `Merchant destination ${destination.id}`);
  }
  for (const claim of records.priceClaims.values()) {
    const productRecord = requireRecord(records.products, claim.productId, `Price claim ${claim.id}`);
    if (claim.destinationId !== null) {
      const destination = requireRecord(records.merchantDestinations, claim.destinationId, `Price claim ${claim.id}`);
      if (destination.productId !== productRecord.id) throw new Error(`Price claim ${claim.id}: destination belongs to another product`);
      if (claim.status === 'published' && destination.status !== 'published') throw new Error(`Price claim ${claim.id}: publishable claim requires a publishable destination`);
    } else {
      requireEditorialRecord(editorial.sources, claim.sourceId, `Price claim ${claim.id}`);
    }
    if (claim.status === 'published' && productRecord.status !== 'published') throw new Error(`Price claim ${claim.id}: publishable claim requires a publishable product`);
    assertNoUngovernedCommerceText(`${claim.displayWording} ${claim.context}`, `Price claim ${claim.id}`);
  }
  for (const claim of records.recommendationClaims.values()) {
    const group = requireRecord(records.productGroups, claim.productGroupId, `Recommendation claim ${claim.id}`);
    for (const productId of claim.evaluatedProductIds) {
      const productRecord = requireRecord(records.products, productId, `Recommendation claim ${claim.id}`);
      if (claim.status === 'published' && productRecord.status !== 'published') throw new Error(`Recommendation claim ${claim.id}: publishable claims require publishable evaluated products`);
    }
    if (!sameMembers(claim.evaluatedProductIds, group.memberProductIds)) throw new Error(`Recommendation claim ${claim.id}: evaluated products must exactly match group membership`);
    for (const sourceId of claim.sourceIds) requireEditorialRecord(editorial.sources, sourceId, `Recommendation claim ${claim.id}`);
    for (const testingId of claim.testingIds) requireEditorialRecord(editorial.testing, testingId, `Recommendation claim ${claim.id}`);
    if (claim.status === 'published' && group.status !== 'published') throw new Error(`Recommendation claim ${claim.id}: publishable claim requires a publishable group`);
    assertNoUngovernedCommerceText(`${claim.methodology} ${claim.evidence} ${claim.wording} ${claim.limitations.join(' ')}`, `Recommendation claim ${claim.id}`, { allowRanking: true });
  }
  for (const group of records.productGroups.values()) {
    const support = [...records.recommendationClaims.values()].find((claim) => claim.status === 'published' && claim.productGroupId === group.id);
    const ranking = group.recommendationState === 'best' || rankingPattern.test(group.title);
    if (group.status === 'published' && ranking && !support) throw new Error(`Product group ${group.id}: publishable best claim requires a published recommendation claim`);
    assertNoUngovernedCommerceText([
      group.title, group.purpose, ...group.inclusionCriteria, ...group.exclusionCriteria, group.methodology, group.evidenceBasis,
    ].join(' '), `Product group ${group.id}`, { allowRanking: Boolean(support) });
  }
  return Object.freeze({ schemas, ...records, provenanceTestingByProduct });
}

export function productJsonSchemas(schemas) {
  return Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' })]));
}

export function provenanceLabel(state) {
  return Object.freeze({
    tested: 'Tested by How Biscuit',
    'personally-used': 'Personally used by How Biscuit',
    researched: 'Researched by How Biscuit',
    'listed-without-recommendation': 'Listed for reference; not a recommendation',
  })[state];
}

export function renderPriceClaim(claim) {
  return `${claim.displayWording} — ${claim.amount.toLocaleString('en-US', { style: 'currency', currency: claim.currency })} as of ${claim.observedDate}. ${claim.context}`;
}

export function createPublicProductCatalog(records) {
  const published = (map) => [...map.values()].filter(({ status: recordStatus }) => recordStatus === 'published').sort((left, right) => left.id.localeCompare(right.id, 'en'));
  return Object.freeze({
    schemaVersion: PRODUCT_RECORD_SCHEMA_VERSION,
    products: published(records.products).map((record) => Object.freeze({ ...record, provenanceLabel: provenanceLabel(record.provenance.state) })),
    productGroups: published(records.productGroups),
    merchantDestinations: published(records.merchantDestinations).filter(({ relationship }) => relationship === 'unpaid'),
    priceClaims: published(records.priceClaims).map((record) => Object.freeze({ ...record, renderedText: renderPriceClaim(record) })),
    recommendationClaims: published(records.recommendationClaims),
  });
}

function resolvePublished(ids, records, kind, label) {
  return ids.map((recordId) => {
    const record = records.get(recordId);
    if (!record) throw new Error(`${label}: unresolved ${kind} ${recordId}`);
    if (record.status !== 'published') throw new Error(`${label}: ${kind} ${recordId} is not publishable`);
    return record;
  });
}

export function resolveArticleCommerce(governance, commerce, editorial, label, claimText) {
  const products = resolvePublished(governance.productIds, commerce.products, 'product', label);
  const groups = resolvePublished(governance.productGroupIds, commerce.productGroups, 'product group', label);
  const destinations = resolvePublished(governance.destinationIds, commerce.merchantDestinations, 'merchant destination', label);
  const prices = resolvePublished(governance.priceClaims, commerce.priceClaims, 'price claim', label);
  const recommendations = resolvePublished(governance.recommendationClaims, commerce.recommendationClaims, 'recommendation claim', label);
  for (const destination of destinations) {
    if (destination.relationship !== 'unpaid') throw new Error(`${label}: affiliate destination ${destination.id} cannot be published in Handoff 2`);
    const productRecord = products.find(({ id: productId }) => productId === destination.productId);
    if (!productRecord) throw new Error(`${label}: destination ${destination.id} product ${destination.productId} is not declared`);
    if (destination.exactVariant !== productRecord.exactVariant) throw new Error(`${label}: destination ${destination.id} exact variant mismatch`);
  }
  for (const group of groups) {
    for (const productId of group.memberProductIds) {
      if (!commerce.products.has(productId)) throw new Error(`${label}: product group ${group.id} has unresolved member ${productId}`);
    }
  }
  for (const claim of prices) {
    if (!products.some(({ id: productId }) => productId === claim.productId)) throw new Error(`${label}: price claim ${claim.id} product is not declared`);
    if (claim.destinationId !== null && !destinations.some(({ id: destinationId }) => destinationId === claim.destinationId)) {
      throw new Error(`${label}: price claim ${claim.id} destination is not declared`);
    }
    if (claim.sourceId !== null && !governance.sourceIds.includes(claim.sourceId)) throw new Error(`${label}: price claim ${claim.id} source is not declared`);
  }
  for (const claim of recommendations) {
    if (!groups.some(({ id: groupId }) => groupId === claim.productGroupId)) throw new Error(`${label}: recommendation claim ${claim.id} group is not declared`);
  }

  assertNoUngovernedCommerceText(claimText, label, {
    allowRanking: recommendations.length > 0,
    registeredDestinations: [...commerce.merchantDestinations.values()],
    allowedEditorialUrls: [
      ...governance.sourceIds.map((sourceId) => editorial.sources.get(sourceId)?.canonicalUrl).filter(Boolean),
      ...(governance.linkPreviewIds ?? []).map((previewId) => editorial.linkPreviews?.get(previewId)?.destinationUrl).filter(Boolean),
    ],
  });

  const dependencies = [];
  const add = (kind, record) => {
    if (!record || dependencies.some((item) => item.kind === kind && item.record.id === record.id)) return;
    dependencies.push({ kind, record });
  };
  for (const record of products) {
    add('product', record);
    for (const sourceId of record.sourceIds) add('source', editorial.sources.get(sourceId));
    for (const mediaId of record.mediaIds) add('media-rights', editorial.mediaRights.get(mediaId));
    for (const testing of commerce.provenanceTestingByProduct.get(record.id) ?? []) add('testing', testing);
  }
  for (const record of groups) {
    add('product-group', record);
    for (const sourceId of record.sourceIds) add('source', editorial.sources.get(sourceId));
    for (const testingId of record.testingIds) add('testing', editorial.testing.get(testingId));
  }
  for (const record of destinations) add('merchant-destination', record);
  for (const record of prices) {
    add('price-claim', record);
    if (record.sourceId) add('source', editorial.sources.get(record.sourceId));
  }
  for (const record of recommendations) {
    add('recommendation-claim', record);
    for (const sourceId of record.sourceIds) add('source', editorial.sources.get(sourceId));
    for (const testingId of record.testingIds) add('testing', editorial.testing.get(testingId));
  }
  return Object.freeze({
    products: Object.freeze(products),
    groups: Object.freeze(groups),
    destinations: Object.freeze(destinations),
    prices: Object.freeze(prices),
    recommendations: Object.freeze(recommendations),
    dependencies: Object.freeze(dependencies),
  });
}

export function renderCommerceDirective(kind, attributes, resolved) {
  if (kind === 'product') {
    const productRecord = resolved.products.find(({ id: productId }) => productId === attributes.product);
    const destination = resolved.destinations.find(({ id: destinationId }) => destinationId === attributes.destination);
    if (!productRecord || !destination || destination.productId !== productRecord.id) throw new Error('Validated product directive lost its canonical records.');
    return `> **${escapeMarkdownText(productRecord.displayName)} — ${escapeMarkdownText(productRecord.exactVariant)}.** ${escapeMarkdownText(provenanceLabel(productRecord.provenance.state))}. [View the unpaid ${escapeMarkdownText(destination.merchant)} listing](${markdownUrl(destination.exactUrl)}) (captured ${destination.capturedDate}); How Biscuit receives no compensation.`;
  }
  if (kind === 'product-group') {
    const group = resolved.groups.find(({ id: groupId }) => groupId === attributes.group);
    if (!group) throw new Error('Validated product-group directive lost its canonical record.');
    const claim = resolved.recommendations.find(({ productGroupId }) => productGroupId === group.id);
    return `> **${escapeMarkdownText(group.title)}.** ${escapeMarkdownText(claim?.wording ?? group.purpose)} Review ${escapeMarkdownText(group.reviewDate ?? group.reviewHorizon)}.`;
  }
  if (kind === 'price') {
    const claim = resolved.prices.find(({ id: claimId }) => claimId === attributes.claim);
    if (!claim) throw new Error('Validated price directive lost its canonical record.');
    return `> **Dated price observation.** ${escapeMarkdownText(renderPriceClaim(claim))}`;
  }
  return null;
}
