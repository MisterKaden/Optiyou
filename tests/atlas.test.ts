import assert from "node:assert/strict";
import test from "node:test";

import { buildAtlasPrompt, parseAtlasResponse } from "../src/evidence/atlas.ts";
import { isAutoApprovable, validateEvidenceCard } from "../src/evidence/evidence-card.ts";

const COSMETIC = { ingredientCanonicalName: "mercury", domain: "cosmetic" as const };

test("buildAtlasPrompt embeds the ingredient and the hard guardrails", () => {
  const { system, user } = buildAtlasPrompt({ ingredientCanonicalName: "oxybenzone", domain: "cosmetic" });
  assert.match(system, /ATLAS/);
  assert.match(system, /NEVER fabricate/i);
  assert.match(user, /oxybenzone/);
  assert.match(user, /cosmetic/);
});

test("a strong, well-cited regulatory card parses and is auto-approvable", () => {
  const raw = JSON.stringify({
    concern_level: "avoid", evidence_tier: "A", evidence_status: "regulatory_action",
    effect_direction: "negative", reason_code: "COS_BANNED_SUBSTANCE", magnitude_band: "large",
    contested: false, needs_human_verification: false,
    citations: [{ title: "FDA revocation of mercury in cosmetics", type: "regulatory", verified: true }]
  });
  const card = parseAtlasResponse(raw, COSMETIC);
  assert.ok(card);
  assert.equal(card.evidenceTier, "A");
  assert.equal(card.magnitudeBand, "large");
  assert.equal(card.reviewStatus, "draft");
  assert.deepEqual(validateEvidenceCard(card), []);
  assert.equal(isAutoApprovable(card), true);
});

test("unverifiable claims can't reach tier A/B (no-fabricated-citations guardrail)", () => {
  const raw = JSON.stringify({
    evidence_tier: "A", effect_direction: "negative", magnitude_band: "moderate",
    needs_human_verification: false,
    citations: [{ title: "Some cohort", type: "cohort", verified: false }]
  });
  const card = parseAtlasResponse(raw, COSMETIC);
  assert.ok(card);
  assert.equal(card.evidenceTier, "C", "no verified citation -> capped at C");
  assert.equal(card.needsHumanVerification, true);
  assert.equal(isAutoApprovable(card), false);
});

test("preclinical-only evidence can't exceed tier C", () => {
  const raw = JSON.stringify({
    evidence_tier: "B", effect_direction: "negative", magnitude_band: "small", needs_human_verification: false,
    citations: [{ title: "Mouse study", type: "animal", verified: true }]
  });
  const card = parseAtlasResponse(raw, COSMETIC);
  assert.ok(card);
  assert.equal(card.evidenceTier, "C");
});

test("contested cards can't carry a large magnitude", () => {
  const raw = JSON.stringify({
    evidence_status: "contested", evidence_tier: "C", effect_direction: "negative", magnitude_band: "large",
    citations: [{ title: "Conflicting cohort", type: "cohort", verified: true }]
  });
  const card = parseAtlasResponse(raw, { ingredientCanonicalName: "octinoxate", domain: "cosmetic" });
  assert.ok(card);
  assert.equal(card.contested, true);
  assert.equal(card.magnitudeBand, "moderate");
});

test("parser recovers JSON from markdown-fenced output and rejects garbage", () => {
  const fenced = "Here is the card:\n```json\n{\"evidence_tier\":\"C\",\"effect_direction\":\"neutral\",\"magnitude_band\":\"none\"}\n```";
  assert.ok(parseAtlasResponse(fenced, COSMETIC));
  assert.equal(parseAtlasResponse("no json here", COSMETIC), null);
});
