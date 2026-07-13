import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const gatewayPath = join(root, 'src', 'lib', 'tax-data-gateway.mjs');
const workerPath = join(root, 'dist', '_worker.js');

const gatewaySource = readFileSync(gatewayPath, 'utf8')
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|(?:const|let|var|class)\b)/g, '');

const workerSource = `${gatewaySource.trim()}\n\nexport default {\n  async fetch(request, env, context) {\n    const url = new URL(request.url);\n    if (url.pathname === '/api/tax-rates') {\n      return handleTaxRateRequest(request, env, context);\n    }\n    return env.ASSETS.fetch(request);\n  },\n};\n`;

writeFileSync(workerPath, workerSource);
console.log('Prepared Cloudflare tax-rate gateway.');
