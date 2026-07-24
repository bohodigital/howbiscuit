import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import { load as parseYaml } from 'js-yaml';

import { readAcceptedPointer, repositoryRoot, stableJson, validateRelease } from '../data/release-lib.mjs';
import {
  assertSafeToolContent,
  toolDefinitionJsonSchema,
  toolDefinitionSchema,
  toolManifestJsonSchema,
  toolManifestSchema,
  toolPackageJsonSchema,
} from './contracts.mjs';

const generatedPath = path.join(repositoryRoot, 'src', 'generated', 'tools', 'tools.v1.json');
const generatedManifestSchemaPath = path.join(repositoryRoot, 'schemas', 'generated', 'tool-manifest-v1.schema.json');
const generatedDefinitionSchemaPath = path.join(repositoryRoot, 'schemas', 'generated', 'tool-definition-v1.schema.json');
const contentRoot = path.join(repositoryRoot, 'content', 'tools');
const maximumFileBytes = 256 * 1024;

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeYamlDates(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normalizeYamlDates);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeYamlDates(item)]));
  return value;
}

function readRegularFile(file, label) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumFileBytes) throw new Error(`${label}: unsafe package file`);
  return readFileSync(file, 'utf8');
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'Not reported';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 6 });
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None reported';
  return String(value);
}

function rowsForDefinition(definition, release) {
  const d = release.datasets;
  if (definition.kind === 'energy-benchmark') return d.energyObservations.map((row) => ({ ...row, valueDisplay: `${displayValue(row.value)} ${row.unit}` }));
  if (definition.kind === 'zip-relationship') return d.geographyRelationships.map((row) => ({ ...row, residentialWeight: `${(row.residentialRatio * 100).toFixed(4)}%`, ambiguous: d.geographyRelationships.filter((candidate) => candidate.zip === row.zip && candidate.geographyType === row.geographyType).length > 1 ? 'Yes' : 'No' }));
  if (definition.kind === 'food-identity') return d.foods.map((row) => ({ ...row, publicationDate: row.publicationDate ?? 'Not supplied', nutrients: d.foodNutrients.filter(({ foodId }) => foodId === row.id).map(({ nutrientName, amount, unit, basis }) => `${nutrientName}: ${amount} ${unit} per ${basis}`).join('; ') || 'No complete nutrient rows available' }));
  if (definition.kind === 'crop-production') return d.agriculturalStatistics.map((row) => ({ ...row, valueDisplay: row.suppressed ? 'Suppressed' : `${displayValue(row.value)} ${row.unit}`, revision: row.sourceRevisionAt ?? 'Not supplied' }));
  if (definition.kind === 'market-context') return d.marketObservations.map((row) => {
    const report = d.marketReports.find(({ id }) => id === row.reportId);
    return { ...row, title: report?.title ?? row.reportId, valueDisplay: row.valueMin === row.valueMax ? displayValue(row.valueMin) : `${displayValue(row.valueMin)} to ${displayValue(row.valueMax)}`, narrative: report?.narrative ?? '' };
  });
  throw new Error(`Unsupported tool definition kind: ${definition.kind}`);
}

function optionsForInputs(definition, rows) {
  return definition.inputs.map((input) => {
    const values = [...new Set(rows.map((row) => row[input.field]).filter((value) => value !== null && value !== undefined).map(String))].sort((a, b) => a.localeCompare(b, 'en'));
    if (values.length > input.maximumOptions) throw new Error(`${input.id}: ${values.length} options exceed bound ${input.maximumOptions}`);
    return { ...input, options: values };
  });
}

export function compileToolPackages() {
  const acceptedId = readAcceptedPointer().releaseId;
  const release = validateRelease(acceptedId, { requireAccepted: true });
  const packetById = new Map(release.packets.map((packet) => [packet.id, packet]));
  if (!existsSync(contentRoot)) throw new Error('content/tools is required');
  const entries = readdirSync(contentRoot, { withFileTypes: true }).filter((entry) => !entry.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const tools = [];
  const ids = new Set();
  const routes = new Set();
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const packageValidator = ajv.compile(toolPackageJsonSchema);
  const manifestValidator = ajv.compile(toolManifestJsonSchema);
  const definitionValidator = ajv.compile(toolDefinitionJsonSchema);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`content/tools/${entry.name}: package directory required`);
    const packageRoot = path.join(contentRoot, entry.name);
    const filenames = readdirSync(packageRoot).sort();
    if (JSON.stringify(filenames) !== JSON.stringify(['content.md', 'manifest.yaml', 'tool-definition.json'])) throw new Error(`${entry.name}: package files must be content.md, manifest.yaml, and tool-definition.json`);
    const rawManifest = normalizeYamlDates(parseYaml(readRegularFile(path.join(packageRoot, 'manifest.yaml'), `${entry.name}/manifest.yaml`)));
    const rawDefinition = JSON.parse(readRegularFile(path.join(packageRoot, 'tool-definition.json'), `${entry.name}/tool-definition.json`));
    const runtimeManifest = toolManifestSchema.safeParse(rawManifest);
    const runtimeDefinition = toolDefinitionSchema.safeParse(rawDefinition);
    const schemaManifest = manifestValidator(rawManifest);
    const schemaDefinition = definitionValidator(rawDefinition);
    if (runtimeManifest.success !== schemaManifest || runtimeDefinition.success !== schemaDefinition) throw new Error(`${entry.name}: JSON Schema/runtime validation parity failure`);
    if (!runtimeManifest.success) throw runtimeManifest.error;
    if (!runtimeDefinition.success) throw runtimeDefinition.error;
    const manifest = runtimeManifest.data;
    const definition = runtimeDefinition.data;
    const content = assertSafeToolContent(readRegularFile(path.join(packageRoot, 'content.md'), `${entry.name}/content.md`), `${entry.name}/content.md`);
    const parityPayload = { manifest, definition, content };
    if (!packageValidator(parityPayload)) throw new Error(`${entry.name}: JSON Schema parity failure: ${ajv.errorsText(packageValidator.errors)}`);
    if (entry.name !== manifest.slug) throw new Error(`${entry.name}: package directory and slug differ`);
    if (ids.has(manifest.id) || routes.has(manifest.canonicalRoute)) throw new Error(`${entry.name}: duplicate tool ID or route`);
    ids.add(manifest.id);
    routes.add(manifest.canonicalRoute);
    if (!manifest.sourceReleaseIds.includes(acceptedId)) throw new Error(`${entry.name}: accepted data release ${acceptedId} is not declared`);
    for (const packetId of manifest.researchPacketIds) {
      const packet = packetById.get(packetId);
      if (!packet || packet.status !== 'validated' || packet.approval.state !== 'approved' || packet.staleness.state !== 'current') throw new Error(`${entry.name}: unapproved, retired, or stale packet ${packetId}`);
    }
    for (const datasetId of manifest.datasetIds) if (!Array.isArray(release.datasets[datasetId])) throw new Error(`${entry.name}: missing dataset ${datasetId}`);
    const rows = rowsForDefinition(definition, release);
    for (const { field } of definition.table.columns) if (rows.some((row) => !(field in row))) throw new Error(`${entry.name}: table field ${field} is not present in every row`);
    if (definition.chart.enabled && rows.some((row) => !(definition.chart.xField in row) || !(definition.chart.yField in row))) throw new Error(`${entry.name}: chart fields are incomplete`);
    const packageDigest = digest(stableJson(parityPayload));
    tools.push({
      schemaVersion: '1.0.0',
      kind: 'tool',
      sourceKind: 'tool-package',
      sourcePath: `content/tools/${manifest.slug}/manifest.yaml`,
      packageDigest,
      ...manifest,
      definition: { ...definition, inputs: optionsForInputs(definition, rows) },
      content,
      rows,
      releaseId: acceptedId,
      releaseDigest: release.manifest.datasets.map(({ contentDigest }) => contentDigest).join(':'),
      sourceNotes: release.manifest.sources.filter((source) => manifest.datasetIds.some((datasetId) => release.datasets[datasetId].some((row) => row.sourceId === source.sourceId))).map((source) => {
        const envelope = JSON.parse(readFileSync(path.join(release.target, source.envelopePath), 'utf8'));
        return { sourceId: source.sourceId, title: envelope.source.attribution, href: envelope.source.documentationUrl, retrievedAt: envelope.retrievedAt };
      }),
      draft: manifest.publicationStatus !== 'published',
      preview: false,
      thin: false,
      redirectState: null,
      retirementState: manifest.publicationStatus === 'retired' ? { allowedStatuses: [410] } : null,
    });
  }
  if (tools.filter(({ publicationStatus, visibility }) => publicationStatus === 'published' && visibility === 'public').length < 5) throw new Error('At least five public tool packages are required.');
  return { schemaVersion: '1.0.0', releaseId: acceptedId, tools };
}

export function emitToolPackages({ check = false } = {}) {
  const payload = compileToolPackages();
  const body = stableJson(payload);
  if (check) {
    if (!existsSync(generatedPath) || readFileSync(generatedPath, 'utf8') !== body) throw new Error('src/generated/tools/tools.v1.json is stale; run npm run tool:compile.');
    if (!existsSync(generatedManifestSchemaPath) || readFileSync(generatedManifestSchemaPath, 'utf8') !== stableJson(toolManifestJsonSchema)) throw new Error('Generated tool manifest JSON Schema is stale.');
    if (!existsSync(generatedDefinitionSchemaPath) || readFileSync(generatedDefinitionSchemaPath, 'utf8') !== stableJson(toolDefinitionJsonSchema)) throw new Error('Generated tool definition JSON Schema is stale.');
  } else {
    mkdirSync(path.dirname(generatedPath), { recursive: true });
    writeFileSync(generatedPath, body);
    mkdirSync(path.dirname(generatedManifestSchemaPath), { recursive: true });
    writeFileSync(generatedManifestSchemaPath, stableJson(toolManifestJsonSchema));
    writeFileSync(generatedDefinitionSchemaPath, stableJson(toolDefinitionJsonSchema));
  }
  return payload;
}
