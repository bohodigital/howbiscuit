export const canonicalSalesTaxPath = '/tools/cost-estimators/sales-tax/';

const allowedFocusFields = new Set([
  'address', 'amount', 'cadence', 'countyRate', 'districtRate', 'mode', 'preset',
  'product', 'productRate', 'state', 'stateRate', 'unitIncluded', 'units', 'unitTax', 'zip',
]);
const allowedActions = new Set(['locate', 'lookup']);

/**
 * @param {{ stateCode?: string, postalCode?: string, presetId?: string, autoLookup?: boolean, focus?: string, action?: string }} [options]
 */
export function buildCanonicalTaxCalculatorUrl({
  stateCode,
  postalCode,
  presetId = 'custom',
  autoLookup = false,
  focus,
  action,
} = {}) {
  const params = new URLSearchParams();
  if (/^[A-Z]{2}$/.test(stateCode ?? '')) params.set('state', stateCode);
  if (/^\d{5}$/.test(postalCode ?? '')) params.set('postalCode', postalCode);
  if (/^[a-z0-9-]+$/.test(presetId ?? '')) params.set('preset', presetId);
  if (autoLookup) params.set('lookup', '1');
  if (allowedFocusFields.has(focus)) params.set('focus', focus);
  if (allowedActions.has(action)) params.set('action', action);
  const query = params.toString();
  return query ? `${canonicalSalesTaxPath}?${query}` : canonicalSalesTaxPath;
}

/**
 * @param {string} search
 * @param {string[]} [validStates]
 * @param {string[]} [validPresets]
 */
export function parseTaxCalculatorQuery(search, validStates = [], validPresets = []) {
  const params = new URLSearchParams(search);
  const state = params.get('state') ?? '';
  const postalCode = params.get('postalCode') ?? '';
  const preset = params.get('preset') ?? '';
  const focus = params.get('focus') ?? '';
  const action = params.get('action') ?? '';
  return {
    stateCode: validStates.includes(state) ? state : '',
    postalCode: /^\d{5}$/.test(postalCode) ? postalCode : '',
    presetId: validPresets.includes(preset) ? preset : '',
    autoLookup: params.get('lookup') === '1',
    focus: allowedFocusFields.has(focus) ? focus : '',
    action: allowedActions.has(action) ? action : '',
  };
}
