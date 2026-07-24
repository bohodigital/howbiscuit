# Research Packet v2

Research Packet v2 turns approved release records into reviewable article and tool evidence. Each packet declares its release, sources, evidence IDs, dates, approval, reviewer, staleness, cadence, factual claims, classifications, limitations, unsupported-claim warnings, citation notes, tables, charts, and disclosure.

Useful commands:

```sh
npm run research:list
npm run research:status -- --packet electricity-il-vs-us
npm run research:packet -- --topic electricity-il-vs-us
npm run research:packet -- --source eia
npm run research:packet -- --product <canonical-product-id> --location kroger-location-53100516
npm run research:validate
```

Accepted packets are immutable. `research:approve` and `research:retire` intentionally refuse in-place mutation: the editor must create a new release candidate and carry the existing owner/editorial approval record through review.

Article manifests declare `researchPacketIds`. Governed Markdown can render:

```text
::research-summary{packet="electricity-il-vs-us"}
::research-table{packet="electricity-il-vs-us" table="evidence"}
::research-chart{packet="electricity-il-vs-us" chart="trend"}
::research-source-note{packet="electricity-il-vs-us"}
```

The compiler rejects missing, draft, retired, unapproved, stale, unsupported, or incomplete packets and missing table/chart IDs. Rendering uses static release JSON, so ordinary article loads make no provider calls. The internal fixture at `test/fixtures/publishing/research-rendering.md` proves all four render modes without changing approved public prose.
