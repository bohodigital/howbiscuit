const rows = [
  ['AL', 'Alabama', 4], ['AK', 'Alaska', 0], ['AZ', 'Arizona', 5.6], ['AR', 'Arkansas', 6.5],
  ['CA', 'California', 7.25], ['CO', 'Colorado', 2.9], ['CT', 'Connecticut', 6.35], ['DE', 'Delaware', 0],
  ['DC', 'District of Columbia', 6], ['FL', 'Florida', 6], ['GA', 'Georgia', 4], ['HI', 'Hawaii', 4],
  ['ID', 'Idaho', 6], ['IL', 'Illinois', 6.25], ['IN', 'Indiana', 7], ['IA', 'Iowa', 6],
  ['KS', 'Kansas', 6.5], ['KY', 'Kentucky', 6], ['LA', 'Louisiana', 5], ['ME', 'Maine', 5.5],
  ['MD', 'Maryland', 6], ['MA', 'Massachusetts', 6.25], ['MI', 'Michigan', 6], ['MN', 'Minnesota', 6.875],
  ['MS', 'Mississippi', 7], ['MO', 'Missouri', 4.225], ['MT', 'Montana', 0], ['NE', 'Nebraska', 5.5],
  ['NV', 'Nevada', 6.85], ['NH', 'New Hampshire', 0], ['NJ', 'New Jersey', 6.625], ['NM', 'New Mexico', 4.875],
  ['NY', 'New York', 4], ['NC', 'North Carolina', 4.75], ['ND', 'North Dakota', 5], ['OH', 'Ohio', 5.75],
  ['OK', 'Oklahoma', 4.5], ['OR', 'Oregon', 0], ['PA', 'Pennsylvania', 6], ['RI', 'Rhode Island', 7],
  ['SC', 'South Carolina', 6], ['SD', 'South Dakota', 4.2], ['TN', 'Tennessee', 7], ['TX', 'Texas', 6.25],
  ['UT', 'Utah', 6.1], ['VT', 'Vermont', 6], ['VA', 'Virginia', 5.3], ['WA', 'Washington', 6.5],
  ['WV', 'West Virginia', 6], ['WI', 'Wisconsin', 5], ['WY', 'Wyoming', 4],
];

export const stateTaxRates = rows.map(([code, name, stateRate]) => ({ code, name, stateRate }));

export const taxRateSource = {
  title: 'Tax Foundation — State and Local Sales Tax Rates, Midyear 2026',
  url: 'https://taxfoundation.org/data/all/state/2026-sales-tax-rates-midyear/',
  effectiveDate: '2026-07-01',
  note: 'State-level general rate only. Local and product tax rules require separate inputs.',
};

export const electricityRates = {
  effectiveMonth: '2026-04',
  title: 'U.S. EIA Electric Power Monthly, Table 5.6.A',
  url: 'https://www.eia.gov/electricity/monthly/epm_table_grapher.php?form=MG0AV3&t=epmt_5_6_a',
  note: 'Preliminary residential state average in cents per kWh; a utility bill is more accurate.',
  centsPerKwh: {
    AL: 17.41, AK: 27.35, AZ: 15.48, AR: 14.16, CA: 35.25, CO: 16.54, CT: 32.24,
    DE: 18.79, DC: 25.41, FL: 15.38, GA: 15.37, HI: 46.62, ID: 12.70, IL: 20.47,
    IN: 17.90, IA: 13.86, KS: 15.78, KY: 15.02, LA: 14.44, ME: 28.42, MD: 22.07,
    MA: 29.45, MI: 21.39, MN: 16.39, MS: 16.76, MO: 14.01, MT: 13.90, NE: 13.28,
    NV: 14.29, NH: 27.24, NJ: 23.53, NM: 15.15, NY: 29.45, NC: 16.25, ND: 12.35,
    OH: 19.49, OK: 13.31, OR: 15.78, PA: 21.47, RI: 28.30, SC: 17.06, SD: 14.52,
    TN: 14.94, TX: 16.99, UT: 13.29, VT: 24.56, VA: 17.38, WA: 14.36, WV: 16.06,
    WI: 19.21, WY: 14.68,
  },
};

export const taxPresets = {
  'nyc-general': {
    label: 'NYC general merchandise',
    stateCode: 'NY',
    percentageComponents: [
      { id: 'state', label: 'New York State', rate: 4 },
      { id: 'city', label: 'New York City', rate: 4.5 },
      { id: 'district', label: 'MCTD', rate: 0.375 },
    ],
    unitTax: 0,
    unitTaxIncluded: false,
    note: '8.875% combined general rate. Product exemptions can change the result.',
  },
  'nyc-groceries': {
    label: 'NYC groceries for home use',
    stateCode: 'NY',
    percentageComponents: [],
    unitTax: 0,
    unitTaxIncluded: false,
    note: 'Most unheated, unprepared food for home consumption is exempt. Prepared food, candy, soft drinks, and alcohol can be taxable.',
  },
  'nyc-cannabis': {
    label: 'NYC adult-use cannabis',
    stateCode: 'NY',
    percentageComponents: [
      { id: 'state', label: 'State cannabis retail tax', rate: 9 },
      { id: 'city', label: 'Local cannabis retail tax', rate: 4 },
    ],
    unitTax: 0,
    unitTaxIncluded: false,
    note: 'Adult-use cannabis is exempt from general sales tax; the retail taxes total 13%.',
  },
  'nyc-alcohol': {
    label: 'NYC alcohol at checkout',
    stateCode: 'NY',
    percentageComponents: [
      { id: 'state', label: 'New York State', rate: 4 },
      { id: 'city', label: 'New York City', rate: 4.5 },
      { id: 'district', label: 'MCTD', rate: 0.375 },
    ],
    unitTax: 0,
    unitTaxIncluded: true,
    note: 'General sales tax is added at checkout. Beverage excise varies by type and volume and is normally already in the shelf price.',
  },
  'nyc-beer': {
    label: 'NYC beer',
    stateCode: 'NY',
    percentageComponents: [
      { id: 'state', label: 'New York State', rate: 4 },
      { id: 'city', label: 'New York City', rate: 4.5 },
      { id: 'district', label: 'MCTD', rate: 0.375 },
    ],
    unitTax: 0.26,
    unitLabel: 'gallons',
    unitTaxIncluded: true,
    note: '$0.14 state plus $0.12 city excise per gallon is normally embedded in the shelf price.',
  },
  'nyc-liquor': {
    label: 'NYC liquor over 24% ABV',
    stateCode: 'NY',
    percentageComponents: [
      { id: 'state', label: 'New York State', rate: 4 },
      { id: 'city', label: 'New York City', rate: 4.5 },
      { id: 'district', label: 'MCTD', rate: 0.375 },
    ],
    unitTax: 1.964,
    unitLabel: 'liters',
    unitTaxIncluded: true,
    note: '$1.70 state plus $0.264 city excise per liter is normally embedded in the shelf price.',
  },
  'nyc-cigarettes': {
    label: 'NYC cigarettes',
    stateCode: 'NY',
    percentageComponents: [],
    unitTax: 6.85,
    unitLabel: 'packs of 20',
    unitTaxIncluded: true,
    note: '$5.35 state plus $1.50 city excise per pack is embedded. Prepaid sales tax is also passed through in the shelf price.',
  },
  'nyc-vapor': {
    label: 'NYC vapor products',
    stateCode: 'NY',
    percentageComponents: [
      { id: 'state', label: 'New York State', rate: 4 },
      { id: 'city', label: 'New York City', rate: 4.5 },
      { id: 'district', label: 'MCTD', rate: 0.375 },
      { id: 'product', label: 'Vapor product supplemental tax', rate: 20 },
    ],
    unitTax: 0,
    unitTaxIncluded: false,
    note: 'New York adds a 20% supplemental tax to the retail price, alongside the regular state and local sales tax.',
  },
};
