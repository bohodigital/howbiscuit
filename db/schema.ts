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

export interface AffiliateProgramEligibility {
  programId: string;
  sourceId: string;
  merchantId: string;
  status: 'pending' | 'approved' | 'suspended' | 'retired';
  programApprovalEvidenceId: string | null;
  apiEligibilityEvidenceId: string | null;
  termsReviewEvidenceId: string | null;
  publicActivationApproved: 0 | 1;
  databaseEnabled: 0 | 1;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateSpecialLink {
  destinationId: string;
  relationshipId: string;
  sourceId: string;
  approvedUrl: string;
  approvalEvidenceId: string;
  status: 'approved-disabled' | 'approved-preview' | 'approved-public' | 'retired';
  approvedAt: string;
  updatedAt: string;
}

export const H3_D1_BINDING = 'DB' as const;
export const H3_SCHEMA_VERSION = '1.0.0' as const;
export const H3_CONTENT_DATA_SCHEMA_VERSION = '1.0.0' as const;

// Runtime tables are created by the ordered migrations under drizzle/. This
// file is deliberately dependency-free so the static Astro build does not
// require a D1 client or turn D1 into an authoring dependency.
