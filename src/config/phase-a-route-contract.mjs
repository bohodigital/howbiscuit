/**
 * Frozen document-route boundary accepted in Phase A.
 *
 * Phase B may replace rendering and shell behavior, but it must neither remove
 * a current document route nor activate a Phase C document route. Keep this
 * list explicit so a one-for-one source replacement cannot satisfy validation
 * by preserving only the document count.
 */
export const ACCEPTED_PHASE_A_DOCUMENT_ROUTES = Object.freeze([
  '/',
  '/about/',
  '/affiliate-disclosure/',
  '/articles/',
  '/articles/how-does-baking-powder-work/',
  '/articles/why-are-some-answers-better-than-others/',
  '/articles/why-salt-melts-ice/',
  '/buying-guides/',
  '/contact/',
  '/cook/',
  '/corrections/',
  '/editorial-policy/',
  '/glossary/',
  '/home-tech/',
  '/home-tech/gaming-pcs/',
  '/home-tech/laptops/',
  '/home-tech/privacy-security/',
  '/home-tech/smart-home/',
  '/home-tech/streaming-tvs/',
  '/home-tech/wifi-routers/',
  '/make-do/',
  '/privacy/',
  '/research-writing/',
  '/science/',
  '/tools/',
]);

export const PHASE_C_ONLY_DOCUMENT_ROUTES = Object.freeze([
  '/home/',
  '/home-tech/computers-laptops/',
  '/home-tech/tvs-streaming/',
  '/kitchen/',
  '/shop/',
]);
