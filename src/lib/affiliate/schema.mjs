import { z } from 'zod';

import { identifier } from '../offers/schema.mjs';

export const AFFILIATE_SCHEMA_VERSION = '1.0.0';
const instant = z.iso.datetime({ offset: true });
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const httpsUrl = z.url().superRefine((value, context) => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') context.addIssue({ code: 'custom', message: 'HTTPS URL required.' });
  if (parsed.username || parsed.password || parsed.hash) context.addIssue({ code: 'custom', message: 'Credentials and fragments are forbidden.' });
});

export const affiliateProgramEligibilitySchema = z.object({
  programId: identifier,
  sourceId: identifier,
  merchantId: identifier,
  status: z.enum(['pending', 'approved', 'suspended', 'retired']),
  programApprovalEvidenceId: identifier.nullable(),
  apiEligibilityEvidenceId: identifier.nullable(),
  termsReviewEvidenceId: identifier.nullable(),
  publicActivationApproved: z.boolean(),
  databaseEnabled: z.boolean(),
  reviewedAt: instant.nullable(),
}).strict().superRefine((program, context) => {
  const evidence = [program.programApprovalEvidenceId, program.apiEligibilityEvidenceId, program.termsReviewEvidenceId, program.reviewedAt];
  if (program.status === 'approved' && evidence.some((value) => value === null)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Approved programs require program, API, terms, and reviewer evidence.' });
  }
  if (program.publicActivationApproved && program.status !== 'approved') {
    context.addIssue({ code: 'custom', path: ['publicActivationApproved'], message: 'Public activation requires approved program status.' });
  }
  if (program.databaseEnabled && !program.publicActivationApproved) {
    context.addIssue({ code: 'custom', path: ['databaseEnabled'], message: 'Database enablement requires public activation approval.' });
  }
});

export const affiliateRelationshipSchema = z.object({
  id: identifier,
  canonicalProductId: identifier,
  merchantId: identifier,
  destinationId: identifier,
  relationship: z.enum(['affiliate-pending', 'affiliate-approved-disabled', 'affiliate-approved-preview', 'affiliate-approved-public', 'retired']),
  programId: identifier,
  disclosurePolicyId: identifier,
  publicActivationApproved: z.boolean(),
  enabledAt: instant.nullable(),
}).strict().superRefine((relationship, context) => {
  if (relationship.relationship === 'affiliate-approved-public' && (!relationship.publicActivationApproved || relationship.enabledAt === null)) {
    context.addIssue({ code: 'custom', path: ['relationship'], message: 'Public affiliate relationships require approval and an enablement time.' });
  }
  if (relationship.publicActivationApproved && relationship.relationship !== 'affiliate-approved-public') {
    context.addIssue({ code: 'custom', path: ['publicActivationApproved'], message: 'Only public affiliate relationships may carry public approval.' });
  }
});

export const affiliateSpecialLinkSchema = z.object({
  destinationId: identifier,
  relationshipId: identifier,
  sourceId: identifier,
  approvedUrl: httpsUrl,
  approvalEvidenceId: identifier,
  status: z.enum(['approved-disabled', 'approved-preview', 'approved-public', 'retired']),
  approvedAt: instant,
}).strict();

export const unpaidDestinationSchema = z.object({
  destinationId: identifier,
  canonicalProductId: identifier,
  merchantId: identifier,
  merchant: z.string().trim().min(1).max(120),
  exactUrl: httpsUrl,
  capturedDate: calendarDate,
  relationship: z.literal('unpaid'),
}).strict();
