import { z } from 'zod';

import { adapterHealthState, identifier } from './schema.mjs';

export const SOURCE_POLICY_SCHEMA_VERSION = '1.0.0';
const httpsUrl = z.url().refine((value) => new URL(value).protocol === 'https:', 'HTTPS URL required');
const calendarDate = z.preprocess(
  (value) => value instanceof Date ? value.toISOString().slice(0, 10) : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Real calendar date required'),
);
const storageRule = z.object({
  allowed: z.union([z.boolean(), z.enum(['provider-rules', 'ephemeral-only'])]),
  maximumSeconds: z.number().int().nonnegative().nullable(),
}).strict();

export const sourcePolicySchema = z.object({
  schemaVersion: z.literal(SOURCE_POLICY_SCHEMA_VERSION),
  sourceId: identifier,
  adapterId: identifier,
  displayName: z.string().trim().min(1).max(120),
  lifecycle: z.enum(['active', 'excluded', 'deferred']).default('active'),
  internalResearchApproved: z.boolean().default(false),
  releaseMembership: z.boolean().default(false),
  datasets: z.array(identifier).max(50).default([]),
  claimPolicy: z.object({
    permitted: z.array(z.string().trim().min(1).max(240)).max(30),
    forbidden: z.array(z.string().trim().min(1).max(240)).max(30),
  }).strict().default({ permitted: [], forbidden: [] }),
  scope: z.object({
    merchantIds: z.array(identifier).min(1).max(20),
  }).strict(),
  enabledByDefault: z.literal(false),
  publicActivationApproved: z.boolean(),
  legalBasis: z.object({
    type: z.enum(['official-api', 'licensed-feed', 'reviewed-public-dataset', 'reviewed-manual', 'fixture']),
    termsUrl: httpsUrl.nullable(),
    documentationUrl: httpsUrl.nullable(),
    termsExpiresAt: calendarDate.nullable(),
    accountApprovalRequired: z.boolean(),
  }).strict(),
  review: z.object({
    reviewedAt: calendarDate,
    reviewedBy: z.string().trim().min(1).max(120),
    reviewDueAt: calendarDate,
    evidenceIds: z.array(identifier).min(1),
    comparisonStatus: z.enum(['approved', 'requires-review', 'prohibited']),
  }).strict(),
  credentials: z.object({
    required: z.boolean(),
    secretNames: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/)),
    clientExposureAllowed: z.literal(false),
  }).strict(),
  storage: z.object({
    productIdentifier: storageRule,
    storeIdentifier: storageRule,
    price: storageRule,
    availability: storageRule,
    image: storageRule,
    rawResponse: storageRule,
  }).strict(),
  display: z.object({
    attributionRequired: z.boolean(),
    timestampRequired: z.boolean(),
    merchantNameRequired: z.boolean(),
    logoRequired: z.union([z.boolean(), z.literal('provider-rules')]),
    affiliateDisclosureRequired: z.union([z.boolean(), z.literal('relationship-dependent')]),
    directLinkRequired: z.boolean(),
  }).strict(),
  refresh: z.object({
    normalTtlSeconds: z.number().int().positive(),
    hardExpirySeconds: z.number().int().positive(),
    staleWhileRevalidateAllowed: z.boolean(),
  }).strict(),
  limits: z.object({
    requestsPerSecond: z.number().positive(),
    requestsPerDay: z.number().int().positive(),
    applicationDailyBudget: z.number().int().positive(),
    applicationMonthlyBudget: z.number().int().positive(),
    paidMonthlyCeilingUsd: z.number().nonnegative(),
  }).strict(),
  matching: z.object({
    acceptedConfidence: z.array(z.enum(['exact-retailer-sku', 'exact-gtin', 'exact-mpn-brand', 'exact-asin-child', 'verified-model-variant'])).min(1),
    probableMayCompare: z.literal(false),
  }).strict(),
  failure: z.object({
    showStalePrice: z.literal(false),
    fallback: z.enum(['check-current-price-link', 'no-price', 'regional-context-only']),
    automaticDisableAfterConsecutiveFailures: z.number().int().positive(),
    cooldownSeconds: z.number().int().positive(),
    maximumRetryCount: z.number().int().nonnegative(),
    disableOnTermsExpiry: z.literal(true),
    disableOnAuthenticationFailure: z.literal(true),
    disableOnBudgetExhaustion: z.literal(true),
  }).strict(),
  killSwitch: z.object({
    environmentVariable: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
    databaseDisableAllowed: z.literal(true),
  }).strict(),
}).strict().superRefine((policy, context) => {
  if (policy.review.reviewDueAt <= policy.review.reviewedAt) context.addIssue({ code: 'custom', path: ['review', 'reviewDueAt'], message: 'Review due date must follow review date.' });
  if (policy.refresh.hardExpirySeconds < policy.refresh.normalTtlSeconds) context.addIssue({ code: 'custom', path: ['refresh', 'hardExpirySeconds'], message: 'Hard expiry cannot be shorter than normal TTL.' });
  if (policy.credentials.required !== (policy.credentials.secretNames.length > 0)) context.addIssue({ code: 'custom', path: ['credentials', 'secretNames'], message: 'Required credentials must declare secret names and credential-free policies must not.' });
  if (policy.legalBasis.type !== 'fixture' && (!policy.legalBasis.termsUrl || !policy.legalBasis.documentationUrl || !policy.legalBasis.termsExpiresAt)) context.addIssue({ code: 'custom', path: ['legalBasis'], message: 'Non-fixture sources require current terms, documentation, and an explicit review expiry.' });
  if (policy.lifecycle === 'excluded' && (policy.internalResearchApproved || policy.publicActivationApproved || policy.releaseMembership)) {
    context.addIssue({ code: 'custom', path: ['lifecycle'], message: 'Excluded sources cannot be enabled for research, public activation, or release membership.' });
  }
  if (policy.releaseMembership && !policy.internalResearchApproved) {
    context.addIssue({ code: 'custom', path: ['releaseMembership'], message: 'Release members require internal research approval.' });
  }
});

export function evaluateSourcePolicy(policyInput, runtime = {}, now = new Date()) {
  const policy = sourcePolicySchema.parse(policyInput);
  if (policy.lifecycle === 'excluded') return 'retired';
  if (policy.lifecycle !== 'active') return 'policy-disabled';
  if (runtime.retired) return 'retired';
  if (policy.review.comparisonStatus !== 'approved') return 'policy-disabled';
  if (policy.legalBasis.termsExpiresAt && policy.legalBasis.termsExpiresAt < now.toISOString().slice(0, 10)) return 'terms-review-required';
  if (policy.review.reviewDueAt < now.toISOString().slice(0, 10)) return 'terms-review-required';
  if (!policy.publicActivationApproved || runtime.databaseEnabled !== true) return 'policy-disabled';
  if (runtime.killSwitchEnabled !== true) return 'disabled';
  if (runtime.authenticationFailed) return 'authentication-failed';
  if (runtime.budgetExhausted) return 'budget-exhausted';
  if (runtime.quotaLimited) return 'quota-limited';
  if (runtime.healthState) return adapterHealthState.parse(runtime.healthState);
  return 'healthy';
}

export function sourceRuntimeFromEnvironment(policyInput, environment, databaseState = {}) {
  const policy = sourcePolicySchema.parse(policyInput);
  return Object.freeze({
    databaseEnabled: databaseState.enabled === true,
    killSwitchEnabled: environment?.[policy.killSwitch.environmentVariable] === 'true',
    authenticationFailed: databaseState.authenticationFailed === true,
    budgetExhausted: databaseState.budgetExhausted === true,
    quotaLimited: databaseState.quotaLimited === true,
    retired: databaseState.retired === true,
    healthState: databaseState.healthState,
  });
}
