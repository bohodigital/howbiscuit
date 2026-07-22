# ADR: Handoff 3 canonical product identity

Status: accepted for Handoff 3A foundation

## Decision

Handoff 2 product IDs identify exact sellable variants and remain the sole product-authoring authority. Runtime records reference those IDs directly. Product-family records, when introduced, are presentation-only groupings and cannot define offer-comparison identity.

Provider responses cannot create canonical products. A merchant mapping is usable only when exact identifier evidence exists or a human explicitly reviews the complete variant evidence. Unmatched and probable results remain nonpublic review candidates.

Canonical product edits continue through the Handoff 2 YAML, validation, approval, and deterministic compiler workflow. D1 stores only a projection of `src/generated/publishing/products.v1.json`; the projection can be rebuilt from Git and never writes back to canonical content.

## Consequences

- Offers for unknown, draft, or retired canonical products fail closed.
- Duplicate canonical IDs or identity digests stop projection synchronization.
- Runtime rows record the source Git commit and catalog schema version.
- Deleting or retiring a canonical product retires its runtime projection rather than creating a replacement identity.
- Merchant title similarity, imagery, and provider ranking are never sufficient match evidence.

## Rollback

Disable `GLOBAL_OFFERS_ENABLED` or the affected source. The static Handoff 2 site and its governed unpaid links continue to render without the runtime projection.
