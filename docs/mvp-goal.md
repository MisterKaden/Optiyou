# Optiyou MVP — Full Goal & Setup Plan

> The north-star definition of the Optiyou MVP across **three pillars: Food, Cosmetics, and the
> Optimization layer.** Extends [master-plan.md](master-plan.md) (food spine) and
> [nutrition-evidence-gatekeeper.md](nutrition-evidence-gatekeeper.md) (ATLAS) to a two-vertical
> product. Status: **direction draft, pre-implementation.** Last updated 2026-06-06.

---

## 0. The MVP in one sentence

> Scan any U.S./Canada **packaged food** or **personal-care/cosmetic** product and instantly get a
> transparent, evidence-graded quality score (**OptiScore**), a personalized fit score for your
> goals (**OptiFit**), and a clear **why** — all served from a self-updating data + evidence
> pipeline, with an admin layer that keeps unverified data out of users' hands.

---

## 1. The three pillars

| Pillar | What it is | Score domain |
|--------|-----------|--------------|
| **Food** | US/CA packaged food (the master-plan spine) | `food-us-ca-v1` |
| **Cosmetics** | US/CA personal care — **skincare-first at MVP** (cleansers, moisturizers, serums, sunscreen); haircare/makeup post-MVP | `cosmetic-us-ca-v1` |
| **Optimization** | The cross-cutting "Opti-*you*" layer: personalization (OptiFit goals across both verticals) **and** the metrics/analytics that quantify product fit and measure the business | — |

**One engine, two domains, one optimization layer.** Both verticals reuse the same architecture
(label = truth, ingredient intelligence, evidence-graded rules, deterministic score, ATLAS,
admin gating). They differ only in **data sources** and **scoring methodology**. The optimization
layer sits on top of both.

> Note on "optimization metrics": I've interpreted this as the **Optimization layer** = (a) OptiFit
> personalization spanning food + cosmetics, plus (b) the product/operational KPIs in §7. Flag in §13
> if you meant something narrower (e.g., user-facing health-tracking only).

---

## 2. Definition of "MVP done" (acceptance criteria)

**A user can:**
- Sign in with Apple.
- Scan a barcode and get the right card — **food or cosmetic**, auto-detected by product type.
- See **OptiScore + OptiFit + Confidence**, a plain-language **why** drawer, **advisories**, and **alternatives**.
- Set a profile with **goals/preferences/allergens** for both diet and skin.
- See **scan history** (incl. pending contributions).
- **Contribute** a missing product (label photos).

**An admin can:**
- Log in (admin role on Apple Sign-In).
- See the **hidden layer** (low-confidence/unverified products), the **review queue**, and **ATLAS evidence cards**.
- Verify/correct products; everything audit-logged.

**The system does (automatically):**
- Keeps a **pre-built catalog** for both verticals (scans are reads, not live fetches).
- Runs **always-on ingestion** (cron → workflow → queue) for both verticals.
- **Pre-computes scores** and standardizes product **images** (white background → R2).
- Surfaces **optimization metrics** on an admin dashboard.

---

## 3. Unified architecture (extends the master plan)

The **four databases** now span both verticals:

1. **Product Truth DB** — food + cosmetic products. Add a `vertical` enum (`food | cosmetic`) and keep
   the existing versioning + `primary_source` provenance.
2. **Ingredient Intelligence DB** — one shared graph (many ingredients appear in both worlds), but each
   ingredient carries **domain-specific context** (a compound's food role ≠ its cosmetic role/route of exposure).
3. **Nutrition/Safety Evidence DB** — ATLAS evidence cards, now tagged by domain (food nutrition vs
   cosmetic toxicology/sensitization).
4. **Scoring Rules DB** — **two versioned methodologies** (`food-us-ca-v1`, `cosmetic-us-ca-v1`),
   data-driven, re-scoreable.

**ATLAS** gains a domain dimension: same evidence-first persona, but a cosmetic card reasons about
toxicology, route of exposure, sensitization, and dose/use (leave-on vs rinse-off) instead of nutrition.

---

## 4. Scoring

### 4.1 Food (recap from master plan)
Hybrid absolute/category-aware 0–100. Six dimensions (25% processing · 20% nutrient density ·
20% metabolic · 15% cardiometabolic · 15% additive · 5% positive pattern), caps, advisories.
Score object carries OptiScore (universal) + OptiFit (personal) + Confidence + `safetyLevel`
(declared allergen = hard `avoid` cap) + `gradeBand`, with universal vs personalization reason codes
split, and `methodology`/`normalization`/`ingredientFlag` versions stamped on every score. See
master-plan §4.7. (wheat = Big-9 allergen; gluten-free = preference.)

### 4.2 Cosmetics (new — evidence-graded, multi-axis, dose-aware)
**We deliberately reject the Yuka/EWG "worst-ingredient caps the whole score" model** — it's
dose-blind, treats *potential* hazard as actual, and is the alarmism we want to beat. Instead, a
multi-axis evidence-graded score:

| Axis | Weight (v0.1) | What it measures |
|------|---------------|------------------|
| **Regulatory status** | hard signal + caps | Banned/restricted in US (FDA)/CA (Hotlist)/EU (Annex II/III). A banned substance caps the score low — this is the *only* place we cap. |
| **Ingredient hazard (evidence-graded)** | 35% | Endocrine/CMR/toxicity concerns, each tagged **settled / contested / data-gap** and dose-aware. Parabens ≠ a red flag; genuine CMRs are. |
| **Sensitization / allergen** | 25% | EU 80-allergen list (Reg. 2023/1545), fragrance sensitizers, common irritants — heavily feeds OptiFit (sensitive skin). |
| **Formulation transparency** | 15% | Undisclosed "parfum," data gaps, ingredient-count/concentration signals. |
| **Environmental** | 10% | e.g., D4/D5 siloxanes — a *separate* sub-axis, never conflated with human-health hazard. |
| **Positive formulation** | 15% | Function-appropriate, well-substantiated, low-irritant formulations. |

- **Dose/use-aware:** leave-on vs rinse-off changes the weighting (an irritant in a rinse-off cleanser ≠ in a leave-on serum).
- **Advisories, not penalties** (same as food): "contains fragrance allergens — patch-test if sensitive" informs without nuking the score.
- **Methodology version:** `cosmetic-us-ca-v1`.

### 4.3 Shared
Both produce OptiScore + OptiFit + Confidence + reason codes + the "why" drawer. Both are
deterministic, versioned, and re-scoreable. ATLAS drafts the evidence both rely on.

---

## 5. Data sources by pillar (with licensing)

### Food (from master plan)
- **USDA FoodData Central** (CC0, primary) · **Open Food Facts** (ODbL, isolated) · user contributions.
- Ingredient/evidence: FDA SAF, EFSA OpenFoodTox, JECFA, PubChem, FooDB, NOVA; Cochrane/PubMed/NIH/DGAC/AHA.

### Cosmetics (verified in research)
- **Open Beauty Facts** — primary product DB (ODbL, ~100k products, **US/CA coverage is thin** → contribution + OCR enrichment matter more here). Nightly dumps + per-scan API.
- **INCI names** — ingest from labels/OBF/OCR (factual). **Do NOT copy the paid PCPC wINCI dictionary.**
- **CosIng** (EU, free) — best free ingredient **function + regulatory-status** dictionary; attribute with EC reuse policy.
- **Regulatory hazard stack (all commercially usable):** FDA prohibited/restricted + MoCRA + PFAS (public domain) · **Health Canada Cosmetic Ingredient Hotlist** (Open Gov Licence) · **EU Annexes II/III** + **fragrance-allergen Reg. 2023/1545** (EUR-Lex) · **CIR** safety conclusions (free, US-relevant, anti-alarmist) · **SCCS** opinions.
- **Identity:** GS1/Verified by GS1 (barcode→brand) + OBF; OCR for US/CA gaps.
- 🚫 **Do NOT ingest EWG Skin Deep scores** (personal/non-commercial only, no machine reuse, actively enforced) — methodology *reference* only. 🚫 Verify ChemSec **SIN List** terms before embedding; prefer official **ECHA/EU EDC/SVHC** lists.

### Optimization (metrics/analytics)
- **Cloudflare Analytics Engine** (scan events, outcomes, score distributions) — **needs a binding added** (not in `wrangler.jsonc` yet).
- User personalization data (profiles, goals, household) in D1.
- Derived business KPIs (see §7).

---

## 6. Data + AI pipelines (both verticals)

```
Cron (nightly) → Workflow (durable, retriable):
   fetch USDA + OFF (food) / Open Beauty Facts (cosmetics) + regulatory lists → diff → enqueue
      → INGESTION_QUEUE fan-out:
          normalize → merge by precedence (brand > usda/regulatory > off/obf > user) + per-field confidence
          → ingredient resolution vs Intelligence graph (ATLAS drafts cards for unknowns, per domain)
          → image track: legit source image → BiRefNet bg-removal → white canvas → R2
          → deterministic score (domain methodology) → cache
          → write version + field_sources + audit_log → warm KV → upsert Vectorize
On scan cache-miss: live OBF/OFF API fallback → fast card → enqueue full enrichment
```

Shared photo pipeline (R2 already provisioned). Per-vertical source adapters, one common
normalize→score→store path. ATLAS runs ahead of users, autonomous, audited, reversible via versioning.

---

## 7. The Optimization layer

### 7.1 OptiFit goals (personalization, both verticals)
- **Food goals:** high protein, low sugar, low sodium, heart-health, kid-friendly, weight loss, muscle gain + allergens + dietary prefs + household.
- **Cosmetic goals:** sensitive skin, fragrance-free, pregnancy-safe, specific-allergen avoidance, acne-prone/non-comedogenic, vegan/cruelty-free preference.
- One unified "Opti-you" profile spanning diet **and** skin; OptiFit is cheap on-device math over precomputed components (also enables offline mode).

### 7.2 Product & operational metrics (the KPIs)
Instrumented via Analytics Engine → admin dashboard:
- **Coverage:** % of scans hitting a known product (per vertical).
- **Confidence/quality:** avg data confidence; % verified vs provisional; conflict rate.
- **Engagement:** scans/user, repeat scans, history usage, alternatives taps.
- **Personalization:** % users with a profile/goals; OptiFit usage; goal mix.
- **Contribution:** missing-product contribution rate; time-to-verify.
- **Conversion:** free→premium (offline mode, advanced metrics).
- **Score health:** OptiScore distributions; methodology-version adoption; re-score events.

---

## 8. The app (iOS) MVP surface
Auth (Apple) · Scan → food/cosmetic auto-routing · Product card (score · fit · confidence · why ·
advisories · alternatives) · Profile & goals (food + skin) · Scan history (+ pending) · Contribution
flow · Premium gate (offline mode / advanced metrics — MVP+).

## 9. Admin + access control MVP
Admin role on Apple Sign-In (server-enforced) · review queue (contributions + low-confidence) ·
ATLAS evidence-card review · the visibility gate (low-confidence = admin-only; users see "still
verifying" + contribute) · full audit log.

## 10. Infrastructure setup checklist (Cloudflare)

| Resource | State | Action |
|----------|-------|--------|
| Workers + routes | ✅ live | — |
| D1 `optiyou-core` | ✅ migrated 0003 | Add `vertical` + cosmetic tables (migration) |
| R2 `optiyou-product-artifacts` | ✅ created | Add `img.optiyou.co` custom domain for public image serving |
| KV (cache/config/methodology) | ✅ live | — |
| Queues (ingestion/dlq/notifications) | ✅ live | — |
| **Workflows** | ❌ not yet | Add binding + durable ingestion workflow |
| **Cron Triggers** | ❌ not yet | Add nightly ingestion/refresh schedule |
| Vectorize `product-evidence` | ⚠️ bound | Confirm index exists; add product/alternatives index |
| Workers AI + AI Gateway | ✅ bound | Wire extraction + BiRefNet + ATLAS |
| **Analytics Engine** | ❌ not bound | Add dataset binding for optimization metrics |
| Subscriptions / StoreKit | ⚠️ stub | Wire premium entitlement for offline mode |
| Secrets (`.dev.vars` / prod) | partial | Finalize signing/admin/JWT secrets |

## 11. Legal / licensing guardrails
- **Isolate ODbL data** (OFF + Open Beauty Facts) in source-tagged tables; never ship it in a
  user-downloadable DB (offline mode = USDA/CC0 + our own data only — `primary_source` filter).
- **Never ingest EWG Skin Deep** data/scores; methodology reference only.
- **Don't redistribute the paid wINCI dictionary**; use label INCI + CosIng.
- **No medical claims** (food) / **no drug or therapeutic claims** (cosmetics) — education only.
- **Image trademark/trade-dress** posture = nominative fair use; legit sources only; IP counsel before launch.

## 12. Build sequence to MVP
- **Phase 1 — Food data foundation + score** ✅ *(slice 1 done: importer, scoring, provenance, R2)*
- **Phase 2 — Admin visibility gate + admin role** (unblocks showing imported data safely) ← **next**
- **Phase 3 — Cosmetics vertical** (`vertical` schema, Open Beauty Facts + CosIng + regulatory ingestion, `cosmetic-us-ca-v1`)
- **Phase 4 — Ingredient Intelligence graph + ATLAS** (both domains, autonomous + audited)
- **Phase 5 — OptiFit personalization + optimization metrics dashboard** (both verticals)
- **Phase 6 — Photo pipeline** (BiRefNet → R2, both verticals)
- **Phase 7 — Premium (offline mode) + polish** → **MVP launch candidate**

## 13. Decisions (resolved 2026-06-06)
1. **Optimization layer** = OptiFit personalization (diet + skin) **+** product/operational KPIs. ✅ Confirmed (§1/§7 stand).
2. **Cosmetics MVP breadth = skincare-first** (cleansers, moisturizers, serums, sunscreen). Haircare/makeup post-MVP. This narrows the launch catalog to where data quality and the ingredient-safety story are strongest.
3. **Premium = fast-follow.** Ship the free core first (scan · score · fit · contribute) to validate; offline mode + advanced metrics become the first paid release. Moves premium/StoreKit to **post-launch (Phase 7 → fast-follow)**.
4. **Public image host = `img.optiyou.co`** (CDN-fronted R2 custom domain, zero egress).
