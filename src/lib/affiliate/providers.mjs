export const AFFILIATE_PROGRAM_CONTRACTS = Object.freeze({
  'amazon-associates-us': Object.freeze({
    programId: 'amazon-associates-us',
    sourceId: 'amazon-creators',
    merchantId: 'amazon',
    providerKillSwitch: 'AMAZON_ENABLED',
    allowedTargetHosts: Object.freeze(['amazon.com', 'www.amazon.com']),
    linkDisclosure: 'Paid link. How Biscuit may earn from qualifying Amazon purchases.',
    siteDisclosure: 'As an Amazon Associate I earn from qualifying purchases.',
    implementationState: 'eligibility-not-proven',
  }),
  'ebay-partner-network-us': Object.freeze({
    programId: 'ebay-partner-network-us',
    sourceId: 'ebay-browse',
    merchantId: 'ebay',
    providerKillSwitch: 'EBAY_ENABLED',
    allowedTargetHosts: Object.freeze(['ebay.com', 'www.ebay.com']),
    linkDisclosure: 'Paid link. How Biscuit may earn a commission from this eBay purchase.',
    siteDisclosure: 'How Biscuit may earn commissions from qualifying eBay purchases.',
    implementationState: 'eligibility-not-proven',
  }),
});

export function affiliateProgramContract(programId) {
  return AFFILIATE_PROGRAM_CONTRACTS[programId] || null;
}
