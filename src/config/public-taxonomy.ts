/**
 * Owner-approved target taxonomy and migration contracts for How Biscuit Handoff 1.
 *
 * Phase C activates this owner-approved taxonomy as the single public navigation
 * and classification contract. Topic routes remain threshold-gated: zero eligible
 * guides hides the topic, one or two guides keep it as a category filter, and three
 * or more guides permit a standalone topic index.
 */

export type PublicCategoryId = 'home-tech' | 'home' | 'kitchen' | 'shop' | 'tools';
export type TopicPublicationMode = 'hidden' | 'filter' | 'standalone';

export interface TopicPublicationThresholds {
  hiddenMaximum: number;
  filterMinimum: number;
  filterMaximum: number;
  standaloneMinimum: number;
}

export interface PublicTopic {
  id: string;
  categoryId: PublicCategoryId;
  label: string;
  route: string;
  description: string;
  order: number;
  publicationPolicy: 'threshold-gated';
  implemented: true;
}

export interface PublicCategory {
  id: PublicCategoryId;
  label: string;
  route: string;
  description: string;
  order: number;
  artworkId: string;
  metadata: {
    title: string;
    description: string;
  };
  topics: readonly PublicTopic[];
  implemented: true;
}

export const PUBLIC_TAXONOMY_CONTRACT_VERSION = '2026-07-18.handoff1.phase-c';

export const PUBLIC_METADATA_DEFAULTS = Object.freeze({
  siteName: 'How Biscuit',
  titleTemplate: '%s | How Biscuit',
  description: 'Practical, evidence-aware guides for technology, home, kitchens, shopping decisions, and useful tools.',
  socialImage: '/og.png',
  twitterCard: 'summary_large_image',
});

export const TOPIC_PUBLICATION_THRESHOLDS: Readonly<TopicPublicationThresholds> = Object.freeze({
  hiddenMaximum: 0,
  filterMinimum: 1,
  filterMaximum: 2,
  standaloneMinimum: 3,
});

function assertThresholds(thresholds: TopicPublicationThresholds): void {
  const values = Object.values(thresholds);
  if (!values.every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error('Topic publication thresholds must be non-negative integers.');
  }
  if (
    thresholds.hiddenMaximum !== 0
    || thresholds.filterMinimum !== thresholds.hiddenMaximum + 1
    || thresholds.standaloneMinimum !== thresholds.filterMaximum + 1
    || thresholds.filterMaximum < thresholds.filterMinimum
  ) {
    throw new Error('Topic publication thresholds must be contiguous from zero.');
  }
}

export function topicPublicationMode(
  publishableGuideCount: number,
  thresholds: TopicPublicationThresholds = TOPIC_PUBLICATION_THRESHOLDS,
): TopicPublicationMode {
  if (!Number.isInteger(publishableGuideCount) || publishableGuideCount < 0) {
    throw new Error('Publishable guide count must be a non-negative integer.');
  }
  assertThresholds(thresholds);
  if (publishableGuideCount <= thresholds.hiddenMaximum) return 'hidden';
  if (publishableGuideCount <= thresholds.filterMaximum) return 'filter';
  return 'standalone';
}

function topic(
  categoryId: PublicCategoryId,
  id: string,
  label: string,
  description: string,
  order: number,
): PublicTopic {
  return Object.freeze({
    id,
    categoryId,
    label,
    route: `/${categoryId}/${id}/`,
    description,
    order,
    publicationPolicy: 'threshold-gated' as const,
    implemented: true as const,
  });
}

function category(
  id: PublicCategoryId,
  label: string,
  description: string,
  order: number,
  artworkId: string,
  topics: readonly PublicTopic[],
): PublicCategory {
  return Object.freeze({
    id,
    label,
    route: `/${id}/`,
    description,
    order,
    artworkId,
    metadata: Object.freeze({ title: label, description }),
    topics: Object.freeze(topics),
    implemented: true as const,
  });
}

export const PUBLIC_CATEGORIES: readonly PublicCategory[] = Object.freeze([
  category(
    'home-tech',
    'Home Tech',
    'Practical help for connected devices, computers, entertainment systems, privacy, power, cooling, and storage.',
    1,
    'category-home-tech',
    [
      topic('home-tech', 'wifi-routers', 'Wi-Fi & Routers', 'Coverage, speed, placement, mesh systems, modems, and reliable home-network troubleshooting.', 1),
      topic('home-tech', 'computers-laptops', 'Computers & Laptops', 'Choosing, setting up, maintaining, repairing, and extending the useful life of personal computers.', 2),
      topic('home-tech', 'smart-home', 'Smart Home', 'Compatibility, local control, subscriptions, privacy, reliability, and safer connected-home defaults.', 3),
      topic('home-tech', 'tvs-streaming', 'TVs & Streaming', 'Televisions, streaming devices, HDMI, audio, picture settings, and playback troubleshooting.', 4),
      topic('home-tech', 'privacy-security', 'Privacy & Security', 'Updates, accounts, backups, passwords, network security, recovery, and practical privacy controls.', 5),
      topic('home-tech', 'power-cooling-storage', 'Power, Cooling & Storage', 'Power delivery, battery care, heat, airflow, storage capacity, failure signs, and replacement decisions.', 6),
    ],
  ),
  category(
    'home',
    'Home & Apartment',
    'Useful guidance for repairs, apartment comfort, heating and cooling, cleaning, materials, utilities, and energy.',
    2,
    'category-home-apartment',
    [
      topic('home', 'repairs-maintenance', 'Repairs & Maintenance', 'Routine upkeep, practical diagnosis, reversible repairs, materials, stop conditions, and professional boundaries.', 1),
      topic('home', 'apartment-comfort', 'Apartment Comfort', 'Renter-safe improvements for noise, airflow, temperature, lighting, space, and everyday comfort.', 2),
      topic('home', 'heating-cooling', 'Heating & Cooling', 'Temperature control, airflow, seasonal preparation, de-icing, efficiency, and equipment warning signs.', 3),
      topic('home', 'cleaning', 'Cleaning', 'Methods that work without damaging surfaces, fabrics, appliances, indoor air, or shared spaces.', 4),
      topic('home', 'tools-materials', 'Tools & Materials', 'Choosing, using, maintaining, and safely storing common household tools, supplies, and repair materials.', 5),
      topic('home', 'utilities-energy', 'Utilities & Energy', 'Electricity, water, gas, service costs, conservation tradeoffs, billing checks, and outage preparation.', 6),
    ],
  ),
  category(
    'kitchen',
    'Kitchen',
    'Mechanism-first kitchen guidance for appliances, cookware, food science, substitutions, meals, and safety.',
    3,
    'category-kitchen',
    [
      topic('kitchen', 'kitchen-appliances', 'Kitchen Appliances', 'Choosing, using, maintaining, and troubleshooting common countertop and major kitchen appliances.', 1),
      topic('kitchen', 'cookware-tools', 'Cookware & Tools', 'Materials, sizes, maintenance, safe use, replacement signs, and practical kitchen-tool comparisons.', 2),
      topic('kitchen', 'food-science', 'Food Science', 'The chemistry and physics behind ingredients, heat, texture, browning, preservation, and common failures.', 3),
      topic('kitchen', 'ingredient-substitutions', 'Ingredient Substitutions', 'What can be replaced, how the result changes, and when a substitution will not work safely.', 4),
      topic('kitchen', 'cheap-meals', 'Cheap Meals', 'Staples, meal planning, batch cooking, leftovers, nutrition tradeoffs, and realistic per-serving costs.', 5),
      topic('kitchen', 'troubleshooting-safety', 'Kitchen Troubleshooting & Safety', 'Diagnosing texture, timing, equipment, storage, temperatures, contamination, and important stop conditions.', 6),
    ],
  ),
  category(
    'shop',
    'Shop Smarter',
    'Evidence-labeled buying guidance focused on comparisons, local prices, used goods, total cost, and avoiding waste.',
    4,
    'category-shop-smarter',
    [
      topic('shop', 'product-comparisons', 'Product Comparisons', 'Auditable comparisons based on real requirements, tradeoffs, support life, repairability, and total value.', 1),
      topic('shop', 'local-prices', 'Local Prices', 'Location-aware price checks with source, freshness, unit, availability, and geographic limits made visible.', 2),
      topic('shop', 'used-refurbished', 'Used & Refurbished', 'Inspection, remaining life, warranties, repair costs, seller risk, and when used is poor value.', 3),
      topic('shop', 'total-cost-ownership', 'Total Cost of Ownership', 'Upfront cost, subscriptions, energy, maintenance, repair, replacement, resale, and switching costs.', 4),
      topic('shop', 'deals-worth-considering', 'Deals Worth Considering', 'Time-bounded offers evaluated against normal price, product quality, real need, and important restrictions.', 5),
      topic('shop', 'products-to-avoid', 'Products to Avoid', 'Products with poor support, unsafe compromises, misleading claims, lock-in, weak value, or preventable failure risks.', 6),
      topic('shop', 'product-index', 'Product Index', 'A transparent index of covered product groups, evidence state, available guidance, and known coverage gaps.', 7),
    ],
  ),
  category(
    'tools',
    'Tools',
    'Transparent calculators, converters, price checkers, checklists, decision aids, and reusable templates.',
    5,
    'category-tools',
    [
      topic('tools', 'calculators', 'Calculators', 'Transparent calculators that expose inputs, units, formulas, assumptions, limitations, and output meaning.', 1),
      topic('tools', 'converters', 'Converters', 'Unit, measurement, temperature, cooking, storage, networking, and other practical conversions.', 2),
      topic('tools', 'price-checkers', 'Price Checkers', 'Source-aware checks that show product identity, location, observed price, freshness, and uncertainty.', 3),
      topic('tools', 'checklists', 'Checklists', 'Reusable setup, troubleshooting, inspection, maintenance, comparison, and buying checklists.', 4),
      topic('tools', 'decision-tools', 'Decision Tools', 'Auditable comparisons and decision trees that make criteria and tradeoffs visible without fake precision.', 5),
      topic('tools', 'templates', 'Templates', 'Reusable planning, comparison, inventory, maintenance, budgeting, and documentation templates.', 6),
    ],
  ),
]);

export const ALL_GUIDES_TARGET = Object.freeze({
  route: '/articles/',
  label: 'All Guides',
  baselineLabels: Object.freeze(['All Articles', 'Articles']),
  implemented: true as const,
});

const categoryById = new Map(PUBLIC_CATEGORIES.map((item) => [item.id, item]));
const topicByRef: ReadonlyMap<string, PublicTopic> = new Map<string, PublicTopic>(
  PUBLIC_CATEGORIES.flatMap((item) => (
    item.topics.map((entry): [string, PublicTopic] => [`${item.id}/${entry.id}`, entry])
  )),
);

const CATEGORY_COMPATIBILITY: Readonly<Record<string, PublicCategoryId | null>> = Object.freeze({
  'home-tech': 'home-tech',
  home: 'home',
  'make-do': 'home',
  'home-diy': 'home',
  kitchen: 'kitchen',
  cook: 'kitchen',
  cooking: 'kitchen',
  shop: 'shop',
  'buying-guides': 'shop',
  tools: 'tools',
  'research-writing': null,
  science: null,
  glossary: null,
});

const TOPIC_COMPATIBILITY: Readonly<Record<string, readonly [PublicCategoryId, string] | null>> = Object.freeze({
  'home-tech/gaming-pcs': ['home-tech', 'computers-laptops'],
  'home-tech/laptops': ['home-tech', 'computers-laptops'],
  'home-tech/streaming-tvs': ['home-tech', 'tvs-streaming'],
  'home-diy/organization-storage': null,
});

export interface TopicRedirectMigration {
  from: string;
  topicRef: string;
}

export const TOPIC_REDIRECT_MIGRATIONS: readonly TopicRedirectMigration[] = Object.freeze([
  Object.freeze({ from: '/home-tech/gaming-pcs/', topicRef: 'home-tech/gaming-pcs' }),
  Object.freeze({ from: '/home-tech/laptops/', topicRef: 'home-tech/laptops' }),
  Object.freeze({ from: '/home-tech/streaming-tvs/', topicRef: 'home-tech/streaming-tvs' }),
  Object.freeze({ from: '/home-tech/wifi-routers/', topicRef: 'home-tech/wifi-routers' }),
  Object.freeze({ from: '/home-tech/smart-home/', topicRef: 'home-tech/smart-home' }),
  Object.freeze({ from: '/home-tech/privacy-security/', topicRef: 'home-tech/privacy-security' }),
]);

export function targetCategoryFor(id: string): { categoryId: PublicCategoryId; implemented: true } | null {
  if (!(id in CATEGORY_COMPATIBILITY)) return null;
  const categoryId = CATEGORY_COMPATIBILITY[id];
  return categoryId ? { categoryId, implemented: true } : null;
}

export function targetTopicFor(ref: string): {
  categoryId: PublicCategoryId;
  topicId: string;
  implemented: true;
} | null {
  const direct = topicByRef.get(ref);
  if (direct) return { categoryId: direct.categoryId, topicId: direct.id, implemented: true };
  const mapped = TOPIC_COMPATIBILITY[ref];
  if (!mapped) return null;
  const [categoryId, topicId] = mapped;
  if (!topicByRef.has(`${categoryId}/${topicId}`)) return null;
  return { categoryId, topicId, implemented: true };
}

export function hasTargetTopic(categoryId: string, topicId: string): boolean {
  return topicByRef.has(`${categoryId}/${topicId}`);
}

export function hasTargetCategory(categoryId: string): categoryId is PublicCategoryId {
  return categoryById.has(categoryId as PublicCategoryId);
}

interface RouteContract {
  route: string;
  outcome: 'serve' | 'preserve' | 'create' | 'redirect' | 'terminal' | 'threshold-gated';
  status: number | null;
  canonicalRoute: string | null;
  redirectCode: number | null;
  allowedStatuses?: readonly number[];
  evidence?: string;
  publicLabel?: string;
  reason: string;
  implemented?: boolean;
}

const target = (
  route: string,
  outcome: RouteContract['outcome'],
  canonicalRoute: string | null,
  reason: string,
  options: Partial<RouteContract> = {},
): RouteContract => Object.freeze({
  route,
  outcome,
  status: options.status ?? (['preserve', 'create'].includes(outcome) ? 200 : null),
  canonicalRoute,
  redirectCode: options.redirectCode ?? (outcome === 'redirect' ? 301 : null),
  reason,
  implemented: true,
  ...(options.allowedStatuses ? { allowedStatuses: Object.freeze(options.allowedStatuses) } : {}),
  ...(options.publicLabel ? { publicLabel: options.publicLabel } : {}),
});

export const TARGET_ROUTE_CONTRACTS: readonly RouteContract[] = Object.freeze([
  target('/', 'preserve', '/', 'Preserve the homepage canonical.'),
  target('/home-tech/', 'preserve', '/home-tech/', 'Preserve the approved Home Tech category route.'),
  target('/home/', 'create', '/home/', 'Create the approved Home and Apartment category route.'),
  target('/kitchen/', 'create', '/kitchen/', 'Create the approved Kitchen category route.'),
  target('/shop/', 'create', '/shop/', 'Create the approved Shop Smarter category route.'),
  target('/tools/', 'preserve', '/tools/', 'Preserve the approved Tools category route.'),
  target('/articles/', 'preserve', '/articles/', 'Preserve the canonical article index and relabel it All Guides.', { publicLabel: 'All Guides' }),
  target('/make-do/', 'redirect', '/home/', 'Migrate the legacy Home and DIY category directly to Home and Apartment.'),
  target('/cook/', 'redirect', '/kitchen/', 'Migrate the legacy Cooking category directly to Kitchen.'),
  target('/buying-guides/', 'redirect', '/shop/', 'Migrate the legacy Buying Guides category directly to Shop Smarter.'),
  target('/research-writing/', 'redirect', '/editorial-policy/', 'Move the noncommercial editorial standard to the trust surface.'),
  target('/science/', 'terminal', null, 'Retire the thin legacy division after moving real article classification.', { allowedStatuses: [404, 410] }),
  target('/glossary/', 'terminal', null, 'Retire and exclude the thin legacy glossary surface.', { allowedStatuses: [404, 410] }),
  target('/math/', 'terminal', null, 'Return clean recovery behavior linking users to BetterGrades.', { allowedStatuses: [404, 410] }),
  target('/home-tech/computers-laptops/', 'threshold-gated', '/home-tech/computers-laptops/', 'The canonical topic route remains hidden until three publishable guides qualify.'),
  target('/home-tech/tvs-streaming/', 'threshold-gated', '/home-tech/tvs-streaming/', 'The canonical topic route remains hidden until three publishable guides qualify.'),
  target('/home-tech/gaming-pcs/', 'redirect', '/home-tech/', 'The intended Computers and Laptops topic is below threshold, so recover at the final Home Tech category instead of a dead or thin destination.'),
  target('/home-tech/laptops/', 'redirect', '/home-tech/', 'The intended Computers and Laptops topic is below threshold, so recover at the final Home Tech category instead of a dead or thin destination.'),
  target('/home-tech/streaming-tvs/', 'redirect', '/home-tech/', 'The intended TVs and Streaming topic is below threshold, so recover at the final Home Tech category instead of a dead or thin destination.'),
  target('/home-tech/wifi-routers/', 'redirect', '/home-tech/', 'The zero-guide topic is hidden and recovers at its final category.'),
  target('/home-tech/smart-home/', 'redirect', '/home-tech/', 'The zero-guide topic is hidden and recovers at its final category.'),
  target('/home-tech/privacy-security/', 'redirect', '/home-tech/', 'The zero-guide topic is hidden and recovers at its final category.'),
  target('/cooking/*', 'redirect', '/kitchen/', 'Send the legacy wildcard directly to the final Kitchen category without creating unverified child routes.'),
  target('/make-do-lab/*', 'redirect', '/home/', 'Send the legacy wildcard directly to the final Home category without creating unverified child routes.'),
  ...[
    '/articles/why-salt-melts-ice/',
    '/articles/how-does-baking-powder-work/',
    '/articles/why-are-some-answers-better-than-others/',
    '/about/',
    '/affiliate-disclosure/',
    '/contact/',
    '/corrections/',
    '/editorial-policy/',
    '/privacy/',
  ].map((route) => target(route, 'preserve', route, 'Preserve the existing canonical route exactly.')),
]);

export const HOST_CONTRACT = Object.freeze({
  host: 'www.howbiscuit.com',
  sourceDeclared: Object.freeze({
    outcome: 'redirect' as const,
    code: 301,
    destinationHost: 'howbiscuit.com',
    mechanism: 'sites-worker' as const,
    sourcePath: 'scripts/build-static.mjs' as const,
  }),
  liveObserved: Object.freeze({
    outcome: 'serve' as const,
    status: 200,
    canonicalHost: 'howbiscuit.com',
  }),
  target: Object.freeze({
    outcome: 'redirect' as const,
    code: 301,
    destinationHost: 'howbiscuit.com',
    implemented: true as const,
  }),
});

export type SitesRedirectRule = Readonly<{
  from: string;
  to: string;
  code: 301;
}>;

export function parseSitesRedirectRules(source: string): readonly SitesRedirectRule[] {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  return Object.freeze(lines.map((line, index) => {
    const fields = line.split(/\s+/);
    if (fields.length !== 3) throw new Error(`Redirect line ${index + 1} must contain source, destination, and code.`);
    const [from, to, code] = fields;
    const wildcardCount = (from.match(/\*/g) ?? []).length;
    if (
      !from.startsWith('/')
      || from.startsWith('//')
      || /[:?#\\]/.test(from)
      || wildcardCount > 1
      || (wildcardCount === 1 && !from.endsWith('*'))
    ) {
      throw new Error(`Redirect line ${index + 1} must use an exact root-relative path or one trailing wildcard.`);
    }
    if (!to.startsWith('/') || to.startsWith('//') || /[*:?#\\]/.test(to)) {
      throw new Error(`Redirect line ${index + 1} must use a fixed root-relative destination.`);
    }
    if (code !== '301') throw new Error(`Redirect line ${index + 1} must remain a permanent 301.`);
    return Object.freeze({ from, to, code: 301 as const });
  }));
}

export function buildSitesWorkerSource(redirectSource: string): string {
  const rules = parseSitesRedirectRules(redirectSource);
  const exactRules = rules.filter(({ from }) => !from.includes('*')).map(({ from, to }) => [from, to]);
  const wildcardRules = rules.filter(({ from }) => from.endsWith('*')).map(({ from, to }) => [from.slice(0, -1), to]);
  return [
    `const APEX_HOST = ${JSON.stringify(HOST_CONTRACT.target.destinationHost)};`,
    `const WWW_HOST = ${JSON.stringify(HOST_CONTRACT.host)};`,
    `const EXACT_REDIRECTS = new Map(${JSON.stringify(exactRules)});`,
    `const WILDCARD_REDIRECTS = Object.freeze(${JSON.stringify(wildcardRules)});`,
    'function migratedPath(pathname) {',
    '  const exact = EXACT_REDIRECTS.get(pathname);',
    '  if (exact) return exact;',
    '  for (const [prefix, destination] of WILDCARD_REDIRECTS) {',
    '    if (pathname.startsWith(prefix)) return destination;',
    '  }',
    '  return null;',
    '}',
    'export function redirectLocation(request) {',
    '  const url = new URL(request.url);',
    '  const destinationPath = migratedPath(url.pathname);',
    '  const canonicalizeHost = url.hostname === WWW_HOST;',
    '  if (!destinationPath && !canonicalizeHost) return null;',
    '  if (canonicalizeHost) {',
    "    url.protocol = 'https:';",
    '    url.hostname = APEX_HOST;',
    "    url.port = '';",
    '  }',
    '  if (destinationPath) url.pathname = destinationPath;',
    '  return url.toString();',
    '}',
    'export default {',
    '  async fetch(request, env) {',
    '    const location = redirectLocation(request);',
    '    if (location) return Response.redirect(location, 301);',
    '    return env.ASSETS.fetch(request);',
    '  },',
    '};',
    '',
  ].join('\n');
}

function normalizeRoute(route: string): string {
  if (!route.startsWith('/')) throw new Error(`Route must be root-relative: ${route}`);
  const [path] = route.split(/[?#]/, 1);
  if (path === '/') return '/';
  return path.endsWith('/') || /\.[a-z0-9]+$/i.test(path) ? path : `${path}/`;
}

function matchContract(contracts: readonly RouteContract[], requestedRoute: string): {
  contract: RouteContract;
  splat: string;
} | null {
  const route = normalizeRoute(requestedRoute);
  const exact = contracts.find((entry) => entry.route === route);
  if (exact) return { contract: exact, splat: '' };
  for (const contract of contracts) {
    if (!contract.route.endsWith('*')) continue;
    const prefix = contract.route.slice(0, -1);
    if (route.startsWith(prefix)) return { contract, splat: route.slice(prefix.length) };
  }
  return null;
}

function substituteSplat(route: string, splat: string): string {
  return normalizeRoute(route.replace(':splat', splat.replace(/^\//, '')));
}

function resolveRoute(contracts: readonly RouteContract[], requestedRoute: string): Record<string, unknown> {
  const normalized = normalizeRoute(requestedRoute);
  const matched = matchContract(contracts, normalized);
  if (!matched) {
    return {
      requestedRoute: normalized,
      outcome: 'unknown',
      status: null,
      canonicalRoute: null,
      redirectCode: null,
      redirectChain: [],
    };
  }

  const { contract } = matched;
  if (contract.outcome !== 'redirect') {
    return {
      requestedRoute: normalized,
      outcome: contract.outcome,
      status: contract.status,
      canonicalRoute: contract.canonicalRoute,
      redirectCode: null,
      redirectChain: [],
      ...(contract.allowedStatuses ? { allowedStatuses: [...contract.allowedStatuses] } : {}),
      ...(contract.evidence ? { evidence: contract.evidence } : {}),
      ...(typeof contract.implemented === 'boolean' ? { implemented: contract.implemented } : {}),
    };
  }

  const chain: Array<{ from: string; to: string; code: number }> = [];
  const seen = new Set([normalized]);
  let current = normalized;
  let currentMatch = matched;
  while (currentMatch.contract.outcome === 'redirect') {
    const destination = substituteSplat(currentMatch.contract.canonicalRoute!, currentMatch.splat);
    if (seen.has(destination)) throw new Error(`Redirect loop detected at ${destination}`);
    seen.add(destination);
    chain.push({ from: current, to: destination, code: currentMatch.contract.redirectCode ?? 301 });
    current = destination;
    const next = matchContract(contracts, destination);
    if (!next || next.contract.outcome !== 'redirect') break;
    currentMatch = next;
  }

  return {
    requestedRoute: normalized,
    outcome: 'redirect',
    status: contract.redirectCode,
    canonicalRoute: current,
    redirectCode: contract.redirectCode,
    redirectChain: chain,
    ...(typeof contract.implemented === 'boolean' ? { implemented: contract.implemented } : {}),
  };
}

export function resolveTargetRoute(route: string): Record<string, unknown> {
  return resolveRoute(TARGET_ROUTE_CONTRACTS, route);
}

export function findTargetRedirectChains(): Array<{ route: string; chain: unknown[] }> {
  const problems: Array<{ route: string; chain: unknown[] }> = [];
  for (const contract of TARGET_ROUTE_CONTRACTS.filter((entry) => entry.outcome === 'redirect')) {
    const sampleRoute = contract.route.replace('*', 'contract-probe/');
    const resolution = resolveTargetRoute(sampleRoute);
    const chain = resolution.redirectChain as unknown[];
    if (chain.length > 1) problems.push({ route: contract.route, chain });
  }
  return problems;
}
