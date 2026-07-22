export interface CatalogProductProjection {
  productId: string;
  catalogSchemaVersion: string;
  identityDigest: string;
  displayName: string;
  brand: string;
  model: string;
  exactVariant: string;
  productType: string;
  status: 'draft' | 'published' | 'retired';
  releaseMember: 0 | 1;
  sourceCommit: string;
  syncedAt: string;
}

export const H3_D1_BINDING = 'DB' as const;
export const H3_SCHEMA_VERSION = '1.0.0' as const;

// Runtime tables are created by drizzle/0001_h3_offer_foundation.sql. This
// file is deliberately dependency-free so the static Astro build does not
// require a D1 client or turn D1 into an authoring dependency.
