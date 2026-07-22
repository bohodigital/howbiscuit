import { createHash } from 'node:crypto';

import { z } from 'zod';

import { canonicalJson } from './canonical-json.mjs';

const productSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  exactVariant: z.string().min(1),
  productType: z.string().min(1),
  variantAttributes: z.record(z.string(), z.string()).refine((value) => Object.keys(value).length > 0),
  status: z.enum(['published', 'retired']).default('published'),
});

const catalogSchema = z.object({
  schemaVersion: z.string().min(1),
  products: z.array(productSchema),
});

function normalizedIdentity(product) {
  const text = (value) => value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
  return {
    brand: text(product.brand),
    model: text(product.model),
    exactVariant: text(product.exactVariant),
    variantAttributes: Object.fromEntries(Object.entries(product.variantAttributes).map(([key, value]) => [key, text(value)]).sort(([left], [right]) => left.localeCompare(right, 'en'))),
  };
}

export function createIdentityDigest(productInput) {
  const product = productSchema.parse(productInput);
  return createHash('sha256').update(canonicalJson(normalizedIdentity(product))).digest('hex');
}

export function buildCatalogProjection(catalogInput, { sourceCommit, syncedAt = new Date().toISOString() }) {
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error('Catalog projection requires an exact 40-character Git commit.');
  const catalog = catalogSchema.parse(catalogInput);
  const productIds = new Set();
  const identityDigests = new Map();
  const rows = catalog.products.map((product) => {
    if (productIds.has(product.id)) throw new Error(`Duplicate canonical product ID: ${product.id}`);
    productIds.add(product.id);
    const identityDigest = createIdentityDigest(product);
    if (identityDigests.has(identityDigest)) throw new Error(`Duplicate canonical identity digest for ${product.id} and ${identityDigests.get(identityDigest)}`);
    identityDigests.set(identityDigest, product.id);
    return Object.freeze({
      productId: product.id,
      catalogSchemaVersion: catalog.schemaVersion,
      identityDigest,
      displayName: product.displayName,
      brand: product.brand,
      model: product.model,
      exactVariant: product.exactVariant,
      productType: product.productType,
      status: product.status,
      releaseMember: 1,
      sourceCommit,
      syncedAt,
    });
  });
  return Object.freeze({
    schemaVersion: '1.0.0',
    catalogSchemaVersion: catalog.schemaVersion,
    sourceCommit,
    syncedAt,
    catalogIdentityDigest: createHash('sha256').update(canonicalJson(rows.map(({ syncedAt: _syncedAt, releaseMember: _releaseMember, ...row }) => row))).digest('hex'),
    rows: Object.freeze(rows),
  });
}

export function projectionStatements(db, projection) {
  const statements = projection.rows.map((row) => db.prepare(`INSERT INTO catalog_product_projection (
    product_id, catalog_schema_version, identity_digest, display_name, brand, model,
    exact_variant, product_type, status, release_member, source_commit, synced_at
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?11)
  ON CONFLICT(product_id) DO UPDATE SET
    catalog_schema_version=excluded.catalog_schema_version,
    identity_digest=excluded.identity_digest,
    display_name=excluded.display_name,
    brand=excluded.brand,
    model=excluded.model,
    exact_variant=excluded.exact_variant,
    product_type=excluded.product_type,
    status=excluded.status,
    release_member=1,
    source_commit=excluded.source_commit,
    synced_at=excluded.synced_at`).bind(
    row.productId, row.catalogSchemaVersion, row.identityDigest, row.displayName, row.brand,
    row.model, row.exactVariant, row.productType, row.status, row.sourceCommit, row.syncedAt,
  ));
  if (projection.rows.length === 0) {
    statements.push(db.prepare(`UPDATE catalog_product_projection
      SET status='retired', release_member=0, source_commit=?1, synced_at=?2
      WHERE release_member<>0 OR status<>'retired'`).bind(projection.sourceCommit, projection.syncedAt));
  } else {
    const placeholders = projection.rows.map((_row, index) => `?${index + 3}`).join(', ');
    statements.push(db.prepare(`UPDATE catalog_product_projection
      SET status='retired', release_member=0, source_commit=?1, synced_at=?2
      WHERE release_member<>0 AND product_id NOT IN (${placeholders})`).bind(
      projection.sourceCommit, projection.syncedAt, ...projection.rows.map((row) => row.productId),
    ));
  }
  statements.push(db.prepare(`INSERT INTO runtime_release_markers (
    component, source_commit, schema_version, catalog_identity_digest, released_at
  ) VALUES ('catalog-projection', ?1, ?2, ?3, ?4)
  ON CONFLICT(component) DO UPDATE SET source_commit=excluded.source_commit,
    schema_version=excluded.schema_version,
    catalog_identity_digest=excluded.catalog_identity_digest,
    released_at=excluded.released_at`).bind(
    projection.sourceCommit, projection.schemaVersion, projection.catalogIdentityDigest, projection.syncedAt,
  ));
  return statements;
}

export async function syncCatalogProjection(db, projection) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') throw new Error('A D1-compatible DB binding is required.');
  return db.batch(projectionStatements(db, projection));
}
