import assert from "node:assert/strict";
import test from "node:test";

import { applyEvidence, buildKnowledgeIndex, netPoints } from "../src/evidence/apply.ts";
import type { EvidenceCard } from "../src/evidence/types.ts";

function card(over: Partial<EvidenceCard> & Pick<EvidenceCard, "ingredientCanonicalName">): EvidenceCard {
  return {
    domain: "cosmetic",
    concernLevel: "caution",
    evidenceTier: "A",
    evidenceStatus: "consensus",
    effectDirection: "negative",
    magnitudeBand: "moderate",
    contested: false,
    citations: [{ title: "Source", type: "regulatory", verified: true }],
    needsHumanVerification: false,
    reviewStatus: "approved",
    ...over
  };
}

test("buildKnowledgeIndex prefers a score-eligible card over an advisory-only draft", () => {
  const draft = card({ ingredientCanonicalName: "Oxybenzone", reviewStatus: "draft", advisory: "Debated." });
  const approved = card({ ingredientCanonicalName: "Oxybenzone", reviewStatus: "approved" });
  const index = buildKnowledgeIndex([draft, approved]);
  assert.equal(index.get("cosmetic:oxybenzone")?.reviewStatus, "approved");
});

test("applyEvidence resolves directives and advisories for matching ingredients only", () => {
  const index = buildKnowledgeIndex([
    card({ ingredientCanonicalName: "formaldehyde", magnitudeBand: "large", evidenceStatus: "regulatory_action" }),
    card({ ingredientCanonicalName: "limonene", effectDirection: "neutral", magnitudeBand: "none", reviewStatus: "approved", advisory: "Patch-test if sensitive." })
  ]);

  const applied = applyEvidence(["water", "formaldehyde", "limonene", "glycerin"], index, "cosmetic");
  assert.deepEqual(applied.matchedIngredients.sort(), ["formaldehyde", "limonene"]);
  assert.ok(netPoints(applied) < 0, "formaldehyde contributes a negative directive");
  assert.ok(applied.advisories.includes("Patch-test if sensitive."), "neutral card still informs");
});

test("domain scoping keeps food and cosmetic graphs separate", () => {
  const index = buildKnowledgeIndex([card({ ingredientCanonicalName: "sugar", domain: "food" })]);
  assert.equal(applyEvidence(["sugar"], index, "cosmetic").directives.length, 0);
  assert.equal(applyEvidence(["sugar"], index, "food").directives.length, 1);
});

test("ineligible (unverified tier-A) cards do not move the score", () => {
  const index = buildKnowledgeIndex([
    card({ ingredientCanonicalName: "mystery", needsHumanVerification: true, advisory: "Under review." })
  ]);
  const applied = applyEvidence(["mystery"], index, "cosmetic");
  assert.equal(netPoints(applied), 0);
  assert.ok(applied.advisories.includes("Under review."));
});
