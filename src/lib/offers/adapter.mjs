import { normalizedOfferSchema } from './schema.mjs';

export function createFixtureAdapter({ sourceId, offers = [], healthState = 'healthy' }) {
  const normalized = offers.map((offer) => normalizedOfferSchema.parse(offer));
  return Object.freeze({
    sourceId,
    async health() { return healthState; },
    async lookup({ productId, condition, fulfillment }) {
      return normalized.filter((offer) => offer.canonicalProductId === productId
        && offer.condition === condition
        && (!fulfillment || offer.fulfillment.includes(fulfillment)));
    },
  });
}

export function assertAdapter(adapter) {
  if (!adapter || typeof adapter.sourceId !== 'string' || typeof adapter.lookup !== 'function' || typeof adapter.health !== 'function') {
    throw new TypeError('Adapter must expose sourceId, lookup(), and health().');
  }
  return adapter;
}
