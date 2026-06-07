import assert from "node:assert/strict";
import test from "node:test";

import {
  isAutoApprovable,
  isScoreEligible,
  magnitudePoints,
  scoringDirectiveFromCard,
  validateEvidenceCard
} from "../src/evidence/evidence-card.ts";
import type { EvidenceCard } from "../src/evidence/types.ts";

function card(over: Partial<EvidenceCard> = {}): EvidenceCard {
  return {
    ingredientCanonicalName: "added sugar",
    domain: "food",
    concernLevel: "caution",
    evidenceTier: "A",
    evidenceStatus: "consensus",
    effectDirection: "negative",
    reasonCode: "NUTRI_ADDED_SUGAR_HIGH",
    magnitudeBand: "moderate",
    contested: false,
    citations: [{ title: "Meta-analysis of added sugar and CVD", type: "meta_analysis", verified: true }],
    needsHumanVerification: false,
    reviewStatus: "approved",
    ...over
  };
}

test("a settled, approved, well-cited card is valid and score-eligible", () => {
  const c = card();
  assert.deepEqual(validateEvidenceCard(c), []);
  assert.equal(isScoreEligible(c), true);
});

test("tier A/B require verified citations (no-fabricated-citations guardrail)", () => {
  const issues = validateEvidenceCard(card({ needsHumanVerification: true }));
  assert.ok(issues.includes("tier_A_or_B_requires_verified_citations"));
});

test("preclinical-only evidence cannot exceed tier C", () => {
  const issues = validateEvidenceCard(card({
    evidenceTier: "B",
    citations: [{ title: "Mouse study", type: "animal", verified: true }]
  }));
  assert.ok(issues.includes("preclinical_only_capped_at_tier_C"));
});

test("contested topics must be flagged and may not carry a large penalty", () => {
  assert.ok(validateEvidenceCard(card({ evidenceStatus: "contested", contested: false })).includes("contested_status_requires_contested_flag"));
  assert.ok(validateEvidenceCard(card({ contested: true, magnitudeBand: "large", evidenceStatus: "contested" })).includes("contested_items_may_not_carry_a_large_magnitude"));
});

test("weak-evidence penalties should inform via advisory, not move the score", () => {
  const issues = validateEvidenceCard(card({ evidenceTier: "C", evidenceStatus: "emerging", magnitudeBand: "small" }));
  assert.ok(issues.includes("weak_evidence_penalty_should_be_advisory_not_score"));
});

test("isAutoApprovable allows settled/regulatory cards, not emerging/contested or unverified", () => {
  assert.equal(isAutoApprovable(card({ evidenceStatus: "consensus" })), true);
  assert.equal(isAutoApprovable(card({ evidenceStatus: "regulatory_action" })), true);
  assert.equal(isAutoApprovable(card({ evidenceTier: "C", evidenceStatus: "emerging", magnitudeBand: "small" })), false);
  assert.equal(isAutoApprovable(card({ needsHumanVerification: true })), false);
});

test("magnitude bands map to point ranges", () => {
  assert.equal(magnitudePoints("none"), 0);
  assert.ok(magnitudePoints("small") < magnitudePoints("moderate"));
  assert.ok(magnitudePoints("moderate") < magnitudePoints("large"));
});

test("scoringDirectiveFromCard signs the points by direction and is neutral when ineligible", () => {
  const negative = scoringDirectiveFromCard(card({ effectDirection: "negative", magnitudeBand: "moderate" }));
  assert.ok(negative.points < 0);
  assert.equal(negative.direction, "negative");

  // A draft (not approved) card carries only its advisory, never a score move.
  const draft = scoringDirectiveFromCard(card({ reviewStatus: "draft", advisory: "Wash well." }));
  assert.equal(draft.points, 0);
  assert.equal(draft.direction, "neutral");
  assert.equal(draft.advisory, "Wash well.");
});
