import type { EvidenceCard, MagnitudeBand, ScoringDirective } from "./types.ts";

// Magnitude bands map to point ranges owned by the methodology (the engine picks the exact number;
// ATLAS only picks the band). Midpoints used for a deterministic directive.
const BAND_POINTS: Record<MagnitudeBand, number> = {
  none: 0,
  small: 4, // ~2–5
  moderate: 9, // ~6–12
  large: 19 // ~13–25
};

export function magnitudePoints(band: MagnitudeBand): number {
  return BAND_POINTS[band];
}

// Validation issues that must hold before a card is allowed to affect a score.
export function validateEvidenceCard(card: EvidenceCard): string[] {
  const issues: string[] = [];

  // The no-fabricated-citations guardrail: tier A/B require verifiable human evidence. If the card
  // still needs verification or has no verified citation, it may not claim a top tier.
  const hasVerifiedCitation = card.citations.some((citation) => citation.verified);
  if ((card.evidenceTier === "A" || card.evidenceTier === "B") && (card.needsHumanVerification || !hasVerifiedCitation)) {
    issues.push("tier_A_or_B_requires_verified_citations");
  }

  // Animal/in-vitro-only evidence can never exceed tier C.
  const onlyPreclinical = card.citations.length > 0 &&
    card.citations.every((citation) => citation.type === "animal" || citation.type === "invitro");
  if (onlyPreclinical && (card.evidenceTier === "A" || card.evidenceTier === "B")) {
    issues.push("preclinical_only_capped_at_tier_C");
  }

  // A genuinely contested topic must be flagged contested and must not carry a large penalty.
  if (card.evidenceStatus === "contested" && !card.contested) {
    issues.push("contested_status_requires_contested_flag");
  }
  if (card.contested && card.magnitudeBand === "large") {
    issues.push("contested_items_may_not_carry_a_large_magnitude");
  }

  // House stance: a score-moving penalty needs at least tier-B evidence; weaker evidence informs only.
  const isPenalty = card.effectDirection === "negative" && card.magnitudeBand !== "none";
  const weakTier = card.evidenceTier === "C" || card.evidenceTier === "D";
  const regulatory = card.evidenceStatus === "regulatory_action";
  if (isPenalty && weakTier && !regulatory) {
    issues.push("weak_evidence_penalty_should_be_advisory_not_score");
  }

  return issues;
}

// A card may move the score only when approved and free of validation issues. (ATLAS runs autonomous,
// so "approved" can be set by an auto-approval rule, but the validation guardrails always apply.)
export function isScoreEligible(card: EvidenceCard): boolean {
  return card.reviewStatus === "approved" && validateEvidenceCard(card).length === 0;
}

// Whether a draft card is safe to auto-approve under autonomous ATLAS: settled/regulatory evidence
// with no validation issues. Emerging/contested/weak cards may still publish as advisories, but they
// are not auto-approved to MOVE the score.
export function isAutoApprovable(card: EvidenceCard): boolean {
  if (validateEvidenceCard(card).length > 0) {
    return false;
  }
  if (card.needsHumanVerification) {
    return false;
  }
  return card.evidenceStatus === "consensus" ||
    card.evidenceStatus === "regulatory_action" ||
    card.evidenceStatus === "strong_contextual";
}

// Convert an approved card into a deterministic scoring directive. Score-ineligible cards yield a
// neutral directive that only carries the advisory (inform, don't punish).
export function scoringDirectiveFromCard(card: EvidenceCard): ScoringDirective {
  if (!isScoreEligible(card) || card.effectDirection === "neutral" || card.magnitudeBand === "none") {
    return { reasonCode: card.reasonCode, direction: "neutral", points: 0, advisory: card.advisory };
  }

  const magnitude = magnitudePoints(card.magnitudeBand);
  const signed = card.effectDirection === "negative" ? -magnitude : magnitude;
  return { reasonCode: card.reasonCode, direction: card.effectDirection, points: signed, advisory: card.advisory };
}
