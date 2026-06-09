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

## North-star push — Frontier #2 (cosmetics end-to-end) + #7 (marketing)

- **#2 cosmetic scan-routing (backend):** `findCosmeticByGtin` + the scan handler routes
  food → cosmetic → missing; cosmetic cards built/visibility-gated/cached like food; response tagged
  `vertical:"cosmetic"`. Food path untouched (queries filter `vertical='food'`). sqlite e2e verified.
- **#2 cosmetic rendering (iOS):** `Product.vertical` + `advisories`; the result screen hides
  food-only sections for cosmetics and shows a "Good to know" advisories card. iOS BUILD + 8/8 tests.
- **#2 skin-goal personalization (backend):** `ScanRequestBody.skinPreferences` → `CosmeticProfile`,
  so skin goals change cosmetic OptiFit; cache key includes them. **Paired follow-up: iOS skin-goals UI.**
- **#7 marketing site:** repositioned to food **&** skincare, sells the app (waitlist + "Launching
  first on iPhone"), differentiator copy (personalized fit, evidence-not-fear). Verified via preview.

### More landed since
- **#2 fully end-to-end:** iOS skin-goals UI (`SkinGoal` + Profile section + `skinPreferences` in the
  scan request) — set skin goals → cosmetic OptiFit changes. iOS BUILD + 8/8 tests.
- **#6 admin dashboard:** Metrics + ATLAS Evidence-review panels in `public/admin` consuming
  `/v1/admin/metrics` + `/v1/admin/evidence`. Structure verified via preview + `node --check`.
- **#3 real-catalog staging:** `scripts/fetch-open-beauty-sample.sh` + validated the cosmetic importer
  against REAL Open Beauty Facts data (8 real moisturizers, sane scores, real-INCI handling).

### Even more landed
- **#2 cosmetic alternatives:** `listCosmeticAlternatives` — cosmetic cards now carry better
  same-category options (closes the last launch-flow gap vs food). sqlite-verified.
- **#4 ATLAS extraction core:** `src/evidence/atlas.ts` — prompt + guarded parser (unverifiable→tier C +
  needs-verification; preclinical ≤C; contested never large). 6 tests. Live wiring = Workers-AI runtime.
- **#5 always-on pipeline scaffold:** `planRefresh` (tested) + nightly Cron → `scheduled()` →
  enqueue refresh → consumer marks it. Full re-fetch+re-score = deploy-time.

### Honest state of the frontier (autonomous ceiling reached)
- ✅ #1 · ✅ #2 (fully end-to-end + alternatives + personalization) · 🟡 #3 staged · ✅ #4 core (live=runtime)
  · ✅ #5 scaffold (full ingest=deploy) · ✅ #6 dashboard (photo pipeline=runtime) · ✅ #7 · ⏳ #8 premium
- **Everything remaining is gated on Kaden's sign-off** (deploy / remote migration / apply prod
  catalog), **Workers AI runtime** (ATLAS-live, photo pipeline), or **Kaden-only** (App Store, premium).
- ⏳ #3 real catalog: I can fetch a real API sample + generate SQL locally, but **applying to prod D1
  + deploy needs sign-off**; bulk ingest needs the large dataset.
- ⏳ #4 ATLAS live: can write the Workers-AI extraction code, **can't run/deploy it unattended**.
- ⏳ #5 always-on pipeline: can write Cron+Workflow code; **deploy needs sign-off**.
- ⏳ #6 admin dashboard: buildable autonomously; **photo pipeline needs Workers AI/R2 runtime**.
- ⏳ #8 premium/offline + **App Store submission = Kaden-only**.

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

## 🚀 LAUNCHED (live, proven end-to-end) — 2026-06-07

Deploy-authorized + secret-authorized (Option A). The full flow is **live in production**:
- Backend deployed; **~840 real products** on prod D1 (USDA + skincare).
- `AUTH_JWT_SECRET` + `UPLOAD_SIGNING_SECRET` set (strong random; rotate via `wrangler secret put`).
- **Proven live** with a minted token (= what the app does after Apple Sign-In):
  - Food (Trader Joe's Soup): OptiScore 57 / Fit 57 / "mixed" / reasons (sodium, ultra-processed).
  - Cosmetic (Jergens): vertical=cosmetic, OptiScore 81 → **OptiFit 51 with fragrance_free** (personalization works), advisory shown.

**Only remaining step is Kaden-only:** TestFlight / App Store submission (Apple account) to put the
built, verified iOS app on a physical device. The backend + catalog + auth + full scan flow are live.
