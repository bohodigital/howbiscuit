# Product database

`content/products/` is the canonical Handoff 2 product authority. Each record identifies one exact variant through brand, model, exact variant, normalized attributes, and validated manufacturer or retailer identifiers. Competing records for the same canonical fingerprint or identifier fail closed.

Records include description, source and media IDs, provenance, and workflow status. Public text is plain and escaped at the rendering boundary. Provenance must match testing evidence and cannot overstate use or recommendation.

Production remains honestly empty until verified real records exist. Do not add placeholder products to make the shop look populated. Use `product:validate`, then `product:compile` when canonical records change.
