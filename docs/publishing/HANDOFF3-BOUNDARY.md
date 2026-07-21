# Handoff 3 boundary

Handoff 3 owns live offers, retailer adapters, live prices, live availability, geographic lookup, ZIP/ZCTA/CBSA behavior, fuel prices, affiliate activation, click analytics, D1, R2, Queues, external quotas, and kill switches.

Handoff 2 contains only deterministic static content, canonical product identity, unpaid dated destinations, dated price observations, governed recommendations, and release tooling. It makes no live retailer request, stores no click event, activates no affiliate relationship, and provisions none of the Handoff 3 infrastructure.

Handoff 3 must begin from the exact final Handoff 2 main commit recorded in Bohopi and the production release marker, then preserve all Handoff 2 governance and fail-closed publication rules.
