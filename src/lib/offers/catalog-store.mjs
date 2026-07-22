import { canonicalJson } from './canonical-json.mjs';

export async function getProjectedProduct(db, productId) {
  return db.prepare(`SELECT product_id AS productId, status, source_commit AS sourceCommit,
      release_member AS releaseMember
    FROM catalog_product_projection WHERE product_id=?1 AND release_member=1`).bind(productId).first();
}

export async function getCatalogReleaseMarker(db) {
  return db.prepare(`SELECT source_commit AS sourceCommit,
      catalog_identity_digest AS catalogIdentityDigest,
      schema_version AS schemaVersion
    FROM runtime_release_markers WHERE component='catalog-projection'`).first();
}

export async function getActiveMerchantMapping(db, merchantId, merchantProductId) {
  return db.prepare(`SELECT canonical_product_id AS canonicalProductId,
      match_confidence AS matchConfidence,
      match_evidence_json AS matchEvidenceJson,
      reviewed_by AS reviewedBy,
      reviewed_at AS reviewedAt,
      status
    FROM merchant_products
    WHERE merchant_id=?1 AND merchant_product_id=?2 AND status='active'`).bind(merchantId, merchantProductId).first();
}

export async function getCatalogProjectionRows(db) {
  const result = await db.prepare(`SELECT product_id AS productId,
      catalog_schema_version AS catalogSchemaVersion,
      identity_digest AS identityDigest,
      display_name AS displayName,
      brand,
      model,
      exact_variant AS exactVariant,
      product_type AS productType,
      status,
      source_commit AS sourceCommit
    FROM catalog_product_projection
    WHERE release_member=1
    ORDER BY product_id`).all();
  return result?.results || [];
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function catalogReleaseHealth(db, staticCommit) {
  if (!db || !/^[0-9a-f]{40}$/.test(String(staticCommit || ''))) return { ready: false, reason: 'configuration-invalid' };
  try {
    const [marker, rows] = await Promise.all([getCatalogReleaseMarker(db), getCatalogProjectionRows(db)]);
    if (!marker || marker.schemaVersion !== '1.0.0' || marker.sourceCommit !== staticCommit || !/^[0-9a-f]{64}$/.test(marker.catalogIdentityDigest || '')) {
      return { ready: false, reason: 'release-marker-mismatch' };
    }
    if (rows.some((row) => row.sourceCommit !== staticCommit)) return { ready: false, reason: 'projection-commit-mismatch' };
    const digest = await sha256(canonicalJson(rows));
    return digest === marker.catalogIdentityDigest
      ? { ready: true, reason: 'ready', marker }
      : { ready: false, reason: 'projection-digest-mismatch' };
  } catch {
    return { ready: false, reason: 'database-unavailable' };
  }
}
