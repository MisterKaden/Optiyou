# Optiyou

Optiyou is the Cloudflare Worker-backed website for `optiyou.co`.

## Develop

```bash
npm ci
npx wrangler d1 migrations apply optiyou-core --local
npm run dev
```

## Platform

Optiyou is now scaffolded as a Cloudflare-first product intelligence platform for U.S./Canada packaged food. The main Worker exposes `/v1/scan`, product lookup, scoring, contribution/upload, AI ask, methodology, StoreKit notification, and admin API surfaces. The storage split is D1 for structured truth, R2 for artifacts, KV for hot product cards and config, Queues for async ingestion, Analytics Engine for usage signals, Workers AI/AI Gateway for extraction and explanations, and Vectorize for the evidence graph.

Architecture details live in `docs/platform-architecture.md`. D1 migrations live in `migrations/`.

## iOS

The SwiftUI app lives in `ios/` and is generated with XcodeGen.

```bash
xcodegen generate --spec ios/project.yml
open ios/Optiyou.xcodeproj
```

Core product scoring is deterministic and covered by unit tests in `ios/OptiyouTests`.

## Verify

```bash
npm run typecheck
npm test
npm run check
```

## Deploy

Production deploys run from GitHub Actions on pushes to `main`.

```bash
npm run deploy
```

Operational details live in `docs/cloudflare-operations.md`.
