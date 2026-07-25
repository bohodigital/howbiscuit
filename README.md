# How Biscuit

This repository is the public distribution baseline for the How Biscuit website.
It contains only the approved static site in `site/` and the small,
dependency-free verification contract needed to reproduce `dist/`.

Editorial working material, research, operational records, governance, secrets,
and deployment configuration are intentionally outside this public repository.
Nothing in this repository deploys or publishes the site.

## Verify and build

Node.js 20 or newer is required.

```sh
npm test
npm run build
```

`npm test` verifies the allowlisted file inventory, content digests, route
inventory, privacy exclusions, and reproducibility. `npm run build` creates
`dist/` as a byte-for-byte copy of the accepted static distribution.

Future public changes must arrive as a reviewed promotion package containing
only explicitly approved public files. The verifier is default-deny: an added,
removed, or changed public artifact fails until the release manifest is
deliberately regenerated and reviewed.
