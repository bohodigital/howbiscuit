const APEX_HOST = "howbiscuit.com";
const WWW_HOST = "www.howbiscuit.com";
const EXACT_REDIRECTS = new Map([["/make-do/","/home/"],["/cook/","/kitchen/"],["/buying-guides/","/shop/"],["/research-writing/","/editorial-policy/"],["/home-tech/gaming-pcs/","/home-tech/computers-laptops/"],["/home-tech/laptops/","/home-tech/computers-laptops/"],["/home-tech/streaming-tvs/","/home-tech/tvs-streaming/"]]);
const WILDCARD_REDIRECTS = Object.freeze([["/cooking/","/kitchen/"],["/make-do-lab/","/home/"]]);
const SECURITY_HEADERS = Object.freeze([["Content-Security-Policy","default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://analytics.bohodigitalservices.com https://www.googletagmanager.com; connect-src 'self' https://analytics.bohodigitalservices.com https://www.google-analytics.com https://region1.google-analytics.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self'; upgrade-insecure-requests"],["Strict-Transport-Security","max-age=63072000; includeSubDomains; preload"],["X-Content-Type-Options","nosniff"],["X-Frame-Options","DENY"],["Referrer-Policy","no-referrer"],["Permissions-Policy","camera=(), microphone=(), geolocation=()"]]);
function migratedPath(pathname) {
  const exact = EXACT_REDIRECTS.get(pathname);
  if (exact) return exact;
  for (const [prefix, destination] of WILDCARD_REDIRECTS) {
    if (pathname.startsWith(prefix)) return destination;
  }
  return null;
}
export function redirectLocation(request) {
  const url = new URL(request.url);
  const destinationPath = migratedPath(url.pathname);
  const canonicalizeHost = url.hostname === WWW_HOST;
  if (!destinationPath && !canonicalizeHost) return null;
  if (canonicalizeHost) {
    url.protocol = 'https:';
    url.hostname = APEX_HOST;
    url.port = '';
  }
  if (destinationPath) url.pathname = destinationPath;
  return url.toString();
}
function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of SECURITY_HEADERS) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function assetResponse(request, env) {
  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404 || !['GET', 'HEAD'].includes(request.method)) return response;
  const fallbackUrl = new URL(request.url);
  fallbackUrl.pathname = '/404';
  fallbackUrl.search = '';
  const fallback = await env.ASSETS.fetch(new Request(fallbackUrl, { method: request.method, headers: request.headers }));
  if (!fallback.ok) return response;
  return new Response(request.method === 'HEAD' ? null : fallback.body, { status: 404, statusText: 'Not Found', headers: fallback.headers });
}
export default {
  async fetch(request, env) {
    const location = redirectLocation(request);
    const response = location ? Response.redirect(location, 301) : await assetResponse(request, env);
    return withSecurityHeaders(response);
  },
};
