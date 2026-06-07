// Persisted shape of an ATLAS Evidence Card (see docs/nutrition-evidence-gatekeeper.md §6).
// ATLAS drafts these from primary literature; the scoring engines read approved cards to replace
// the v0 keyword seeds with evidence-tiered, dose-aware classifications.

export type EvidenceDomain = "food" | "cosmetic";
export type EvidenceTier = "A" | "B" | "C" | "D";
export type EvidenceStatus =
  | "consensus"
  | "strong_contextual"
  | "emerging"
  | "contested"
  | "weak_mechanistic"
  | "regulatory_action";
export type ConcernLevel = "beneficial" | "neutral" | "caution" | "avoid";
export type EffectDirection = "positive" | "negative" | "neutral";
export type MagnitudeBand = "none" | "small" | "moderate" | "large";
export type ReviewStatus = "draft" | "approved" | "rejected";

export type EvidenceSourceType =
  | "meta_analysis"
  | "rct"
  | "cohort"
  | "mechanistic"
  | "animal"
  | "invitro"
  | "regulatory"
  | "review";

export interface EvidenceCitation {
  title: string;
  identifier?: string; // DOI / PMID / URL
  year?: number;
  type: EvidenceSourceType;
  finding?: string;
  verified: boolean;
}

export interface EvidenceCard {
  ingredientCanonicalName: string;
  domain: EvidenceDomain;
  concernLevel: ConcernLevel;
  evidenceTier: EvidenceTier;
  evidenceStatus: EvidenceStatus;
  effectDirection: EffectDirection;
  reasonCode?: string;
  magnitudeBand: MagnitudeBand;
  doseContext?: string;
  contested: boolean;
  advisory?: string;
  citations: EvidenceCitation[];
  needsHumanVerification: boolean;
  reviewStatus: ReviewStatus;
  confidence?: number;
}

export interface ScoringDirective {
  reasonCode?: string;
  direction: EffectDirection;
  // Suggested point delta the deterministic engine may apply (sign follows direction).
  points: number;
  advisory?: string;
}
