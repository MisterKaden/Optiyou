# Optiyou

Optiyou is the Cloudflare Worker-backed website for `optiyou.co`.

## Develop

```bash
npm ci
npm run dev
```

## Verify

```bash
npm run typecheck
npm run check
```

## Deploy

Production deploys run from GitHub Actions on pushes to `main`.

```bash
npm run deploy
```

Operational details live in `docs/cloudflare-operations.md`.

