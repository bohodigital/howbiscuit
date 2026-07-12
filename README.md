# How Biscuit

How Biscuit is a colorful, answer-first field guide for school, cooking, home tech, everyday science, and making do.

## Development

```sh
npm ci
npm run dev
npm run qa
```

The production Cloudflare Pages build uses `npm run build` and publishes `dist/`. The separate private review build uses `npm run build:sites`.

## Analytics

The site intentionally includes both:

- self-hosted Umami for privacy-restrained first-party traffic and event analytics;
- Google Analytics 4 for aggregate audience and interaction reporting.

Tracker behavior is disclosed on the public privacy page. Analytics credentials are not stored in this repository.

## License

Copyright Boho Digital Services. All rights reserved.
