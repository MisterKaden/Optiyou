# Optiyou — North Star

## The vision
**Make Optiyou the most trustworthy product scanner in the U.S. & Canada — beating Yuka on
accuracy, transparency, and personalization — delivered as a polished, launch-ready iOS app
(Android to follow) backed by a self-updating, evidence-graded data engine.**

Where Yuka gives one opaque, one-size number, Optiyou tells each person whether a **food or skincare
product is a smart choice for *them*** — and shows exactly why, with honest confidence and no
fear-mongering. The app is the product; the Cloudflare backend is its brain; optiyou.co exists to
sell the app.

## What "launch-ready MVP" means (the mission I drive toward)
A real person can, on the **iOS app**:
1. Sign in with Apple and set a profile — diet goals, skin goals, allergens, preferences.
2. **Scan a US/CA food or skincare barcode** and instantly get **OptiScore** (universal quality),
   **OptiFit** (personalized), **Confidence**, a plain-language **why**, **advisories**, and
   **better alternatives** — wired end-to-end from the live backend.
3. See personalization genuinely change the result (allergen → "avoid"; goals shift OptiFit).
4. View scan history and **contribute** missing products with label photos.

…all backed by a **pre-built catalog** (USDA + Open Food Facts + Open Beauty Facts) kept fresh by an
**always-on ingestion pipeline**, with **ATLAS** evidence-graded ingredient intelligence steadily
replacing the v0 keyword seeds — and an **admin surface** (you) to review ATLAS cards, verify
products, and watch coverage/quality metrics. The **marketing site** clearly sells the app with an
App Store CTA.

## The frontier to close (current gaps, in rough order)
1. **Wire the iOS app to the live backend** — consume the new shapes (`safetyLevel`/`gradeBand`,
   `pending_verification`, `visibility`, `isAdmin`); render the card, the "why", advisories, OptiFit.
2. **Cosmetic scan-routing** end-to-end (backend scorer exists; route the scan/lookup API + iOS to it).
3. **Real catalog** — ingest a meaningful US/CA slice of USDA + skincare from Open Beauty Facts.
4. **ATLAS live** — populate the ingredient-intelligence graph and feed it into scoring (replace seeds).
5. **Always-on pipeline** — Cron + Workflows + Queues for nightly refresh + re-scoring.
6. **Admin dashboard** + optimization metrics; **photo pipeline** (BiRefNet → R2) for clean images.
7. **Marketing site** that sells the app.
8. **Premium / offline mode** (fast-follow).

## Non-negotiable principles (how, not just what)
- **Evidence-graded, never influencer-driven.** Score moves on verified facts, toxicology/regulatory
  sources, graded evidence — voices like Huberman/Patrick guide *topics*, the literature decides.
- **Villain = ultra-processing, added sugar, refined starch, sodium — not macros.** Banned substances
  are the *only* hard cap; contested items inform via advisory, they don't tank the score.
- **Deterministic code sets the score; AI extracts, researches, explains — never fabricates.**
- **Confidence ≠ score; low-confidence data is admin-only until verified.**
- **ODbL isolation** (OFF / Open Beauty Facts tagged `off`); no EWG data; no medical claims.

## Operating guardrails for autonomous work
- Default **local + commit to a feature branch**; keep typecheck + tests green every step.
- **Pause for explicit sign-off** before production-mutating / irreversible actions: remote D1
  migrations, deploys to `main`, App Store / TestFlight submissions, paid services, secret changes.
- When something needs Kaden (App Store, dashboards, credentials), **stop and give step-by-step
  instructions with links** rather than guess.

Detailed spec: [mvp-goal.md](mvp-goal.md) · [master-plan.md](master-plan.md) · progress:
[autonomous-progress.md](autonomous-progress.md).
