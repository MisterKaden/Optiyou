# Optiyou Blueprint v2 — The Personal Health Layer

> Reconciles the 2026-06-10 founder blueprint (Goals 1–14) with the locked decisions in
> [master-plan.md](master-plan.md) (food scoring spine), [mvp-goal.md](mvp-goal.md) (3-pillar MVP),
> and [nutrition-evidence-gatekeeper.md](nutrition-evidence-gatekeeper.md) (ATLAS). Those docs stay
> canonical for what they cover; **this doc owns the health-data layer, the PHI boundary, compliance,
> and the stack evolution.** Deviations from the founder blueprint are deliberate and logged in §13.
>
> Status: **approved direction.** Last updated 2026-06-10.

---

## 1. Product boundary — what Optiyou is allowed to be

Optiyou stays in the **general-wellness / decision-support lane** until counsel and scale justify
more. FDA's general-wellness guidance keeps low-risk products that promote a healthy lifestyle —
and are unrelated to diagnosis, cure, mitigation, prevention, or treatment of disease — outside
device regulation; software functions that meet the device definition are regulated. Wording is the
risk surface, so wording is governed centrally.

**Positioning statement (use everywhere, verbatim):**

> "Optiyou helps you understand how product ingredients and nutrition align with your self-selected
> wellness goals and the health information you choose to share. It does not diagnose, treat, or
> replace medical advice."

**Claim guardrails (extends master-plan §4.6 hazard ≠ risk):**
- ✅ "High sodium relative to your blood-pressure *goal*." (goal-framed)
- ✅ "Contains dairy, which you marked as avoid." (user-declared)
- ⚠️ "Less aligned with your lipid goal" — allowed only when the user supplied the biomarker or goal.
- 🚫 "Better for your cholesterol," "avoid because of kidney disease," "optimized for methylation,"
  any diagnosis, any treatment claim, any medication instruction.
- Every personalization sentence template lives in the Rules DB with a `claim_risk` review flag —
  not free-typed by AI, not free-typed by engineers.

---

## 2. Stack — what stays, what's added, what's declined

| Layer | Decision | Why |
|---|---|---|
| **Mobile** | **Native SwiftUI stays.** Expo/RN declined for iOS. | The app is built, branded, tested, and the ultra-premium positioning depends on native polish. A rewrite buys zero user value. Revisit cross-platform only for Android (RN/Expo or Kotlin then — decide on real demand). |
| **Web/admin** | Static Worker-served admin stays for now; **adopt Next.js on Cloudflare** when rule-review/clinician tooling outgrows it. | Don't add a framework before the tooling needs one. |
| **Edge / product catalog** | **Cloudflare stays the spine** — DNS/WAF/rate-limiting/Turnstile, Workers, D1, R2, KV, Queues, Vectorize, Workers AI. | Working, cheap, fast, already live. Catalog data is non-PHI and read-heavy: edge-perfect. |
| **Personal health data** | **Adopt Supabase Postgres** as the *separate* health-graph system of record: RLS on every table, Vault for secrets, Storage (HIPAA-ready config) for uploaded documents, pgvector for health-graph semantic search. | This is the PHI boundary (§3). Postgres + RLS + BAA-capable hosting is the right home for biomarkers; D1 is not. |
| **Auth** | **Sign in with Apple stays primary** (already shipped, admin roles attached). Supabase Auth validates the same identity server-side for health-data access; MFA required before any health document upload; passkeys later. | Don't fork identity. One account, two trust zones. |
| **FHIR layer** | **Deferred, planned for**: Medplum (or Aidbox/HAPI) when EHR/lab connectivity arrives (Phase H3/H4). Schema is FHIR-shaped from day one (Observations ≈ FHIR `Observation`) so the mapping is mechanical. | Don't run a FHIR server before there's FHIR traffic. |
| **AI providers** | Workers AI + AI Gateway stay for catalog work (OCR cleanup, extraction, embeddings). **Any model call that touches PHI requires a signed BAA with that provider first** — OpenAI, Anthropic, or other. Until a BAA exists, PHI never enters a prompt, period. | Provider-agnostic; the BAA is the gate, not the brand. |
| **OCR (lab PDFs)** | HIPAA-ready OCR provider or self-hosted extraction, inside the PHI boundary. The existing label-photo OCR path (non-PHI) is unaffected. | Lab reports are the most sensitive artifact we'll hold. |
| **Queues** | Cloudflare Queues for catalog work (stays). Health-side async jobs run in Supabase (pg-boss/cron) **inside** the boundary. | No PHI through non-covered Cloudflare services. |
| **Analytics** | Analytics Engine for product analytics (already planned), **zero PHI**; health-layer telemetry is counts/latencies only, never values. | |
| **Data sources** | **USDA-first stays; OFF/OBF stay ODbL-isolated** (master-plan §7). OFF's computed fields (NOVA, Nutri-Score, normalized ingredients) are useful *supplements*, never the backbone. | ODbL share-alike would contaminate the proprietary moat. Locked decision, unchanged. |

**The principle: we are not replacing Supabase/Cloudflare with something "more medical" — we are
drawing a healthcare-grade boundary between them.**

---

## 3. The PHI boundary architecture

```
┌────────────────── Cloudflare (non-PHI zone) ──────────────────┐
│ WAF · Turnstile · rate limits · optiyou-api Workers           │
│ Product Truth DB (D1) · images (R2) · cards (KV)              │
│ Ingredient Intelligence · Evidence DB (ATLAS) · Vectorize     │
│ Deterministic scorers (OptiScore food/cosmetic)               │
└──────────────┬────────────────────────────────────────────────┘
               │  product facts, rules, reason codes (down)
               │  goal/constraint *flags*, never raw labs (up)
┌──────────────▼────────────── Supabase (PHI zone) ─────────────┐
│ Postgres + RLS: user_profile · biomarker_observation          │
│ genetic_result · consent_ledger · score_event · audit_log     │
│ Storage: lab PDFs/reports (encrypted)   pgvector: health graph │
│ Personalization engine (OptiFit v2 biomarker rules)           │
│ BAA-covered OCR + BAA-covered LLM explanation calls           │
└───────────────────────────────────────────────────────────────┘
```

- **Scores compute where the data lives.** OptiScore (universal) computes at the edge as today.
  OptiFit v2 with biomarkers computes inside the PHI zone: the boundary pulls *product facts +
  active rules* down; raw health values never go up. (Pre-biomarker OptiFit — goals/allergens only,
  as shipped — may keep computing client/edge-side; declared preferences are sensitive but the
  payload is flags, not labs.)
- The iOS app talks to both zones; the zones never share storage; cross-zone references use opaque
  user IDs.

---

## 4. Data model — built for explainability

The founder framing is adopted wholesale: **the core asset is a structured personal-health ×
product knowledge graph, not "AI."** New entities (Supabase side), FHIR-shaped:

- **`user_profile`** — age range, sex (where relevant), pregnancy/lactation status, goals,
  allergies, intolerances, diet type, medications, supplements, self-shared diagnoses, wearable
  links, consent settings. Every field optional; every field user-editable; provenance per field.
- **`biomarker_observation`** — test name, **LOINC code when mappable**, value, unit, reference
  range, collection date, lab source, confidence, source document pointer, entry method
  (`user_entered | ocr_extracted | api_imported`). **Never store "LDL = 155" as prose** — always
  the normalized observation.
- **`genetic_result`** — gene, variant, rsID, zygosity, reported interpretation, source lab,
  evidence level, actionability tier (§5), clinical confidence.
- **`score_event`** — OptiScore, OptiFit, Confidence, active rule IDs, top reason codes, a hashed
  **user-context snapshot**, and `methodology/normalization/rules` versions. Reproducibility
  contract: any score can be replayed. (Extends master-plan §4.7 provenance with the context
  snapshot.)
- **`consent_ledger`** — per-purpose grants with timestamps and revocations (§9).

Existing entities (**Product**, **Rule**, Evidence Cards) stay in the Cloudflare zone per
master-plan §6. **Rule** gains fields: `owner`, `contraindication_logic`, `clinician_review_status`,
`claim_risk`, and trigger support for biomarker conditions.

The promise a user can tap into, always: *"This scored 61 for you because sodium is high relative
to your blood-pressure goal, fiber is low relative to your LDL goal, and it contains an allergen
you marked as avoid."*

---

## 5. Input actionability tiers (A–E)

Distinct from ATLAS's claim-evidence tiers (which grade *the science behind a rule*), these grade
*the personal input that triggers a rule*. Both appear on every personalized reason code.

| Tier | Input | Scoring power |
|---|---|---|
| **A** | Declared allergies, medications, diagnosed conditions, pregnancy/lactation, current clinical biomarkers | Full — including hard `avoid` overrides |
| **B** | Repeated biomarker trends, clinician-confirmed notes, validated risk markers | Strong adjustments |
| **C** | Genetic variants with strong clinical actionability | Moderate, always paired with advisory |
| **D** | Methylation / nutrigenomic claims with limited or mixed evidence | **Advisory-only by default** — explains, doesn't move points |
| **E** | Wellness preferences (taste, ideology, brand values) | OptiFit preference adjustments only |

**The MTHFR rule, as policy:** common MTHFR variants are not, by themselves, a reason to avoid
folic acid (CDC: folic-acid intake matters more than genotype for blood folate; no clinical
recommendation to test MTHFR or change folate intake by genotype). Optiyou's voice:
*"This genetic result has limited actionability unless paired with biomarkers like homocysteine,
folate, B12, and clinician guidance."* Methylation-first personalization is explicitly **not** the
MVP — biomarkers and allergies first, because they're actionable and validatable.

Biomarkers also carry **freshness**: a 3-year-old LDL drops rule confidence; stale labs surface as
"based on labs from 2023 — consider updating."

---

## 6. OptiFit v2 — biomarker-aware personalization

Extends the shipped OptiFit (master-plan §4.5/§4.7) without changing its contract. Rules stay
deterministic, weighted, versioned, data-driven:

```
IF   user.ldl_c is elevated  OR  user.goal = heart_health
AND  product.saturated_fat_per_serving is high (category-aware)
THEN OptiFit −8..−15
REASON  "Saturated fat is less aligned with your lipid goal."
TIER    input=A/B · evidence=ATLAS card #…
CONFIDENCE  scaled by biomarker recency
```

**Five relationship classes** per product × user: `avoid` (allergen, medication interaction,
pregnancy restriction, condition conflict) · `caution` (biomarker/goal mismatch) · `supportive`
(fiber↔LDL/glucose goals, protein↔muscle, iron↔low ferritin where appropriate) · `neutral` ·
`unknown` (missing data — shown honestly).

**Locked safety law (already implemented for allergens, extended here):** a Tier-A hard flag —
allergy, medication interaction, pregnancy restriction — **overrides any quality score**:
`safetyLevel: avoid`, OptiFit capped ≤12, warning first. A 95-point product with the user's
allergen is presented as *avoid*, full stop.

Output per score: OptiFit 0–100 · Confidence (low/med/high) · top positives · top negatives ·
hard flags. AI writes the sentence; the rules decide the content.

---

## 7. Health-data ingestion — four phases, ranked by reliability

1. **H1 — Manual entry + PDF upload.** Bloodwork PDFs, methylation reports, micronutrient/hormone
   panels, CGM exports, screenshots → BAA-covered OCR → candidate observations with confidence →
   **user confirms anything low-confidence before it can influence a score.** Extraction is never
   silently authoritative.
2. **H2 — Apple Health / wearables.** HealthKit import (activity, sleep, weight, glucose where
   available, heart rate) with explicit per-type authorization. Natural fit with the native app.
3. **H3 — SMART on FHIR.** "Connect my health records" via SMART App Launch (OAuth-style consent,
   FHIR `Observation`/`DiagnosticReport` reads). This is when Medplum/Aidbox (or
   Health Gorilla/Redox/1upHealth) enters the stack.
4. **H4 — Lab partners.** Direct structured results from lab networks.

**Normalization rule for all four:** map to LOINC wherever possible (LOINC's FHIR terminology
service for lookups); preserve original text + unit; conversions are versioned logic. The
biomarker-alias library this builds is moat (§12).

---

## 8. AI architecture — five jobs, one forbidden shape

AI is used in exactly five controlled places (extends master-plan §10):
**extraction** (PDFs, labels, panels) · **normalization** (alias → canonical marker/ingredient) ·
**retrieval** (evidence + rules, RAG over approved docs) · **explanation** (reason codes → warm,
literate language in the brand voice) · **user Q&A** ("why did this drop?" — answered from rules +
citations, with guardrails).

**Forbidden architecture:** `product + labs → LLM → score`.
**Required architecture:** `product + labs → normalized data → deterministic rules engine →
score + reason codes → AI explanation`.

PHI rules: BAA before any PHI reaches a provider; **prompt minimization** (send the three fields
the task needs, never the chart); "do not use my data for AI improvement" is a user control we
honor and flow down to providers contractually.

---

## 9. Privacy, consent, compliance — day-one foundation

Posture: HIPAA may or may not attach (it follows covered-entity/business-associate relationships,
not data type) — **build to its standard anyway**, because the FTC (Health Breach Notification
Rule, Section 5) reaches health apps regardless, and state law already does: **Washington
My Health My Data** (consumer health data outside HIPAA, for any business serving WA consumers)
and **California CMIA** (extended to apps that store medical information). Cosmetics side: MoCRA
continues to apply to product claims.

Day-one list (no health feature ships without all of these):
- **Consent ledger** — per-purpose, per-source grants; revocable; timestamped.
- **Delete + export** — full account erasure and machine-readable export, self-serve.
- **Audit logs** on every health-data read/write (who, what, when, why).
- **Encryption** at rest + in transit; **RLS** on every health table; **MFA** before health upload;
  least-privilege admin (no blanket admin read of health data — break-glass with audit only).
- **No sale of health data. Ever.** Stated in a separate consumer-health privacy policy.
- **Breach response plan** + vendor **BAA/DPA inventory** (living doc).
- **"Don't train on my data"** toggle, honored end-to-end.

---

## 10. Validation & safety systems

Trust over cleverness — five validation layers:
- **Data:** extracted lab values verified against source PDFs; impossible-unit detection; stale-lab
  flags; low-confidence OCR requires user confirmation (§7).
- **Product:** missing serving size, contradictory ingredients, outdated label images, incomplete
  panels → confidence hits + admin queue (extends master-plan §5).
- **Rules:** every rule has an owner, evidence source, severity, contraindication logic, version
  history (§4) — and a **clinician review status**; the master-plan's "credentialed reviewer when
  funded" upgrades to **required for Tier A/B biomarker rules before the health layer leaves beta.**
- **User safety:** never "stop your medication," never "ignore your doctor," never diagnosis.
  Anything medically loaded renders as "worth discussing with your clinician."
- **Fairness:** no weight-loss or disease assumptions from demographics; goals are asked, not
  inferred.
- **Comprehension A/B testing:** measure whether users *correctly understand* scores, not just
  whether they convert.

---

## 11. Build order (reconciled)

The founder's MVP 1–6 maps onto the shipped/locked phases; the health layer slots in as H-phases:

| Founder step | Status in repo |
|---|---|
| MVP 1 — Product Score | ✅ shipped (OptiScore food + cosmetic, master-plan Phases 1–2) |
| MVP 2 — Profile without labs | ✅ shipped (goals/allergens/preferences OptiFit) |
| MVP 5 — AI explanations from reason codes | ✅ shipped (explanation composer; deepens with ATLAS) |
| MVP 6 — Better swaps | ✅ shipped v1 (same-category alternatives; personalized ranking deepens) |
| **MVP 3 — Basic labs** | **→ Phase H1** (next new build): Supabase PHI zone, consent ledger, manual entry + PDF OCR + confirmation for the starter panel: A1c/glucose, lipids, BP, vitamin D, ferritin/iron, B12, folate, hs-CRP, eGFR/creatinine |
| **MVP 4 — Personalized Score w/ labs** | **→ Phase H2**: biomarker rules (sodium↔BP, added sugar↔glucose, sat fat↔LDL, fiber, caffeine, protein, iron, D, B12/folate, kidney cautions) + HealthKit import |
| — | **Phase H3**: SMART on FHIR connect + Medplum-class layer |
| — | **Phase H4**: lab partners; genetics/methylation **after** biomarkers, as Tier C/D advisory-first |

Existing master-plan Phases 3/4/6/7 (ingredient graph, ATLAS, photo pipeline, premium) continue in
parallel — unchanged.

---

## 12. Moat (extended)

Master-plan §14 stands; the health layer adds: the **biomarker mapping library** (names, aliases,
units, LOINC, ranges, conversions), the **personalized rule engine** (evidence-weighted health-state
× product logic with clinician review), the **outcome feedback loop** (purchases → symptoms → new
labs → score evolution), the **alternatives graph** ("similar enough to replace" by category, taste,
price, dietary profile, personal score), and the **trust system** as UI (citations, versioned rules,
clinician-reviewed badges, data-quality indicators). Later: **brand portal** for verified labels.
**Transparency is the product — the moat must never become black-box AI.**

---

## 13. Decision log — founder blueprint vs. this doc

| Founder proposal | Decision | Rationale |
|---|---|---|
| Expo/React Native mobile | **Declined for iOS; reconsider for Android** | Native app already built, branded, tested; premium UX is the brand promise |
| Next.js web/admin | **Deferred-adopt** | Static admin suffices today; Next.js when clinician tooling arrives |
| Supabase Postgres/RLS/Vault/Storage/pgvector | **Adopted as the PHI zone** | Right tool; creates the healthcare-grade boundary |
| Cloudflare edge + Workers | **Adopted (already live)** | Keep PHI out of non-covered services |
| "Two scores" | **Kept three** | Confidence is load-bearing (master-plan §2); names stay OptiScore/OptiFit |
| OFF as a primary product source | **Kept USDA-first, OFF isolated** | ODbL share-alike vs. proprietary moat (locked 2026-06) |
| OpenAI under BAA | **Generalized: any provider, BAA-gated** | Provider-agnostic; BAA is the gate |
| FHIR layer now | **Deferred to H3, schema FHIR-shaped now** | No FHIR server before FHIR traffic |
| Neo4j "probably not needed" | **Agreed** | Graph-in-Postgres (+ existing D1 graph tables) until traversal demands more |
| Food-only framing | **Amended: cosmetics pillar stays** | Locked 3-pillar MVP; skin goals join the health graph later |
| Evidence tiers A–E | **Adopted as *input* tiers** | Complements ATLAS *claim* tiers; both shown per reason code |
| Methylation = low-confidence input | **Adopted (Tier D, advisory-first)** | Matches anti-hype stance; CDC MTHFR position |
| Deterministic rules, AI explains | **Already locked** | Identical to master-plan principles 3–4 |
| Day-one consent/deletion/audit | **Adopted** | Non-negotiable before any health feature |
