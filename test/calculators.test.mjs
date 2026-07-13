import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateApplianceCost,
  calculateCostPerUnit,
  calculateDiscountedTotal,
  calculateRecurringCost,
  calculateSalesTax,
  calculateSplitBill,
  calculateTripCost,
  solvePretaxBudget,
} from '../src/lib/calculators/costs.mjs';
import {
  electricityRates,
  stateTaxRates,
  taxPresets,
} from '../src/lib/calculators/us-data.mjs';
import {
  conversionCategories,
  convertUnit,
} from '../src/lib/calculators/units.mjs';

test('converts common liquid units through a shared base unit', () => {
  assert.equal(convertUnit('volume', 'us-gallon', 'us-cup', 1), 16);
  assert.ok(Math.abs(convertUnit('volume', 'us-cup', 'milliliter', 1) - 236.5882365) < 1e-7);
});

test('keeps US and Imperial liquid units distinct', () => {
  const imperial = convertUnit('volume', 'imperial-gallon', 'liter', 1);
  const us = convertUnit('volume', 'us-gallon', 'liter', 1);
  assert.ok(Math.abs(imperial - 4.54609) < 1e-8);
  assert.ok(Math.abs(us - 3.785411784) < 1e-9);
});

test('converts affine temperature scales correctly', () => {
  assert.equal(convertUnit('temperature', 'celsius', 'fahrenheit', 100), 212);
  assert.equal(convertUnit('temperature', 'fahrenheit', 'celsius', 32), 0);
  assert.equal(convertUnit('temperature', 'kelvin', 'celsius', 273.15), 0);
});

test('ships broad converter coverage without mixing incompatible dimensions', () => {
  assert.deepEqual(Object.keys(conversionCategories), [
    'volume',
    'mass',
    'length',
    'area',
    'temperature',
    'speed',
    'data',
    'energy',
    'pressure',
  ]);
  assert.throws(() => convertUnit('volume', 'liter', 'kilogram', 1), /Unknown unit/);
});

test('calculates appliance energy use for non-daily schedules', () => {
  const result = calculateApplianceCost({
    watts: 1500,
    hoursPerDay: 2,
    daysPerWeek: 5,
    centsPerKwh: 20,
  });
  assert.equal(result.kwhPerWeek, 15);
  assert.equal(result.costPerWeek, 3);
  assert.equal(result.costPerYear, 156);
});

test('itemizes percentage and per-unit checkout taxes', () => {
  const result = calculateSalesTax({
    amount: 100,
    percentageComponents: [
      { id: 'state', label: 'State', rate: 4 },
      { id: 'city', label: 'City', rate: 4.5 },
      { id: 'district', label: 'District', rate: 0.375 },
    ],
    unitTax: 1.5,
    units: 2,
    unitTaxIncluded: false,
  });
  assert.equal(result.percentageTax, 8.875);
  assert.equal(result.checkoutUnitTax, 3);
  assert.equal(result.totalDue, 111.875);
});

test('shows embedded excise without charging it twice', () => {
  const result = calculateSalesTax({
    amount: 20,
    percentageComponents: [],
    unitTax: 6.85,
    units: 2,
    unitTaxIncluded: true,
  });
  assert.equal(result.embeddedTax, 13.7);
  assert.equal(result.totalDue, 20);
});

test('solves backward from a cash budget', () => {
  const result = solvePretaxBudget({
    budget: 100,
    percentageComponents: [{ id: 'tax', label: 'Tax', rate: 13 }],
    unitTax: 0,
    units: 1,
    unitTaxIncluded: false,
  });
  assert.ok(Math.abs(result.spendableAmount - 88.4955752212) < 1e-9);
  assert.ok(Math.abs(result.totalTax - 11.5044247788) < 1e-9);
});

test('rejects a budget that cannot cover fixed checkout tax', () => {
  assert.throws(() => solvePretaxBudget({
    budget: 5,
    percentageComponents: [],
    unitTax: 6.85,
    units: 1,
    unitTaxIncluded: false,
  }), /budget must cover/);
});

test('includes every state plus DC with current base-rate metadata', () => {
  assert.equal(stateTaxRates.length, 51);
  assert.equal(stateTaxRates.find(({ code }) => code === 'CA').stateRate, 7.25);
  assert.equal(stateTaxRates.find(({ code }) => code === 'OR').stateRate, 0);
  assert.equal(stateTaxRates.find(({ code }) => code === 'LA').stateRate, 5);
});

test('uses EIA residential state-average electricity prices', () => {
  assert.equal(electricityRates.effectiveMonth, '2026-04');
  assert.equal(electricityRates.centsPerKwh.NY, 29.45);
  assert.equal(electricityRates.centsPerKwh.CA, 35.25);
});

test('encodes verified NYC presets without treating excise as general sales tax', () => {
  assert.equal(taxPresets['nyc-general'].percentageComponents.reduce((sum, item) => sum + item.rate, 0), 8.875);
  assert.equal(taxPresets['nyc-cannabis'].percentageComponents.reduce((sum, item) => sum + item.rate, 0), 13);
  assert.equal(taxPresets['nyc-groceries'].percentageComponents.length, 0);
  assert.equal(taxPresets['nyc-vapor'].percentageComponents.reduce((sum, item) => sum + item.rate, 0), 28.875);
  assert.equal(taxPresets['nyc-cigarettes'].unitTax, 6.85);
  assert.equal(taxPresets['nyc-cigarettes'].unitTaxIncluded, true);
});

test('calculates everyday cost comparisons', () => {
  assert.equal(calculateCostPerUnit({ price: 12, quantity: 48 }), 0.25);
  assert.equal(calculateDiscountedTotal({ price: 100, discountPercent: 20, taxPercent: 10 }).total, 88);
  assert.equal(calculateRecurringCost({ amount: 15, frequency: 'monthly' }).annual, 180);
  assert.equal(calculateTripCost({ miles: 300, milesPerGallon: 30, pricePerGallon: 3.5 }).cost, 35);
  assert.equal(calculateSplitBill({ subtotal: 100, taxPercent: 8, tipPercent: 20, people: 4 }).perPerson, 32);
});

test('rejects non-finite and physically invalid inputs', () => {
  assert.throws(() => calculateApplianceCost({ watts: -1, hoursPerDay: 1, daysPerWeek: 7, centsPerKwh: 20 }), /watts/);
  assert.throws(() => calculateCostPerUnit({ price: 10, quantity: 0 }), /quantity/);
  assert.throws(() => calculateTripCost({ miles: 10, milesPerGallon: 0, pricePerGallon: 3 }), /milesPerGallon/);
});
