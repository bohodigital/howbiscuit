import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleTaxRateRequest } from '../src/lib/tax-data-gateway.mjs';
import { handleTaxCoverageRequest, handleTaxLocationRequest } from '../src/lib/free-tax-data.mjs';

const root = normalize(join(fileURLToPath(new URL('..', import.meta.url)), 'dist'));
const port = Number(process.env.PORT ?? 4322);
const host = process.env.HOST ?? '127.0.0.1';

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

const sendWebResponse = async (response, outgoing) => {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
};

const readIncomingBody = async (incoming) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of incoming) {
    size += chunk.length;
    if (size > 2_048) throw new Error('request too large');
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
};

const safeStaticFile = (pathname) => {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const relativePath = decoded.replace(/^\/+/, '');
  const paths = extname(relativePath)
    ? [join(root, relativePath)]
    : [join(root, relativePath, 'index.html'), join(root, `${relativePath}.html`)];
  return paths.find((candidate) => {
    const staysInsideRoot = !relative(root, normalize(candidate)).startsWith('..');
    return staysInsideRoot && existsSync(candidate) && statSync(candidate).isFile();
  });
};

if (!existsSync(join(root, 'index.html'))) {
  throw new Error('Build the site before starting the local preview.');
}

createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url ?? '/', `http://${host}:${port}`);
  if (url.pathname === '/api/tax-rates') {
    const headers = new Headers();
    Object.entries(incoming.headers).forEach(([name, value]) => {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    });
    let body;
    try {
      body = incoming.method === 'POST' ? await readIncomingBody(incoming) : undefined;
    } catch {
      outgoing.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'The location request is too large.' }));
      return;
    }
    const request = new Request(url, { method: incoming.method, headers, body });
    const response = await handleTaxRateRequest(request, {
      CDC_SOCRATA_APP_TOKEN: process.env.CDC_SOCRATA_APP_TOKEN,
      TAX_ALLOW_PAID_FALLBACK: process.env.TAX_ALLOW_PAID_FALLBACK,
      ZIPTAX_API_KEY: process.env.ZIPTAX_API_KEY,
      ZIPTAX_PRODUCT_RULES: process.env.ZIPTAX_PRODUCT_RULES,
    });
    await sendWebResponse(response, outgoing);
    return;
  }

  if (url.pathname === '/api/tax-data/coverage') {
    const response = await handleTaxCoverageRequest(new Request(url, { method: incoming.method }));
    await sendWebResponse(response, outgoing);
    return;
  }

  if (url.pathname === '/api/tax-data/locate') {
    const response = await handleTaxLocationRequest(new Request(url, { method: incoming.method }));
    await sendWebResponse(response, outgoing);
    return;
  }

  if (!['GET', 'HEAD'].includes(incoming.method ?? 'GET')) {
    outgoing.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Method not allowed.');
    return;
  }

  const staticFile = safeStaticFile(url.pathname);
  const file = staticFile ?? join(root, '404.html');
  outgoing.statusCode = staticFile ? 200 : 404;
  outgoing.setHeader('Content-Type', types[extname(file).toLowerCase()] ?? 'application/octet-stream');
  outgoing.setHeader('Cache-Control', extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600');
  if (incoming.method === 'HEAD') outgoing.end();
  else createReadStream(file).pipe(outgoing);
}).listen(port, host, () => {
  console.log(`How Biscuit preview: http://${host}:${port}/`);
});
