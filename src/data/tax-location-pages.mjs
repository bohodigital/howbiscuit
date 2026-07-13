import { stateTaxRates, taxRateSource } from '../lib/calculators/us-data.mjs';
import { SST_ASSOCIATE_STATES, SST_FULL_MEMBER_STATES } from '../lib/tax-source-registry.mjs';

const slugify = (value) => value
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');

const streamlinedStates = new Set([...SST_FULL_MEMBER_STATES, ...SST_ASSOCIATE_STATES]);

export const canonicalSalesTaxPath = '/tools/cost-estimators/sales-tax/';
export const taxLocationDirectoryPath = `${canonicalSalesTaxPath}locations/`;

export const stateTaxPages = Object.freeze(stateTaxRates.map((state) => ({
  kind: 'state',
  slug: slugify(state.name),
  label: state.name,
  stateCode: state.code,
  stateRate: state.stateRate,
  title: `${state.name} Sales Tax Calculator (2026)`,
  description: state.stateRate === 0
    ? `Estimate a purchase in ${state.name}, starting with its 0% statewide general sales tax rate and allowing for local or product-specific taxes.`
    : `Estimate a purchase in ${state.name} with the ${state.stateRate}% statewide general sales tax rate, then add local or product-specific taxes when they apply.`,
  sourceStrategy: streamlinedStates.has(state.code) ? 'streamlined' : 'state-adapter',
})));

// The first 15 markets follow the Census Bureau's Vintage 2025 population ranking.
// Additional entries cover large or commercially significant regional markets.
const metroRows = [
  ['nyc', 'New York City', 'NY', '10001', 1, 'nyc-general', false],
  ['los-angeles', 'Los Angeles', 'CA', '90012', 2],
  ['chicago', 'Chicago', 'IL', '60601', 3],
  ['houston', 'Houston', 'TX', '77002', 4],
  ['phoenix', 'Phoenix', 'AZ', '85004', 5],
  ['philadelphia', 'Philadelphia', 'PA', '19103', 6],
  ['san-antonio', 'San Antonio', 'TX', '78205', 7],
  ['san-diego', 'San Diego', 'CA', '92101', 8],
  ['dallas', 'Dallas', 'TX', '75201', 9],
  ['fort-worth', 'Fort Worth', 'TX', '76102', 10],
  ['jacksonville', 'Jacksonville', 'FL', '32202', 11],
  ['austin', 'Austin', 'TX', '78701', 12],
  ['san-jose', 'San Jose', 'CA', '95113', 13],
  ['charlotte', 'Charlotte', 'NC', '28202', 14],
  ['columbus', 'Columbus', 'OH', '43215', 15],
  ['seattle', 'Seattle', 'WA', '98101'],
  ['nashville', 'Nashville', 'TN', '37219'],
  ['atlanta', 'Atlanta', 'GA', '30303'],
  ['miami', 'Miami', 'FL', '33131'],
  ['washington-dc', 'Washington, DC', 'DC', '20001'],
  ['las-vegas', 'Las Vegas', 'NV', '89101'],
  ['denver', 'Denver', 'CO', '80202'],
  ['boston', 'Boston', 'MA', '02108'],
  ['san-francisco', 'San Francisco', 'CA', '94102'],
  ['portland', 'Portland', 'OR', '97205'],
];

export const metroTaxPages = Object.freeze(metroRows.map(([
  slug,
  label,
  stateCode,
  postalCode,
  censusRank,
  presetId,
  autoLookup = true,
]) => {
  const state = stateTaxRates.find(({ code }) => code === stateCode);
  if (!state) throw new Error(`Unknown state code for ${label}: ${stateCode}`);
  return {
    kind: 'metro',
    slug,
    label,
    stateCode,
    stateName: state.name,
    stateRate: state.stateRate,
    postalCode,
    censusRank,
    presetId,
    autoLookup,
    title: `${label} Sales Tax Calculator (2026)`,
    description: `Estimate sales tax for a purchase in ${label}. Start with a representative ${postalCode} ZIP and load the current available state, county, city, and district rate lines.`,
    sourceStrategy: streamlinedStates.has(stateCode) ? 'streamlined' : 'state-adapter',
  };
}));

export const allTaxLocationPages = Object.freeze([...stateTaxPages, ...metroTaxPages]);

export const taxLocationPagePath = (page) => `${canonicalSalesTaxPath}${page.slug}/`;

export const taxLocationSource = Object.freeze({
  ...taxRateSource,
  censusTitle: 'U.S. Census Bureau Vintage 2025 City and Town Population Estimates',
  censusUrl: 'https://www.census.gov/newsroom/press-releases/2026/vintage-2025-city-town-pop-estimates.html',
});

export function relatedTaxLocationPages(page, limit = 6) {
  const sameState = allTaxLocationPages.filter((candidate) => (
    candidate.slug !== page.slug && candidate.stateCode === page.stateCode
  ));
  const others = stateTaxPages.filter((candidate) => (
    candidate.slug !== page.slug && candidate.stateCode !== page.stateCode
  ));
  return [...sameState, ...others].slice(0, limit);
}
