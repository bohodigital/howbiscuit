import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workerPath = join(root, 'dist', '_worker.js');

const modulePaths = [
  join(root, 'src', 'lib', 'tax-source-registry.mjs'),
  join(root, 'src', 'lib', 'free-tax-data.mjs'),
  join(root, 'src', 'lib', 'tax-data-gateway.mjs'),
];

const stripModuleSyntax = (source) => source
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm, '')
  .replace(/^export\s*\{[\s\S]*?\};\s*$/gm, '')
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|(?:const|let|var|class)\b)/g, '');

const gatewaySource = modulePaths
  .map((path) => stripModuleSyntax(readFileSync(path, 'utf8')).trim())
  .join('\n\n');

const workerSource = `${gatewaySource.trim()}\n\nexport default {\n  async fetch(request, env, context) {\n    const url = new URL(request.url);\n    if (url.pathname === '/api/tax-rates') {\n      return handleTaxRateRequest(request, env, context);\n    }\n    if (url.pathname === '/api/tax-data/coverage') {\n      return handleTaxCoverageRequest(request, env);\n    }\n    if (url.pathname === '/api/tax-data/locate') {\n      return handleTaxLocationRequest(request);\n    }\n    return env.ASSETS.fetch(request);\n  },\n};\n`;

writeFileSync(workerPath, workerSource);
console.log('Prepared Cloudflare public tax-data gateway.');
