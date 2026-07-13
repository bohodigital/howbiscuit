export const FREE_TAX_PRODUCTS = Object.freeze([
  'general',
  'groceries',
  'alcohol',
  'cigarettes',
  'nicotine',
  'cannabis',
]);

export const SST_FULL_MEMBER_STATES = Object.freeze([
  'AR', 'GA', 'IN', 'IA', 'KS', 'KY', 'MI', 'MN', 'NE', 'NV', 'NJ', 'NC',
  'ND', 'OH', 'OK', 'RI', 'SD', 'UT', 'VT', 'WA', 'WV', 'WI', 'WY',
]);

export const SST_ASSOCIATE_STATES = Object.freeze(['TN']);

export const FREE_TAX_STATES = Object.freeze([
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'],
  ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'],
  ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([code, name]) => ({
  code,
  name,
  generalStrategy: SST_FULL_MEMBER_STATES.includes(code) || SST_ASSOCIATE_STATES.includes(code)
    ? 'sst-rate-boundary'
    : 'state-adapter',
  groceryStrategy: SST_FULL_MEMBER_STATES.includes(code) || SST_ASSOCIATE_STATES.includes(code)
    ? 'sst-food-rate-and-matrix'
    : 'state-adapter',
  specialStrategy: 'federal-state-feed-plus-local-adapter',
})));

export const PUBLIC_STATE_BASE_RATES = Object.freeze({
  AL: 4, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35, DE: 0,
  DC: 6, FL: 6, GA: 4, HI: 4, ID: 6, IL: 6.25, IN: 7, IA: 6, KS: 6.5,
  KY: 6, LA: 5, ME: 5.5, MD: 6, MA: 6.25, MI: 6, MN: 6.875, MS: 7,
  MO: 4.225, MT: 0, NE: 5.5, NV: 6.85, NH: 0, NJ: 6.625, NM: 4.875,
  NY: 4, NC: 4.75, ND: 5, OH: 5.75, OK: 4.5, OR: 0, PA: 6, RI: 7,
  SC: 6, SD: 4.2, TN: 7, TX: 6.25, UT: 6.1, VT: 6, VA: 5.3, WA: 6.5,
  WV: 6, WI: 5, WY: 4,
});

export const PUBLIC_TAX_SOURCES = Object.freeze([
  {
    id: 'sst-rates',
    title: 'Streamlined Sales Tax rate files',
    authority: 'state-published',
    url: 'https://www.streamlinedsalestax.org/ratesandboundry/Rates/',
    products: ['general', 'groceries'],
    cadence: 'quarterly-plus-corrections',
    keyRequired: false,
    ingestion: 'pi-file-adapter',
  },
  {
    id: 'sst-boundaries',
    title: 'Streamlined Sales Tax boundary files',
    authority: 'state-published',
    url: 'https://www.streamlinedsalestax.org/ratesandboundry/Boundary/',
    products: ['general', 'groceries'],
    cadence: 'quarterly-plus-corrections',
    keyRequired: false,
    ingestion: 'pi-file-adapter',
  },
  {
    id: 'sst-taxability',
    title: 'Streamlined Sales Tax state taxability matrices',
    authority: 'state-certified',
    url: 'https://www.streamlinedsalestax.org/Shared-Pages/State-taxability-matrix',
    products: ['groceries', 'alcohol'],
    cadence: 'annual-plus-change-notices',
    keyRequired: false,
    ingestion: 'pi-review-adapter',
  },
  {
    id: 'census-geocoder',
    title: 'U.S. Census Geocoding Services',
    authority: 'federal',
    url: 'https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html',
    products: [],
    cadence: 'current-benchmark',
    keyRequired: false,
    ingestion: 'worker-live-api',
  },
  {
    id: 'cloudflare-visitor-location',
    title: 'Cloudflare request location metadata',
    authority: 'platform-derived',
    url: 'https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties',
    products: [],
    cadence: 'per-request',
    keyRequired: false,
    ingestion: 'worker-request-metadata',
  },
  {
    id: 'zippopotam-postal',
    title: 'Zippopotam U.S. postal locations',
    authority: 'public-open-data',
    url: 'https://api.zippopotam.us/',
    products: [],
    cadence: 'live-api',
    keyRequired: false,
    ingestion: 'worker-live-api',
  },
  {
    id: 'cdc-cigarettes',
    title: 'CDC STATE combustible tobacco tax data',
    authority: 'federal',
    url: 'https://data.cdc.gov/resource/ebcc-3d5i.json',
    products: ['cigarettes'],
    cadence: 'quarterly',
    keyRequired: false,
    optionalKey: 'CDC_SOCRATA_APP_TOKEN',
    ingestion: 'worker-live-api-and-pi-snapshot',
  },
  {
    id: 'cdc-vaping',
    title: 'CDC STATE e-cigarette tax data',
    authority: 'federal',
    url: 'https://data.cdc.gov/resource/kwbr-syv2.json',
    products: ['nicotine'],
    cadence: 'quarterly',
    keyRequired: false,
    optionalKey: 'CDC_SOCRATA_APP_TOKEN',
    ingestion: 'worker-live-api-and-pi-snapshot',
  },
  {
    id: 'fta-special-taxes',
    title: 'Federation of Tax Administrators special-tax tables',
    authority: 'state-tax-administrator-compiled',
    url: 'https://taxadmin.org/tax-rates-new/',
    products: ['alcohol', 'cigarettes', 'nicotine', 'cannabis'],
    cadence: 'source-specific',
    keyRequired: false,
    ingestion: 'pi-document-adapter-with-review',
  },
  {
    id: 'state-tax-agencies',
    title: 'Official state rate and lookup directory',
    authority: 'state',
    url: 'https://www.streamlinedsalestax.org/contacts/state-contact-information',
    products: FREE_TAX_PRODUCTS,
    cadence: 'source-specific',
    keyRequired: false,
    ingestion: 'state-adapters',
  },
]);

export function publicCoverageSummary() {
  return {
    jurisdictionCount: FREE_TAX_STATES.length,
    sstFullMemberCount: SST_FULL_MEMBER_STATES.length,
    sstAssociateCount: SST_ASSOCIATE_STATES.length,
    products: FREE_TAX_PRODUCTS,
    sources: PUBLIC_TAX_SOURCES,
    states: FREE_TAX_STATES,
    accountRequirements: {
      required: [],
      optional: ['CDC Socrata application token for higher request limits'],
      platform: ['Cloudflare D1 binding named DB', 'Cloudflare R2 binding named SOURCE_ARCHIVE'],
    },
  };
}
