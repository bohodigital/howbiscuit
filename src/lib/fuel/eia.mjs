import { z } from 'zod';

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Real calendar date required');

const valueSchema = z.object({
  period: calendarDate,
  value: z.number().positive().max(20),
  status: z.literal('reported'),
}).strict();

const seriesSchema = z.object({
  seriesId: z.enum(['us', 'midwest-padd-2', 'chicago']),
  area: z.string().trim().min(1).max(80),
  scope: z.enum(['national-average', 'regional-average', 'city-average']),
  values: z.array(valueSchema).min(2).max(104),
}).strict();

export const eiaImportSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  sourceId: z.literal('eia-weekly-gasoline'),
  sourceUrl: z.literal('https://www.eia.gov/dnav/pet/pet_pri_gnd_a_epmr_pte_dpgal_w.htm'),
  releaseDate: calendarDate,
  nextReleaseDate: calendarDate,
  product: z.literal('Regular gasoline'),
  frequency: z.literal('weekly'),
  unit: z.literal('dollars-per-gallon-including-taxes'),
  series: z.array(seriesSchema).length(3),
}).strict().superRefine((dataset, context) => {
  if (dataset.nextReleaseDate <= dataset.releaseDate) context.addIssue({ code: 'custom', path: ['nextReleaseDate'], message: 'Next release must follow release date.' });
  const ids = new Set(dataset.series.map((series) => series.seriesId));
  if (ids.size !== 3) context.addIssue({ code: 'custom', path: ['series'], message: 'EIA series must be unique.' });
  for (const [seriesIndex, series] of dataset.series.entries()) {
    for (let index = 1; index < series.values.length; index += 1) {
      if (series.values[index].period <= series.values[index - 1].period) {
        context.addIssue({ code: 'custom', path: ['series', seriesIndex, 'values', index, 'period'], message: 'EIA periods must increase without duplicates.' });
      }
    }
    if (series.values.at(-1)?.period > dataset.releaseDate) context.addIssue({ code: 'custom', path: ['series', seriesIndex], message: 'EIA observations cannot postdate the release.' });
  }
});

export function compileEiaRegionalTrends(input) {
  const parsed = eiaImportSchema.parse(input);
  const series = [...parsed.series]
    .sort((left, right) => left.seriesId.localeCompare(right.seriesId, 'en'))
    .map((entry) => Object.freeze({ ...entry, values: Object.freeze(entry.values.map((value) => Object.freeze({ ...value }))) }));
  const allValues = series.flatMap((entry) => entry.values.map(({ value }) => value));
  return Object.freeze({
    schemaVersion: '1.0.0',
    datasetType: 'regional-fuel-benchmark',
    sourceId: parsed.sourceId,
    sourceUrl: parsed.sourceUrl,
    releaseDate: parsed.releaseDate,
    nextReleaseDate: parsed.nextReleaseDate,
    title: 'EIA weekly regular gasoline benchmarks',
    product: parsed.product,
    frequency: parsed.frequency,
    unit: parsed.unit,
    unitLabel: 'U.S. dollars per gallon, including all taxes',
    disclosure: 'These are EIA aggregate benchmarks. They are not station prices, local availability, or a quote for any purchase.',
    chart: Object.freeze({
      type: 'line',
      minimumValue: Math.floor(Math.min(...allValues) * 10) / 10,
      maximumValue: Math.ceil(Math.max(...allValues) * 10) / 10,
      xAxisLabel: 'Week',
      yAxisLabel: 'Dollars per gallon, including taxes',
      accessibleSummary: 'Six weekly observations compare the U.S., Midwest PADD 2, and Chicago aggregate regular gasoline benchmarks.',
    }),
    series: Object.freeze(series),
  });
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function renderEiaRegionalTrendSvg(compiledInput) {
  const compiled = compileEiaRegionalTrends(compiledInput);
  const width = 960;
  const height = 520;
  const plot = { left: 90, top: 90, right: 900, bottom: 390 };
  const colors = { chicago: '#a33a2b', 'midwest-padd-2': '#255f85', us: '#4f6b3c' };
  const periods = compiled.series[0].values.map(({ period }) => period);
  const x = (index) => plot.left + (index / (periods.length - 1)) * (plot.right - plot.left);
  const y = (value) => plot.bottom - ((value - compiled.chart.minimumValue) / (compiled.chart.maximumValue - compiled.chart.minimumValue)) * (plot.bottom - plot.top);
  const lines = compiled.series.map((series) => {
    const points = series.values.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
    return `<polyline fill="none" stroke="${colors[series.seriesId]}" stroke-width="4" points="${points}"/><g>${series.values.map((point, index) => `<circle cx="${x(index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="5" fill="${colors[series.seriesId]}"><title>${escapeXml(series.area)} ${escapeXml(point.period)}: $${point.value.toFixed(3)} per gallon</title></circle>`).join('')}</g>`;
  }).join('');
  const labels = periods.map((period, index) => `<text x="${x(index).toFixed(1)}" y="420" text-anchor="middle">${escapeXml(period.slice(5))}</text>`).join('');
  const legend = compiled.series.map((series, index) => `<g transform="translate(${100 + index * 250},55)"><line x1="0" y1="0" x2="32" y2="0" stroke="${colors[series.seriesId]}" stroke-width="4"/><text x="42" y="6">${escapeXml(series.area)}</text></g>`).join('');
  const tableRows = compiled.series.map((series) => `<tr><th scope="row">${escapeXml(series.area)}</th>${series.values.map((point) => `<td>${point.value.toFixed(3)}</td>`).join('')}</tr>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="eia-title eia-desc"><title id="eia-title">${escapeXml(compiled.title)}</title><desc id="eia-desc">${escapeXml(compiled.chart.accessibleSummary)} ${escapeXml(compiled.disclosure)}</desc><rect width="100%" height="100%" fill="#fff"/><g font-family="system-ui, sans-serif" font-size="15" fill="#172026"><text x="480" y="28" text-anchor="middle" font-size="22" font-weight="700">${escapeXml(compiled.title)}</text>${legend}<line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.bottom}" stroke="#172026"/><line x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.bottom}" stroke="#172026"/>${labels}${lines}<text x="480" y="458" text-anchor="middle">Week ending (2026)</text><text transform="translate(24 245) rotate(-90)" text-anchor="middle">Dollars per gallon, including taxes</text><text x="480" y="490" text-anchor="middle" font-size="13">EIA aggregate benchmarks — not station prices. Released ${escapeXml(compiled.releaseDate)}.</text></g><foreignObject x="0" y="0" width="1" height="1"><table xmlns="http://www.w3.org/1999/xhtml"><caption>${escapeXml(compiled.title)}</caption><thead><tr><th>Area</th>${periods.map((period) => `<th>${escapeXml(period)}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table></foreignObject></svg>\n`;
}
