export const taxTableNames = {
  sources: 'tax_sources',
  revisions: 'tax_source_revisions',
  locations: 'tax_locations',
  components: 'tax_components',
  productRules: 'tax_product_rules',
  ingestionRuns: 'tax_ingestion_runs',
  reviewQueue: 'tax_review_queue',
} as const;

export type TaxConfidence =
  | 'official-address'
  | 'official-zip4'
  | 'official-zip5'
  | 'official-state'
  | 'official-state-rule'
  | 'state-reference'
  | 'location-only';

export type TaxProduct =
  | 'general'
  | 'groceries'
  | 'alcohol'
  | 'cigarettes'
  | 'nicotine'
  | 'cannabis';

export type TaxComponentRecord = {
  componentId: string;
  locationId: string | null;
  stateCode: string;
  productCode: TaxProduct;
  jurisdictionType: string;
  jurisdictionCode: string | null;
  jurisdictionName: string;
  ratePercent: number | null;
  unitAmount: number | null;
  unitBasis: string | null;
  includedInPrice: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  sourceId: string;
  sourceRevision: string;
  citation: string | null;
};

// The executable schema is kept in drizzle/0000_free_tax_data.sql so Sites can
// apply it to D1 during packaging. Runtime code accesses D1 through one helper
// in src/lib/free-tax-data.mjs rather than spreading binding logic through UI.
