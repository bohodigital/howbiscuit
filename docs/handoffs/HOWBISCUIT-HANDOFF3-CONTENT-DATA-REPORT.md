# How Biscuit Handoff 3 content-data report

Date: 2026-07-24  
Owning repository: `howbiscuit-site`  
Release: `h3-content-data-2026-07-24`

## Delivered

- Six active broker-backed source policies and one explicit Best Buy exclusion.
- Fifteen new normalized D1 tables, raising the validated schema to 39 runtime tables.
- 40 HUD ZIP relationships across county and CBSA mappings.
- 99 EIA monthly residential electricity and natural-gas observations.
- 15 FoodData Central staple-food identities.
- Five MyMarketNews report definitions and two safely interpretable observations.
- 15 NASS annual U.S. crop-production statistics.
- Two approved exact Kroger mappings; no probable match was promoted.
- 18 deterministic research packets with sources, retrieval time, evidence IDs, claim candidates, and limitations.
- A governed `::research{packet="..."}` publishing directive.
- Removal of the direct vault-reading provider wrapper.

## Honest shortfalls

Kroger’s target of 50 approved exact mappings was not met: only two mappings had sufficient exact identity and first-party evidence in the bounded work window. The system reports 2 rather than weakening match rules. FoodData Central nutrient coverage remains zero because the broker-bounded detail response omitted complete nested nutrient names; the importer rejects incomplete nutrient observations.

## Verification contract

`data:check` verifies deterministic output, six source memberships, 18 packets, complete evidence references, and Best Buy exclusion. `offers:migration-check` exercises all ordered D1 migrations. Unit tests cover normalization, suppression, probable-match rejection, packet linkage, and broker boundaries. Build, Pi QA, artifact equality, deployment, and production acceptance are recorded when completed.
