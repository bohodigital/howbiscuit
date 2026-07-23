import { evaluateSourcePolicy, sourcePolicySchema, sourceRuntimeFromEnvironment } from '../offers/source-policy.mjs';
import { affiliateProgramContract } from './providers.mjs';
import {
  affiliateProgramEligibilitySchema,
  affiliateRelationshipSchema,
  affiliateSpecialLinkSchema,
  unpaidDestinationSchema,
} from './schema.mjs';

const NO_PAID_LINKS_DISCLOSURE = Object.freeze({
  state: 'no-paid-links',
  linkText: 'How Biscuit receives no compensation from this unpaid link.',
  siteText: 'This build has no active affiliate links.',
  href: '/affiliate-disclosure/',
});

function unpaidFallback(destination, reason) {
  return Object.freeze({
    affiliateActive: false,
    reason,
    destination: Object.freeze({ ...destination }),
    disclosure: NO_PAID_LINKS_DISCLOSURE,
  });
}

function isApprovedTarget(url, allowedHosts) {
  const parsed = new URL(url);
  return allowedHosts.includes(parsed.hostname.toLowerCase());
}

export function disclosureForRelationship(relationship, contract = null) {
  if (relationship === 'unpaid') return NO_PAID_LINKS_DISCLOSURE;
  if (relationship !== 'affiliate-approved-public' || !contract) throw new Error('Unsupported public commercial relationship.');
  return Object.freeze({
    state: 'affiliate',
    linkText: contract.linkDisclosure,
    siteText: contract.siteDisclosure,
    href: '/affiliate-disclosure/',
  });
}

export function resolveAffiliateDestination({
  unpaidDestination: unpaidInput,
  relationship: relationshipInput,
  program: programInput,
  specialLink: specialLinkInput,
  sourcePolicy,
  environment = {},
  databaseSourceState = {},
  now = new Date(),
}) {
  const unpaidDestination = unpaidDestinationSchema.parse(unpaidInput);
  if (environment.AFFILIATE_LINKS_ENABLED !== 'true') return unpaidFallback(unpaidDestination, 'global-disabled');
  if (!relationshipInput || !programInput || !specialLinkInput || !sourcePolicy) return unpaidFallback(unpaidDestination, 'governance-incomplete');

  let relationship;
  let program;
  let specialLink;
  let parsedSourcePolicy;
  try {
    relationship = affiliateRelationshipSchema.parse(relationshipInput);
    program = affiliateProgramEligibilitySchema.parse(programInput);
    specialLink = affiliateSpecialLinkSchema.parse(specialLinkInput);
    parsedSourcePolicy = sourcePolicySchema.parse(sourcePolicy);
  } catch {
    return unpaidFallback(unpaidDestination, 'governance-invalid');
  }

  const contract = affiliateProgramContract(program.programId);
  if (!contract) return unpaidFallback(unpaidDestination, 'program-unsupported');
  if (
    contract.sourceId !== parsedSourcePolicy.sourceId
    || contract.sourceId !== program.sourceId
    || contract.merchantId !== program.merchantId
    || contract.merchantId !== relationship.merchantId
    || unpaidDestination.merchantId !== relationship.merchantId
    || unpaidDestination.canonicalProductId !== relationship.canonicalProductId
    || unpaidDestination.destinationId !== relationship.destinationId
    || relationship.programId !== program.programId
    || specialLink.relationshipId !== relationship.id
    || specialLink.destinationId !== relationship.destinationId
    || specialLink.sourceId !== program.sourceId
    || parsedSourcePolicy.killSwitch.environmentVariable !== contract.providerKillSwitch
  ) return unpaidFallback(unpaidDestination, 'identity-mismatch');

  if (program.status !== 'approved' || !program.publicActivationApproved || !program.databaseEnabled) return unpaidFallback(unpaidDestination, 'program-disabled');
  if (Date.parse(program.reviewedAt) > now.valueOf()) return unpaidFallback(unpaidDestination, 'program-not-yet-reviewed');
  if (relationship.relationship !== 'affiliate-approved-public' || !relationship.publicActivationApproved) return unpaidFallback(unpaidDestination, 'relationship-disabled');
  if (Date.parse(relationship.enabledAt) > now.valueOf()) return unpaidFallback(unpaidDestination, 'relationship-not-yet-enabled');
  if (specialLink.status !== 'approved-public') return unpaidFallback(unpaidDestination, 'special-link-disabled');
  if (Date.parse(specialLink.approvedAt) > now.valueOf()) return unpaidFallback(unpaidDestination, 'special-link-not-yet-approved');
  if (!isApprovedTarget(specialLink.approvedUrl, contract.allowedTargetHosts)) return unpaidFallback(unpaidDestination, 'special-link-host-rejected');

  const sourceRuntime = sourceRuntimeFromEnvironment(parsedSourcePolicy, environment, databaseSourceState);
  const sourceState = evaluateSourcePolicy(parsedSourcePolicy, sourceRuntime, now);
  if (sourceState !== 'healthy') return unpaidFallback(unpaidDestination, `source-${sourceState}`);

  return Object.freeze({
    affiliateActive: true,
    reason: 'affiliate-approved-public',
    destination: Object.freeze({
      destinationId: relationship.destinationId,
      canonicalProductId: relationship.canonicalProductId,
      merchantId: relationship.merchantId,
      merchant: unpaidDestination.merchant,
      exactUrl: specialLink.approvedUrl,
      relationship: relationship.relationship,
      sourceId: program.sourceId,
      programId: program.programId,
      relationshipId: relationship.id,
    }),
    disclosure: disclosureForRelationship(relationship.relationship, contract),
  });
}
