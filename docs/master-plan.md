# Optiyou Master Plan

> The single source of truth for what Optiyou is, how it scores food, how its data and AI
> pipelines work, and the order we build it in. Supersedes scattered decisions; cross-references
> [platform-architecture.md](platform-architecture.md) (infra),
> [nutrition-evidence-gatekeeper.md](nutrition-evidence-gatekeeper.md) (the ATLAS agent spec), and
> [health-layer-blueprint.md](health-layer-blueprint.md) (personal health data, PHI boundary,
> compliance, OptiFit v2 biomarker personalization — approved 2026-06-10).
>
> Status: **approved direction, pre-implementation.** Last updated 2026-06-06.

---

## 1. Vision & founding principles

Optiyou is a product-intelligence platform for **U.S./Canada packaged food**. A user scans a
barcode and gets an instant, evidence-graded, *personalized* read on whether the product is a smart
choice — not a fear-based verdict, not a macro-ideology verdict.

The belief the whole system is built on:

> **The healthiest choice is not determined by one ideology. It is determined by product quality,
> processing, nutrient density, ingredient risk, evidence strength, and personal fit.**

Four operating principles govern every design decision:

1. **The product label is truth.** What's on the package wins over any database.
2. **Science is the grading constitution.** Scores move only on verified facts, toxicology/regulatory
   sources, and graded evidence — never on influencer opinion or tradition.
3. **AI is the extraction & research engine, not the judge.** AI reads, parses, researches, and
   explains. It never secretly decides a score.
4. **Deterministic code sets the final score.** Same product facts + same scoring version = same
   score, every time. Auditable and reversible.

---

## 2. The three scores (this is how we beat Yuka)

Yuka gives one universal number (≈60% nutrition / 30% additives / 10% organic, with a hard cap at
49 for high-risk additives). It's instantly understandable but universal, additive-obsessed, and
fear-prone. Optiyou ships **three** scores instead:

| Score | Question it answers |
|-------|---------------------|
| **OptiScore** | "Is this product generally a good food?" (universal quality) |
| **OptiFit** | "Is this a smart choice *for me*?" (goals, allergens, preferences, household) |
| **Confidence** | "How sure are we the label, data, and evidence are correct?" |

The magic is the gap between them: a whole-grain bread can be **high OptiScore, zero OptiFit** for a
gluten-free user; a protein bar can be **medium OptiScore, high OptiFit** for muscle gain; a
healthy-looking product can be **high OptiScore, low Confidence** when the label is unverified.

> **Yuka tells you if a product is generally okay. Optiyou tells you if it's a smart choice for you.**

---

## 3. Scoring philosophy — anti-dogma by design

We reject **both** old food-pyramid logic ("carbs good, fat bad") **and** its inversion ("carbs bad,
fat/protein good"). Food *quality* beats macro ideology. A lentil, an apple, sourdough, white bread,
candy, and soda are all "carbs" and must not grade near each other. Olive oil, salmon, butter, and
hydrogenated oil are all "fat" and must not grade the same.

**We penalize low-quality patterns, never macronutrient categories:** refined carbs, added sugar,
low fiber, excess sodium, industrial trans fats, poor fat profile, ultra-processing, risky
additives, poor protein quality for the category, and weak data confidence.

The strongest, most defensible single signal is **ultra-processing** (NOVA framework; Hall's NIH
inpatient RCT showed ultra-processed diets drove ~500 extra kcal/day at matched macros). It carries
real weight — but never an automatic zero.

---

## 4. The scoring model (OptiScore v0.1)

### 4.1 Scale: hybrid (absolute + category-aware)
**One honest 0–100 scale across all foods** — oatmeal can hit 90, the best soda still scores low —
**but** nutrient-density expectations and caps are **category-aware** (a broth isn't penalized for
low protein; a snack bar's sodium is judged against its category). Absolute ceiling, category-aware
components.

### 4.2 Weights
```
OptiScore =
  25%  Food quality / processing      (whole-food base, NOVA markers, ingredient simplicity, food matrix)
+ 20%  Nutrient density               (protein/fiber/micros/beneficial fats; category-adjusted; no fortification-rescue)
+ 20%  Metabolic impact               (added sugar/serving, /100g, /kcal; sugar:fiber; refined starch; LIQUID-sugar penalty)
+ 15%  Cardiometabolic risk           (sodium, sat fat in realistic-intake context, trans fat, processed-meat markers)
+ 15%  Ingredient / additive concern  (colors, sweeteners, emulsifiers, preservatives — by regulatory status + dose)
+  5%  Positive food-pattern fit      (fruit, veg, legumes, nuts, seeds, fermented, seafood, whole grains)
```

### 4.3 Normalization
Primary basis **per 100 g/ml** (serving sizes are gameable), with **per-serving** and **per-calorie**
as secondary signals, plus a **serving-size-manipulation detector**. **Liquids are penalized harder**
on sugar (easier to overconsume).

### 4.4 Caps (rare, obvious, methodology-versioned)
| Condition | Cap |
|-----------|-----|
| Contains banned/revoked additive for the market | max **40** |
| Sugar-sweetened beverage | max **40** |
| Mostly added sugar | max **45** |
| Trans fat / partially hydrogenated oil | max **30** |
| Nutrition/ingredient data conflict | **provisional only** (admin-visible) |
| Allergen conflict for the user | **`safetyLevel: "avoid"`** + OptiFit hard-capped (≤12) + safety warning |

### 4.5 OptiFit
`OptiFit = OptiScore + goal adjustments − allergen/preference conflicts − dietary constraints + context bonuses`.
Goals (v1 set): high protein, low sugar, low sodium, heart-health, kid-friendly, weight loss, muscle
gain, plus allergens, dietary preferences, and household profiles. (Medical-adjacent framing stays
educational, never medical advice.)

### 4.6 Hazard ≠ risk
Never say "toxic"/"poison"/"safe" casually. Risk depends on dose, frequency, user, exposure. We say
things like "authorization revoked in the U.S.; avoid," or "ADI exists, but frequent consumption may
matter," or "limited human evidence; concern is mainly mechanistic."

### 4.7 Score object & provenance (v0.1 — implemented)
The scorer returns: `optiScore` (universal), `optiFit` (personal), `confidenceScore`, plus two
derived signals — `safetyLevel` (`ok` | `caution` | `avoid`) and `gradeBand` (`poor` | `mixed` |
`good`) — and **two reason-code channels**: `reasonCodes` (universal) and `personalizationReasonCodes`
(profile-specific). The product card presents the two channels combined; storage keeps the universal
score only (OptiFit is cheap per-request math).

Principles locked here:
- **Safety is a hard signal, independent of quality.** A declared allergen → `safetyLevel: "avoid"`
  and OptiFit hard-capped (≤12) **even on a 95-quality product**. A dietary restriction
  (gluten-free/dairy-free) → `"caution"`. Preference mismatches lower OptiFit but stay `"ok"`.
- **Confidence ≠ score.** A data-poor product can have a high OptiScore but low Confidence — we
  surface uncertainty, we never auto-tank the score for missing data.
- **wheat ≠ gluten.** Wheat is the FDA Big-9 *allergen*; gluten avoidance (which also covers
  barley/rye/malt) is a *preference* via the `contains_gluten` flag — not an allergen.
- **Provenance & versioning on every score:** `methodologyVersion` + `normalizationVersion` +
  `ingredientFlagVersion`, so we can always answer "which pipeline produced this score" and re-score
  on any bump. Dates split: **`observedAt`** (when Optiyou ingested) vs **`sourcePublishedAt`** (when
  the source published).
- **Guardrail:** the current `src/scoring/food-scoring.ts` is the v0.1 deterministic *scaffold* that
  migrates into the data-driven Scoring Rules DB. A golden-fixture suite (`tests/scoring-golden.test.ts`)
  locks "obviously sane ranking," not just "penalize junk." The `src/ingestion/sql.ts` string-builder
  is **offline bulk-seed only**; the request path uses parameterized `.bind()`.

---

## 5. Confidence & access-gated visibility

- **Regular users see only verified / sufficient-confidence cards.** They never see a provisional
  score or unverified data.
- **Low-confidence product → regular user sees a "We're still verifying this product" state** that
  invites a label photo (reuses the contribution flow). Gaps become crowd-sourced data.
- **Admins see the hidden layer:** provisional scores, low-confidence/unverified products, raw source
  data, and the review queue. Enforced **server-side** — the API only honors an `includeUnverified`
  flag for authenticated admins; it is not merely hidden in the UI.

**Implemented (v0.1):** `src/platform/visibility.ts` — a product is user-visible if
`verificationStatus === "verified"` OR (`unverified` AND `confidence ≥ 0.7`); `conflicted`/
`needs_review` are admin-only. The scan endpoint returns a `pending_verification` + contribution
prompt for hidden products; lists filter them; only visible cards are cached. Admin is a **role on
Apple Sign-In** (`src/platform/auth.ts` `requireAdminAccess`), granted by the `ADMIN_USER_IDS` /
`ADMIN_EMAILS` allowlists, with the legacy `ADMIN_API_TOKEN` as a transitional fallback.

---

## 6. The four-database architecture

Separation is what makes the system auditable and lets it evolve without touching code.

1. **Product Truth DB** — what's actually in the scanned product (identity, versioned label data).
2. **Ingredient Intelligence DB** — what each ingredient/additive *is* (aliases, E-/CAS/PubChem IDs,
   functional class, regulatory status by region). A knowledge **graph**, not a flat list.
3. **Nutrition Evidence DB** — what the best evidence says (claims, endpoints, populations, evidence
   grade + status, sources). Populated by ATLAS.
4. **Scoring Rules DB** — how facts become OptiScore/OptiFit/Confidence. **Data-driven and versioned**
   (rules live in data, *not* hardcoded TypeScript), so methodology evolves and the catalog re-scores.

> The current `src/scoring/food-scoring.ts` (hardcoded thresholds, 7 crude flags) is MVP scaffolding.
> It migrates to the Scoring Rules DB + Ingredient Intelligence graph.

**Versioning everywhere:** products are versioned (a barcode's formula changes under the same GTIN),
scores are keyed by `(product_version, scoring_version)`, and every evidence card is versioned. This
is the reversibility guarantee.

---

## 7. Data sources & licensing posture (free-first)

### Product identity & nutrition (Product Truth)
| Source | Role | License / note |
|--------|------|----------------|
| **USDA FoodData Central — Branded** | **PRIMARY backbone** | **CC0 / public domain** — cleanest. GTIN + ingredients + nutrition, US-strong, no images |
| **Open Food Facts** | Supplement: Canada, gap-fill, **images** | **ODbL share-alike** — kept in **physically isolated, source-tagged tables** so it never contaminates proprietary data |
| **User label photos / contributions** | Long-tail + current-packaging truth | Ours by ToS; highest truth when OCR confidence is good |
| **GS1 Data Hub, commercial feeds, SmartLabel** | Deferred | GS1 API ≈$6.5k; SmartLabel has no clean bulk API; pursue when funded |

### Ingredient intelligence
FDA Substances Added to Food, FDA chemical-safety review list (revoked/under-review), FDA GRAS
notices, **EFSA OpenFoodTox**, **JECFA** (ADI/TDI), **PubChem** (identity/CAS), **FooDB**,
LanguaL/FoodOn (ontology).

### Health evidence
**Cochrane**, **PubMed/PMC** (NCBI E-utilities), **DGAC** reports, **NIH ODS**, **AHA**, independent
academic nutrition (Harvard/Stanford), NOVA / ultra-processed literature.

### Influencers (Huberman, Patrick, Johnson, Attia, Norton, …)
**Signal sources, not source-of-truth.** They tell us *which topics users care about* (seed oils,
protein targets, glucose, emulsifiers, sweeteners, UPFs). The score moves only when the claim is
backed by systematic reviews, strong cohorts, RCTs, regulatory action, or credible mechanism — and
we cite that primary source, never the influencer.

---

## 8. The pipelines (always-on, Cloudflare-native)

Scans are **reads**. All the work happens **ahead of the user**.

```
Cron Trigger (nightly)
  → Workflow: pull USDA + OFF delta, diff vs D1, enqueue changed GTINs
      → INGESTION_QUEUE fan-out (durable, retried, DLQ):
          normalize → merge by precedence (brand > USDA > OFF > user) with per-field confidence
          → ingredient resolution against the Intelligence graph (ATLAS drafts cards for unknowns)
          → image track: legit source image → BiRefNet bg-removal → white canvas → R2
          → deterministic score (Scoring Rules DB) → cache
          → write product_version + field_sources + audit_log → warm KV → upsert Vectorize
On cache-miss at scan time: live OFF API (15 req/min/IP) fallback → fast card → enqueue full enrichment
```

**Photo pipeline — the visual edge over Yuka.** Yuka shows OFF photos as-is (angled, mixed
backgrounds). We run **every** legitimate source image (OFF CC-BY-SA + attribution, user
contributions, licensed/brand later) through **the same** standardization: BiRefNet background
removal → composite on pure white → identical crop/dimensions → R2. Same crowd photos, studio-grade
consistency. **We do not scrape retailer/brand CDNs** — background removal does not transfer the
photo's copyright or the packaging's trademark/trade-dress, and scraping breaches retailer ToS.

**Storage:** D1 = text (10 GB/db hard cap; ~1M products of text fits in a few GB; shard by
country/prefix if ever needed). R2 = images (D1 holds only the key — **re-enable the R2 binding**,
disabled in `6f8f5b6`). KV = pre-warmed ProductCards. Vectorize = search/alternatives.

---

## 9. ATLAS — the evidence gatekeeper

Full spec: [nutrition-evidence-gatekeeper.md](nutrition-evidence-gatekeeper.md).

ATLAS embodies the *rigor* of the respected evidence-first voices (mechanism-aware, measurement-
driven, anti-dogma **and** anti-hype) while grounding every claim in primary literature. It
researches each ingredient/additive/rule and emits a structured, citation-anchored **Evidence Card**
(concern level, mechanism, dose/ADI, citations, recommended scoring band, advisory).

- **v1 review model: fully autonomous.** Cards publish without human sign-off — but autonomy is made
  safe by (1) the **no-fabricated-citations** rule (unverifiable → cap tier at C + flag), (2) the
  **regulatory-action** high-confidence channel, (3) **inform-don't-punish** conservatism on weak
  evidence, (4) a full **audit log**, and (5) **methodology versioning** that makes every card
  reversible by re-scoring.
- **Two channels per card, enforced in the schema:** `recommended_scoring` (moves points) and
  `advisory` (informational, `affects_score: false`). The organic case = no penalty + "wash well"
  advisory. Advisories also carry PKU/population caveats, allergen cross-contact, contested framing.
- **Evidence tier × status:** *tier* (A–D) = strength of evidence; *status* (consensus /
  strong-contextual / emerging / contested / weak-mechanistic / regulatory-action) = how settled and
  actionable. A card carries both; status drives whether it touches OptiScore, only OptiFit, or just
  explains.

**Contested topics** (seed oils, non-nutritive sweeteners, organic, saturated fat, red/processed
meat): non-aggressive but informative. A penalty requires ≥ tier-B harm evidence at realistic doses;
otherwise inform via advisory.

---

## 10. AI roles — do / don't

**AI does:** OCR cleanup, ingredient parsing, nutrition-panel extraction, synonym/alias mapping,
allergen & additive detection, conflict detection, evidence summarization, consumer-friendly
explanations, research triage.

**AI does NOT:** set scores secretly, invent missing nutrition facts, guess ingredient risk without
sources, overwrite product facts without confidence, make medical claims, or say "toxic/poison/safe"
without context.

The explanation is AI-written *from* the structured facts; the *decision* ("high added sugar for its
serving, low fiber") is the deterministic engine's, from `added_sugar_g / fiber_g / category`.

---

## 11. Admin & access control

- **Admin login = an admin role on Apple Sign-In** (one identity system, server-enforced). Replaces
  the current static `x-optiyou-admin-token`.
- Admin powers: see hidden/provisional/low-confidence content, the review queue, raw sources, and
  override/verify product data.

---

## 12. Transparency — the "Why?" drawer

Every product page exposes the audit trail: score version, product-data source + last-verified date,
confidence, the main positive/negative drivers (with numbers), any caps applied, and the cited
sources. This is what makes Optiyou look serious and protects us when brands complain.

---

## 13. Phased build plan

- **Phase 1 — Product data foundation:** UPC scan, lookup, **USDA** + **OFF (isolated)** ingestion,
  product/version DB, label-photo capture, nutrition/ingredient OCR, source + confidence display,
  **re-enable R2**, photo standardization pipeline.
- **Phase 2 — Deterministic score engine:** category taxonomy, the 6-dimension model + caps,
  normalization, Confidence, **scoring versioning** (data-driven rules). *Ships with Phase 1 as v1.*
- **Phase 3 — Ingredient intelligence graph** *(seed in parallel):* alias mapping, FDA/EFSA/JECFA
  cross-refs, PubChem IDs, additive-class + allergen detection, regulatory-change monitor.
- **Phase 4 — Evidence engine (ATLAS)** *(seed in parallel):* PubMed/Cochrane triage, autonomous
  evidence cards, grading + tier/status tags, admin review tooling.
- **Phase 5 — Personal OptiFit** *(headline follow-on):* goals, allergens, preferences, household
  profiles, "works for me" feedback loop.

**v1 = Phases 1 + 2 shipped; 3 + 4 seeding behind the scenes; 5 is the headline next.**

---

## 14. The moat

Not "we use AI." The moat is: a clean **product/version DB**, an **ingredient alias graph**, a
**transparent, versioned scoring engine**, a **source-confidence system**, a **fast label-capture +
photo-standardization workflow**, **personal OptiFit**, and an **autonomous-but-auditable evidence
layer that improves over time.** The app feels simple because the backend is smart.

---

## 15. Open items / revisit when funded or scaled

- **GS1 Data Hub** authoritative identity (~$6.5k) and **commercial/syndicated feeds + studio
  photography** (Syndigo / NIQ Brandbank) — cleanest data + images, deferred.
- **Credentialed (RD/PhD) reviewer** in the ATLAS loop — strongest legal defensibility if/when scale
  or scrutiny warrants moving off full autonomy.
- **Fresh / non-barcoded whole foods** (PLU search) — out of v1 scope; a separate identity path.
- **IP counsel sign-off** before commercial launch: ODbL isolation posture + nominative-fair-use
  posture for packaging imagery.
- **Premium / subscriptions** (StoreKit endpoint exists, unprocessed) and **brand portal/API**.
