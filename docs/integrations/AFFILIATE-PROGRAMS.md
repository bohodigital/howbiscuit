# Affiliate program integration boundary

Status: infrastructure implemented, all programs production-disabled.

The runtime resolver consumes the existing canonical unpaid destination and optional D1 affiliate governance records. It emits a paid destination only when program approval, API eligibility, current terms evidence, an approved Special Link, public activation, database enablement, the source policy, `AFFILIATE_LINKS_ENABLED`, and the provider kill switch all pass. Any missing, malformed, expired, mismatched, or disabled record returns the unchanged unpaid destination and the no-paid-links disclosure. Article packages are not rewritten.

## Amazon Associates and Creators API

Amazon requires final Associates acceptance before Creators API registration. The current official documentation also requires qualifying sales, a registered Creators API application, credential ID/secret/version, a marketplace Partner Tag, compliant Special Links, a nearby link disclosure, and the required site statement. How Biscuit has not proven any of those account-specific approvals. `amazon-creators` therefore remains `requires-review`, has a zero-dollar application ceiling, and has no transport implementation or active relationship row.

Required secrets after approval: `AMAZON_CREATORS_CLIENT_ID`, `AMAZON_CREATORS_CLIENT_SECRET`, and `AMAZON_ASSOCIATES_PARTNER_TAG`. They must be server-only, separately provisioned by environment, rotated through Associates Central, and revoked there if compromised. The source and global kill switches are `AMAZON_ENABLED` and `AFFILIATE_LINKS_ENABLED`.

Official review sources:

- <https://affiliate-program.amazon.com/creatorsapi/docs/>
- <https://affiliate-program.amazon.com/creatorsapi/docs/en-us/onboarding/register-for-creators-api>
- <https://affiliate-program.amazon.com/help/operating/agreement/>
- <https://affiliate-program.amazon.com/help/node/topic/GHQNZAU6669EZS98>

## eBay Browse API and Partner Network

eBay describes Buy APIs as limited-release production integrations. Production use requires an EPN account, approved business model and application, Developer Support review, signed contracts, and explicit production enablement. Affiliate tracking and close-proximity disclosure are also required for revenue share. How Biscuit has not proven those approvals. `ebay-browse` therefore remains `requires-review`, has a zero-dollar application ceiling, and has no production adapter, tracking link, or active relationship row.

Required secrets after approval: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, and `EBAY_EPN_CAMPAIGN_ID`. They must be server-only, separately provisioned by environment, rotated in the eBay developer/EPN accounts, and revoked there if compromised. The source and global kill switches are `EBAY_ENABLED` and `AFFILIATE_LINKS_ENABLED`.

Official review sources:

- <https://developer.ebay.com/api-docs/buy/buy-requirements.html>
- <https://developer.ebay.com/api-docs/buy/api-browse.html>
- <https://developer.ebay.com/join/api-license-agreement>
- <https://partnernetwork.ebay.com/page/network-agreement>
- <https://partnernetwork.ebay.com/resources/affiliate-disclosure-faq>

## Activation and rollback

Activation is per program and requires owner evidence IDs in D1, a reviewed public source policy, an approved exact Special Link, owner approval, and both switches. Disabling either switch or either D1 enablement field restores unpaid links immediately without rebuilding articles. A full rollback removes or disables the H3F D1 rows and leaves static Handoff 2 product content intact.
