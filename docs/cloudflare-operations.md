# Optiyou Cloudflare Operations

This repository is the source of truth for `optiyou.co`.

## Current Target

- Cloudflare account: `75c2ecd9fee15d06f93013c411f31aaa`
- Worker: `optiyou`
- Canonical host: `optiyou.co`
- Redirect host: `www.optiyou.co`
- Runtime config: `wrangler.jsonc`
- Production branch: `main`

## Deployment Paths

Preferred CI path:

1. Push to `main`.
2. GitHub Actions runs `.github/workflows/deploy.yml`.
3. The workflow typechecks, validates the Worker bundle, and runs `wrangler deploy` when the required Cloudflare secrets are present.
4. Cloudflare publishes the Worker to `optiyou.co` and `www.optiyou.co`.

The current repository already has `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ZONE_ID` set. Add `CLOUDFLAREOPTI_API_TOKEN` to turn on automatic deploys from GitHub.

Native Cloudflare Workers Builds path:

1. Install or authorize the Cloudflare GitHub App for `MisterKaden/Optiyou`.
2. Connect the `main` branch to the `optiyou` Worker in Cloudflare Workers Builds.
3. Use `npm ci && npm run deploy` as the build/deploy command if Cloudflare asks for one.

GitHub Actions is still kept as the repo-owned fallback because it is reviewable in Git.

Local deploy path:

```bash
npm ci
npx wrangler d1 migrations apply optiyou-core --remote
npm run typecheck
npm test
npm run check
npm run deploy
```

Cloudflare DNS and zone baseline path:

```bash
CLOUDFLARE_API_TOKEN=... npm run cloudflare:bootstrap
```

## Required GitHub Secrets

Add these repository secrets in GitHub:

- `CLOUDFLAREOPTI_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`

Use account ID:

```text
75c2ecd9fee15d06f93013c411f31aaa
```

The Cloudflare API token should be scoped to the smallest useful production set:

- Account: Workers Scripts - Edit
- Account: Workers Routes - Edit
- Account: Account Settings - Read
- Zone: Zone - Read for `optiyou.co`
- Zone: DNS - Edit for `optiyou.co` if CI will ever manage DNS records
- Zone: Zone Settings - Edit for `optiyou.co` if running `npm run cloudflare:bootstrap`

## DNS Baseline

The ideal Cloudflare DNS baseline for a Worker route deployment is:

- `optiyou.co` proxied through Cloudflare
- `www.optiyou.co` proxied through Cloudflare
- No competing A, AAAA, CNAME, or Pages custom-domain records for the same hostnames
- SSL/TLS mode: Full or Full (strict)
- Always Use HTTPS: enabled
- Automatic HTTPS Rewrites: enabled
- HTTP/3: enabled
- Brotli: enabled

Worker routes in `wrangler.jsonc` should own web traffic for both hosts.

`scripts/bootstrap-cloudflare.sh` applies this DNS baseline:

- `A optiyou.co -> 192.0.2.1`, proxied
- `CNAME www.optiyou.co -> optiyou.co`, proxied
- SSL strict mode, HTTPS redirects, HTTPS rewrites, Brotli, HTTP/3, and minimum TLS 1.2

## Runtime Endpoints

- `/_health` returns a no-cache health payload.
- `/_version` returns deployment metadata.
- `www.optiyou.co/*` redirects to `optiyou.co/*`.
- `POST /v1/scan` returns an instant product card for known GTINs or a missing-product contribution intent.
- `GET /v1/methodology` returns the deterministic packaged-food scoring scope and trust rules.
- `PUT /v1/uploads/:token` stores signed contribution uploads in R2 through the Worker.
- `/v1/admin/*` routes require Cloudflare Access plus `x-optiyou-admin-token`.

## Product Intelligence Bindings

The platform bindings are declared in `wrangler.jsonc`:

- D1: `DB` / `optiyou-core`
- KV: `PRODUCT_CACHE`, `APP_CONFIG`, `METHODOLOGY_CACHE`
- R2: `PRODUCT_ARTIFACTS` / `optiyou-product-artifacts`
- Queues: `INGESTION_QUEUE`, `NOTIFICATION_QUEUE`
- Analytics Engine: `SCAN_ANALYTICS`
- Workers AI: `AI`
- Vectorize: `PRODUCT_EVIDENCE_INDEX`

Create matching Cloudflare resources before remote deploy if they do not already exist, then rerun:

```bash
npx wrangler types
```

Required Worker secrets:

- `UPLOAD_SIGNING_SECRET`
- `ADMIN_API_TOKEN`
- `AUTH_JWT_SECRET`

Optional auth claim checks:

- `AUTH_JWT_ISSUER`
- `AUTH_JWT_AUDIENCE`

For local development, copy `.dev.vars.example` to `.dev.vars` and replace the placeholders. `.dev.vars` is ignored by Git.

## Development Rules

- Keep all Cloudflare runtime changes in `wrangler.jsonc`.
- Do not add Cloudflare Dashboard-only behavior unless it is documented here.
- Put local-only secrets in `.dev.vars`; never commit them.
- Before pushing, run:

```bash
npm run typecheck
npm test
npm run check
```
