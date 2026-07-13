const linearUnit = (id, label, symbol, factor) => ({ id, label, symbol, factor });

export const conversionCategories = {
  volume: {
    label: 'Liquid volume',
    units: [
      linearUnit('milliliter', 'Milliliters', 'mL', 0.001),
      linearUnit('liter', 'Liters', 'L', 1),
      linearUnit('us-teaspoon', 'US teaspoons', 'tsp', 0.00492892159375),
      linearUnit('us-tablespoon', 'US tablespoons', 'tbsp', 0.01478676478125),
      linearUnit('us-fluid-ounce', 'US fluid ounces', 'fl oz', 0.0295735295625),
      linearUnit('us-cup', 'US cups', 'cup', 0.2365882365),
      linearUnit('us-pint', 'US pints', 'pt', 0.473176473),
      linearUnit('us-quart', 'US quarts', 'qt', 0.946352946),
      linearUnit('us-gallon', 'US gallons', 'gal', 3.785411784),
      linearUnit('imperial-fluid-ounce', 'Imperial fluid ounces', 'imp fl oz', 0.0284130625),
      linearUnit('imperial-pint', 'Imperial pints', 'imp pt', 0.56826125),
      linearUnit('imperial-gallon', 'Imperial gallons', 'imp gal', 4.54609),
    ],
  },
  mass: {
    label: 'Weight & mass',
    units: [
      linearUnit('milligram', 'Milligrams', 'mg', 0.001),
      linearUnit('gram', 'Grams', 'g', 1),
      linearUnit('kilogram', 'Kilograms', 'kg', 1000),
      linearUnit('ounce', 'Ounces', 'oz', 28.349523125),
      linearUnit('pound', 'Pounds', 'lb', 453.59237),
      linearUnit('stone', 'Stone', 'st', 6350.29318),
      linearUnit('us-ton', 'US tons', 'short ton', 907184.74),
      linearUnit('metric-tonne', 'Metric tonnes', 't', 1_000_000),
    ],
  },
  length: {
    label: 'Length & distance',
    units: [
      linearUnit('millimeter', 'Millimeters', 'mm', 0.001),
      linearUnit('centimeter', 'Centimeters', 'cm', 0.01),
      linearUnit('meter', 'Meters', 'm', 1),
      linearUnit('kilometer', 'Kilometers', 'km', 1000),
      linearUnit('inch', 'Inches', 'in', 0.0254),
      linearUnit('foot', 'Feet', 'ft', 0.3048),
      linearUnit('yard', 'Yards', 'yd', 0.9144),
      linearUnit('mile', 'Miles', 'mi', 1609.344),
      linearUnit('nautical-mile', 'Nautical miles', 'nmi', 1852),
    ],
  },
  area: {
    label: 'Area',
    units: [
      linearUnit('square-centimeter', 'Square centimeters', 'cm²', 0.0001),
      linearUnit('square-meter', 'Square meters', 'm²', 1),
      linearUnit('hectare', 'Hectares', 'ha', 10_000),
      linearUnit('square-inch', 'Square inches', 'in²', 0.00064516),
      linearUnit('square-foot', 'Square feet', 'ft²', 0.09290304),
      linearUnit('square-yard', 'Square yards', 'yd²', 0.83612736),
      linearUnit('acre', 'Acres', 'acre', 4046.8564224),
      linearUnit('square-mile', 'Square miles', 'mi²', 2_589_988.110336),
    ],
  },
  temperature: {
    label: 'Temperature',
    units: [
      { id: 'celsius', label: 'Celsius', symbol: '°C', toBase: (value) => value, fromBase: (value) => value },
      { id: 'fahrenheit', label: 'Fahrenheit', symbol: '°F', toBase: (value) => (value - 32) * 5 / 9, fromBase: (value) => value * 9 / 5 + 32 },
      { id: 'kelvin', label: 'Kelvin', symbol: 'K', toBase: (value) => value - 273.15, fromBase: (value) => value + 273.15 },
    ],
  },
  speed: {
    label: 'Speed',
    units: [
      linearUnit('meter-per-second', 'Meters per second', 'm/s', 1),
      linearUnit('kilometer-per-hour', 'Kilometers per hour', 'km/h', 0.2777777777777778),
      linearUnit('mile-per-hour', 'Miles per hour', 'mph', 0.44704),
      linearUnit('knot', 'Knots', 'kn', 0.5144444444444445),
    ],
  },
  data: {
    label: 'Data & storage',
    units: [
      linearUnit('byte', 'Bytes', 'B', 1),
      linearUnit('kilobyte', 'Kilobytes (decimal)', 'KB', 1000),
      linearUnit('megabyte', 'Megabytes (decimal)', 'MB', 1_000_000),
      linearUnit('gigabyte', 'Gigabytes (decimal)', 'GB', 1_000_000_000),
      linearUnit('terabyte', 'Terabytes (decimal)', 'TB', 1_000_000_000_000),
      linearUnit('kibibyte', 'Kibibytes (binary)', 'KiB', 1024),
      linearUnit('mebibyte', 'Mebibytes (binary)', 'MiB', 1_048_576),
      linearUnit('gibibyte', 'Gibibytes (binary)', 'GiB', 1_073_741_824),
      linearUnit('tebibyte', 'Tebibytes (binary)', 'TiB', 1_099_511_627_776),
    ],
  },
  energy: {
    label: 'Energy',
    units: [
      linearUnit('joule', 'Joules', 'J', 1),
      linearUnit('kilojoule', 'Kilojoules', 'kJ', 1000),
      linearUnit('watt-hour', 'Watt-hours', 'Wh', 3600),
      linearUnit('kilowatt-hour', 'Kilowatt-hours', 'kWh', 3_600_000),
      linearUnit('btu', 'British thermal units', 'BTU', 1055.05585262),
      linearUnit('kilocalorie', 'Kilocalories', 'kcal', 4184),
    ],
  },
  pressure: {
    label: 'Pressure',
    units: [
      linearUnit('pascal', 'Pascals', 'Pa', 1),
      linearUnit('kilopascal', 'Kilopascals', 'kPa', 1000),
      linearUnit('bar', 'Bar', 'bar', 100_000),
      linearUnit('psi', 'Pounds per square inch', 'psi', 6894.757293168),
      linearUnit('atmosphere', 'Standard atmospheres', 'atm', 101_325),
      linearUnit('millimeter-mercury', 'Millimeters of mercury', 'mmHg', 133.322387415),
    ],
  },
};

export function convertUnit(categoryId, fromId, toId, rawValue) {
  const category = conversionCategories[categoryId];
  if (!category) throw new Error(`Unknown category: ${categoryId}`);
  const from = category.units.find(({ id }) => id === fromId);
  const to = category.units.find(({ id }) => id === toId);
  if (!from || !to) throw new Error(`Unknown unit for ${categoryId}`);
  const value = Number(rawValue);
  if (!Number.isFinite(value)) throw new Error('Value must be a finite number');
  const base = from.toBase ? from.toBase(value) : value * from.factor;
  return to.fromBase ? to.fromBase(base) : base / to.factor;
}
