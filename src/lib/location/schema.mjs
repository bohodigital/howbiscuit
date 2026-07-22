import { z } from 'zod';

const httpsUrl = z.url().refine((value) => new URL(value).protocol === 'https:', 'HTTPS URL required');
const instant = z.iso.datetime({ offset: true });
const date = z.preprocess((value) => value instanceof Date ? value.toISOString().slice(0, 10) : value, z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const zipCodeSchema = z.string().regex(/^\d{5}$/);

export const datasetManifestSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  datasetId: identifier,
  publisher: z.string().trim().min(1).max(160),
  datasetName: z.string().trim().min(1).max(200),
  vintage: z.string().trim().min(1).max(40),
  retrievedAt: date,
  sourceUrl: httpsUrl,
  publicUseBasis: z.string().trim().min(10).max(500),
  fileSha256: digest,
  importScriptVersion: z.literal('1.0.0'),
  rowCounts: z.object({ input: z.number().int().nonnegative(), accepted: z.number().int().nonnegative(), rejected: z.number().int().nonnegative() }).strict(),
  validationResults: z.array(z.string().trim().min(1).max(300)).min(1).max(30),
}).strict().superRefine((manifest, context) => {
  if (manifest.rowCounts.accepted + manifest.rowCounts.rejected !== manifest.rowCounts.input) {
    context.addIssue({ code: 'custom', path: ['rowCounts'], message: 'Accepted and rejected rows must equal input rows.' });
  }
});

const weightedCounty = z.object({ countyFips: z.string().regex(/^\d{5}$/), weight: z.number().positive().max(1) }).strict();
const weightedCbsa = z.object({ cbsa: z.string().regex(/^\d{5}$/), weight: z.number().positive().max(1), metroSlug: identifier.nullable() }).strict();

export const storedLocationProfileSchema = z.object({
  zip: zipCodeSchema,
  zcta: zipCodeSchema.nullable(),
  centroid: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict().nullable(),
  primaryCountyFips: z.string().regex(/^\d{5}$/).nullable(),
  countyWeights: z.array(weightedCounty).min(1),
  cbsaWeights: z.array(weightedCbsa),
  primaryCbsa: z.string().regex(/^\d{5}$/).nullable(),
  metroSlug: identifier.nullable(),
  censusVintage: z.string().min(1),
  hudVintage: z.string().min(1),
  ambiguity: z.object({ county: z.boolean(), cbsa: z.boolean(), zctaApproximation: z.boolean() }).strict(),
}).strict();

export const resolvedLocationSchema = storedLocationProfileSchema.extend({
  inputZip: zipCodeSchema,
  resolvedAt: instant,
  sessionToken: z.uuid(),
  sessionExpiresAt: instant,
  boundaryNotice: z.literal('ZIP codes are USPS delivery constructs; ZCTAs and weighted county/metro mappings are statistical approximations.'),
}).strict();

export const metroProfileSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  metroSlug: identifier,
  displayName: z.string().trim().min(2).max(100),
  cbsaCodes: z.array(z.string().regex(/^\d{5}$/)).min(1).max(8),
  geographicScope: z.string().trim().min(80).max(1200),
  shoppingContext: z.array(z.string().trim().min(60).max(800)).min(2).max(8),
  supportedRetailers: z.array(identifier).max(20),
  supportedCategories: z.array(z.string().trim().min(2).max(80)).max(20),
  censusVintage: z.string().min(1),
  hudVintage: z.string().min(1),
  lastStaticUpdate: date,
  indexStatus: z.enum(['draft-noindex', 'substantive-indexable']),
}).strict();

export const outboundEventInputSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal('outbound-shopping-click'),
  pageId: identifier,
  canonicalProductId: identifier.nullable().optional(),
  merchantId: identifier,
  destinationId: identifier,
  relationship: z.enum(['unpaid', 'affiliate-approved-disabled', 'affiliate-approved-preview', 'affiliate-approved-public']),
  metroSlug: identifier.nullable().optional(),
  sessionToken: z.uuid(),
}).strict();

export const LOCATION_SESSION_TTL_SECONDS = 30 * 60;
export const OUTBOUND_EVENT_TTL_SECONDS = 90 * 24 * 60 * 60;
