# Autonomous build session — progress & handoff

Branch: **`mvp-autonomous-build`** · Mode: local + commit only (no remote migrations, no deploys).
All work verified: **typecheck clean, 67/67 tests pass**, migrations apply against SQLite.

## What shipped (commits oldest → newest)

1. **Scoring hardening** — `safetyLevel`/`gradeBand`, `observedAt` vs `sourcePublishedAt` split,
   `wheat ≠ gluten`, split universal/personalization reason codes, allergen hard-cap, golden fixtures.
2. **Phase 2 — admin role + visibility gate** — `isAdmin` via `ADMIN_USER_IDS`/`ADMIN_EMAILS`;
   `requireAdminAccess` (legacy token fallback); `src/platform/visibility.ts` (user-visible = verified
   OR unverified & confidence ≥ 0.7); scan returns `pending_verification` + contribution for hidden
   products; lists filtered; only visible cards cached.
3. **Phase 3a — cosmetic scoring** (`cosmetic-us-ca-v1`) — `src/cosmetics/` multi-axis, dose/use-aware,
   evidence-graded; banned = the only hard cap; fragrance/contested inform via advisories.
4. **Phase 3b — cosmetics data layer** — migration 0005 (`vertical`, `cosmetic_scores`); Open Beauty
   Facts normalizer (ODbL → `primary_source='off'`); `scripts/import-open-beauty.ts`.
5. **Phase 5 groundwork — metrics** — `getAdminMetrics()` + `GET /v1/admin/metrics` (D1-derived).
6. **Phase 3 — cosmetic product-card** + visibility gate generalized to both verticals.
7. **Phase 4 foundation — Ingredient Intelligence graph** — migration 0006 (`evidence_sources`,
   `ingredient_knowledge`, `ingredient_evidence`); `src/evidence/` Evidence Card types + guardrails
   (no-fabricated-citations, contested rules, weak-evidence→advisory) + `applyEvidence` read-path.

## Morning checklist (the bits I intentionally did NOT do)

1. **Review the branch** `mvp-autonomous-build` and merge to `main` if it looks good.
2. **Apply migrations to remote D1** (I only applied 0004 earlier; 0005 + 0006 are pending):
   `for m in 0004 0005 0006; do npx wrangler d1 migrations apply optiyou-core --remote; done`
   (or just run the migrations-apply once — it applies all unapplied).
3. **Grant yourself admin**: set `ADMIN_USER_IDS` (your `apple:...` id) or `ADMIN_EMAILS` as a prod
   var/secret. Until then, no one has the admin role (legacy `ADMIN_API_TOKEN` still works).

## North-star push — Frontier #1: iOS ↔ backend sync (branch `ios-backend-sync`)

Mapped the SwiftUI app (backend-first scoring with a local fallback; base URL = optiyou.co; all DTOs
optional + snake_case, so new fields were silently dropped). Synced the high-value shapes:
- **Backend:** `ProductCard` now exposes `safetyLevel` + `gradeBand` (the scorer computed them but
  `buildProductCard` dropped them); `pending_verification` scan response flattened (spread the intent)
  so clients handle it like a missing product.
- **iOS:** `ScoreResult` gains `safetyLevel` (from API) + computed `gradeBand`; the API client decodes
  the new fields, handles `pending_verification`, and adds `AuthenticatedAPIUser.isAdmin`;
  `ProductResultView` shows a prominent **safety banner** (red "Avoid" / amber "Use caution") for
  allergen/dietary conflicts.
- **Verified:** backend tsc + 68 tests; iOS `BUILD SUCCEEDED` + 8/8 `OptiyouTests` (Xcode 26.3, sim).
- Note: `visibility` filtering is enforced server-side (lists only return user-visible products to
  non-admins), so the client needs no extra filter. `isAdmin` is modeled but no in-app admin UI yet.

## Code review (high-effort, recall-biased) — done, 6 of 7 fixed

Ran a multi-angle review of the branch. Fixed: cosmetic rows crashing food queries (added
`vertical='food'` filter to `findProductByGtin`/`searchProducts`/`listAlternatives` — **the critical
one**); D1 placeholder safety in `listEvidenceCards`; an unmatchable comma keyword; oxybenzone
endocrine+contested double-penalty; silent metrics-query failures; mislabeled `pending_verification`
analytics. **Open:** repeat scans of an unverified product create duplicate contributions (TODO in
`api.ts` — needs the contribution/upload-token flow restructured with integration tests).

## Still TODO (needs attended work / live runtime — not safe unattended)
- **Contribution dedup** (`TODO(contrib-dedup)` in `src/http/api.ts`): reuse an open contribution for
  (user, product) instead of inserting a fresh one on every scan; preserve signed upload tokens.

- **Route the scan/lookup API to the cosmetic scorer.** Cosmetics are imported + scoreable + have a
  card builder, but `handleScan`/`findProductByGtin` are still food-only. Wiring the dual-vertical
  scan path needs real-D1 integration tests the current fake-D1 harness can't provide.
- **Live ATLAS** (populate `ingredient_evidence` from primary literature) — needs Workers AI; the
  deterministic foundation + read-path it writes to are done.
- **Wire the graph into scoring** (apply `applyEvidence` directives over the v0 keyword seeds) — a
  design choice (override vs stack; avoid double-counting) best made attended.
- **Phase 6 photo pipeline** (BiRefNet → R2) — needs Workers AI / R2 runtime.
- **Phase 7 premium/offline**, **Analytics Engine binding** (left out of `wrangler.jsonc` so deploys
  don't fail if the feature isn't enabled), **cosmetic CosIng/regulatory enrichment**.
