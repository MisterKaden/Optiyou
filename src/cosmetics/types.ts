import type { DataQuality, GradeBand, SafetyLevel } from "../platform/types.ts";

// MVP cosmetics = skincare-first; the enum keeps room for the rest of personal care.
export type CosmeticCategory =
  | "skincare"
  | "haircare"
  | "makeup"
  | "deodorant"
  | "suncare"
  | "unknown";

// How the product is used drives dose/exposure weighting (an irritant in a rinse-off cleanser is a
// smaller deal than the same irritant in a leave-on serum).
export type CosmeticUse = "leave_on" | "rinse_off" | "unknown";

// Concern axes. NOTE: this v0 vocabulary is a keyword seed; ATLAS + CosIng/regulatory data will
// replace it with evidence-tiered, dose-aware classifications. We deliberately reject the
// "any concern caps the whole score" model — only genuinely banned substances cap.
export type CosmeticConcernType =
  | "banned"                 // prohibited in US/CA/EU — hard cap
  | "restricted_use"         // allowed within limits / conditions — small penalty + advisory
  | "cmr"                    // carcinogen / mutagen / reprotoxin (settled)
  | "formaldehyde_releaser"
  | "endocrine_suspected"    // suspected endocrine activity (often contested / data-gap)
  | "fragrance_allergen"     // EU declarable allergens
  | "irritant"
  | "environmental"          // e.g. D4/D5 siloxanes — separate from human-health hazard
  | "contested";             // genuinely debated (e.g. chemical UV filters)

export interface CosmeticIngredient {
  position: number;
  inci: string;            // as printed on the label
  normalizedName: string;
  concerns: CosmeticConcernType[];
}

export interface CosmeticProduct {
  id: string;
  gtin: string;
  market: "US_CA";
  vertical: "cosmetic";
  category: CosmeticCategory;
  use: CosmeticUse;
  name: string;
  brand: string;
  versionId: string;
  version: number;
  dataQuality: DataQuality;
  ingredients: CosmeticIngredient[];
  hasUndisclosedFragrance: boolean;
}

export type CosmeticPreference =
  | "sensitive_skin"
  | "fragrance_free"
  | "pregnancy_safe"
  | "acne_prone"
  | "vegan"
  | "avoid_endocrine_disruptors";

export interface CosmeticProfile {
  id: string;
  preferences: CosmeticPreference[];
  avoidedIngredients: string[];
}

export type CosmeticReasonCode =
  | "COS_BANNED_SUBSTANCE"
  | "COS_RESTRICTED_USE"
  | "COS_CMR_CONCERN"
  | "COS_FORMALDEHYDE_RELEASER"
  | "COS_ENDOCRINE_SUSPECTED"
  | "COS_FRAGRANCE_ALLERGEN"
  | "COS_IRRITANT"
  | "COS_ENVIRONMENTAL"
  | "COS_CONTESTED_INGREDIENT"
  | "COS_FRAGRANCE_UNDISCLOSED"
  | "COS_SIMPLE_FORMULATION"
  | "PERS_FRAGRANCE_CONFLICT"
  | "PERS_SENSITIVE_SKIN_CONFLICT"
  | "PERS_PREGNANCY_CONFLICT"
  | "PERS_ENDOCRINE_CONFLICT"
  | "PERS_AVOIDED_INGREDIENT";

export interface CosmeticScoreComponents {
  optiScore: number;
  optiFit: number;
  hazardScore: number;
  sensitizationScore: number;
  transparencyScore: number;
  environmentalScore: number;
  confidenceScore: number;
}

export interface CosmeticScoreResult {
  methodologyVersion: "cosmetic-us-ca-v1";
  aiFinalJudge: false;
  safetyLevel: SafetyLevel;
  gradeBand: GradeBand;
  scoreComponents: CosmeticScoreComponents;
  reasonCodes: CosmeticReasonCode[];
  personalizationReasonCodes: CosmeticReasonCode[];
  // Inform-don't-punish notes (e.g. "contains fragrance allergens — patch-test if sensitive").
  advisories: string[];
}

export interface CosmeticAlternative {
  gtin: string;
  name: string;
  brand: string;
  optiFit: number;
  whyBetter: string[];
  paidPlacement: false;
}

export interface CosmeticProductCard {
  status: "known" | "estimated";
  vertical: "cosmetic";
  product: CosmeticProduct;
  scores: CosmeticScoreComponents;
  safetyLevel: SafetyLevel;
  gradeBand: GradeBand;
  confidence: {
    value: number;
    label: "High confidence" | "Good confidence" | "Low confidence";
    verificationStatus: CosmeticProduct["dataQuality"]["verificationStatus"];
    source: CosmeticProduct["dataQuality"]["source"];
  };
  reasonCodes: CosmeticReasonCode[];
  advisories: string[];
  alternatives: CosmeticAlternative[];
  methodology: {
    version: "cosmetic-us-ca-v1";
    scope: "U.S./Canada cosmetics & personal care";
    disclaimer: string;
  };
}
