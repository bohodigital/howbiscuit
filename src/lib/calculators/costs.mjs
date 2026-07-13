/** @typedef {{ id: string, label: string, rate: number | string }} PercentageComponent */

/**
 * @param {string} name
 * @param {number | string} value
 * @param {{ min?: number, allowZero?: boolean }} [options]
 */
function finite(name, value, { min = 0, allowZero = true } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || (!allowZero && number === 0)) {
    throw new Error(`${name} must be ${allowZero ? 'at least' : 'greater than'} ${min}`);
  }
  return number;
}

/** @param {PercentageComponent[]} components */
function normalizeComponents(components = []) {
  return components.map((component) => ({
    ...component,
    rate: finite(`${component.label || component.id} rate`, component.rate),
  }));
}

/**
 * @param {{ watts: number | string, hoursPerDay: number | string, daysPerWeek: number | string, centsPerKwh: number | string }} input
 */
export function calculateApplianceCost({ watts, hoursPerDay, daysPerWeek, centsPerKwh }) {
  const safeWatts = finite('watts', watts);
  const safeHours = finite('hoursPerDay', hoursPerDay);
  const safeDays = finite('daysPerWeek', daysPerWeek);
  const safeRate = finite('centsPerKwh', centsPerKwh);
  if (safeHours > 24) throw new Error('hoursPerDay must be at most 24');
  if (safeDays > 7) throw new Error('daysPerWeek must be at most 7');

  const kwhPerActiveDay = safeWatts / 1000 * safeHours;
  const kwhPerWeek = kwhPerActiveDay * safeDays;
  const rate = safeRate / 100;
  return {
    kwhPerActiveDay,
    kwhPerWeek,
    kwhPerMonth: kwhPerWeek * 52 / 12,
    kwhPerYear: kwhPerWeek * 52,
    costPerActiveDay: kwhPerActiveDay * rate,
    costPerWeek: kwhPerWeek * rate,
    costPerMonth: kwhPerWeek * 52 / 12 * rate,
    costPerYear: kwhPerWeek * 52 * rate,
  };
}

/**
 * @param {{ amount: number | string, percentageComponents?: PercentageComponent[], unitTax?: number | string, units?: number | string, unitTaxIncluded?: boolean }} input
 */
export function calculateSalesTax({
  amount,
  percentageComponents = [],
  unitTax = 0,
  units = 0,
  unitTaxIncluded = false,
}) {
  const safeAmount = finite('amount', amount);
  const safeUnitTax = finite('unitTax', unitTax);
  const safeUnits = finite('units', units);
  const components = normalizeComponents(percentageComponents);
  const breakdown = components.map((component) => ({
    ...component,
    tax: safeAmount * component.rate / 100,
  }));
  const percentageTax = breakdown.reduce((sum, component) => sum + component.tax, 0);
  const fixedTax = safeUnitTax * safeUnits;
  const checkoutUnitTax = unitTaxIncluded ? 0 : fixedTax;
  const embeddedTax = unitTaxIncluded ? fixedTax : 0;
  return {
    amount: safeAmount,
    breakdown,
    percentageRate: components.reduce((sum, component) => sum + component.rate, 0),
    percentageTax,
    checkoutUnitTax,
    embeddedTax,
    totalTaxAdded: percentageTax + checkoutUnitTax,
    totalDue: safeAmount + percentageTax + checkoutUnitTax,
  };
}

/**
 * @param {{ budget: number | string, percentageComponents?: PercentageComponent[], unitTax?: number | string, units?: number | string, unitTaxIncluded?: boolean }} input
 */
export function solvePretaxBudget({
  budget,
  percentageComponents = [],
  unitTax = 0,
  units = 0,
  unitTaxIncluded = false,
}) {
  const safeBudget = finite('budget', budget);
  const safeUnitTax = finite('unitTax', unitTax);
  const safeUnits = finite('units', units);
  const components = normalizeComponents(percentageComponents);
  const percentageRate = components.reduce((sum, component) => sum + component.rate, 0);
  const checkoutUnitTax = unitTaxIncluded ? 0 : safeUnitTax * safeUnits;
  if (checkoutUnitTax > safeBudget) {
    throw new Error('budget must cover the selected per-unit tax');
  }
  const availableForPriceAndPercentTax = Math.max(0, safeBudget - checkoutUnitTax);
  const spendableAmount = availableForPriceAndPercentTax / (1 + percentageRate / 100);
  const calculation = calculateSalesTax({
    amount: spendableAmount,
    percentageComponents: components,
    unitTax: safeUnitTax,
    units: safeUnits,
    unitTaxIncluded,
  });
  return {
    ...calculation,
    budget: safeBudget,
    spendableAmount,
    totalTax: safeBudget - spendableAmount,
    unusedBudget: Math.max(0, safeBudget - calculation.totalDue),
  };
}

/** @param {{ price: number | string, quantity: number | string }} input */
export function calculateCostPerUnit({ price, quantity }) {
  return finite('price', price) / finite('quantity', quantity, { allowZero: false });
}

/** @param {{ price: number | string, discountPercent?: number, taxPercent?: number }} input */
export function calculateDiscountedTotal({ price, discountPercent = 0, taxPercent = 0 }) {
  const safePrice = finite('price', price);
  const discountRate = finite('discountPercent', discountPercent);
  const taxRate = finite('taxPercent', taxPercent);
  if (discountRate > 100) throw new Error('discountPercent must be at most 100');
  const discountedPrice = safePrice * (1 - discountRate / 100);
  const tax = discountedPrice * taxRate / 100;
  return { discountedPrice, savings: safePrice - discountedPrice, tax, total: discountedPrice + tax };
}

const annualFrequency = { daily: 365, weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 };

/** @param {{ amount: number | string, frequency: keyof typeof annualFrequency }} input */
export function calculateRecurringCost({ amount, frequency }) {
  const multiplier = annualFrequency[frequency];
  if (!multiplier) throw new Error(`Unknown frequency: ${frequency}`);
  const annual = finite('amount', amount) * multiplier;
  return { monthly: annual / 12, annual, fiveYear: annual * 5 };
}

/** @param {{ miles: number | string, milesPerGallon: number | string, pricePerGallon: number | string }} input */
export function calculateTripCost({ miles, milesPerGallon, pricePerGallon }) {
  const gallons = finite('miles', miles) / finite('milesPerGallon', milesPerGallon, { allowZero: false });
  return { gallons, cost: gallons * finite('pricePerGallon', pricePerGallon) };
}

/** @param {{ subtotal: number | string, taxPercent?: number, tipPercent?: number, people: number | string }} input */
export function calculateSplitBill({ subtotal, taxPercent = 0, tipPercent = 0, people }) {
  const safeSubtotal = finite('subtotal', subtotal);
  const tax = safeSubtotal * finite('taxPercent', taxPercent) / 100;
  const tip = safeSubtotal * finite('tipPercent', tipPercent) / 100;
  const total = safeSubtotal + tax + tip;
  return { tax, tip, total, perPerson: total / finite('people', people, { allowZero: false }) };
}
