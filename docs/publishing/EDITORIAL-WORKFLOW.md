# Editorial workflow

The only workflow is `draft -> review -> approved -> published -> retired`. Skipped, reversed, or stale transitions are rejected. Ideas must be published, briefs approved, referenced governance records active, and each article must have exactly one suitable testing record even when the state is explicitly not hands-on tested.

Owner approval is a separate active record containing the exact publication digest. The digest binds article files and all approval-relevant governance dependencies. Any relevant change invalidates the old approval.

`article:ingest` accepts only a non-published package with `approvalId: null`. `--update` is mandatory for an existing ID/slug/route and preserves the old canonical package if validation fails. Only one repository ingest may run at a time; lock contention fails closed. Ingestion does not compile canonical outputs or deploy anything.

Publication occurs only after a human approves the new digest, the workflow is advanced through the allowed states, generated artifacts are compiled, and full QA passes.
