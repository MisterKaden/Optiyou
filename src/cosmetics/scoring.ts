import type { GradeBand, SafetyLevel } from "../platform/types.ts";
import type {
  CosmeticConcernType,
  CosmeticProduct,
  CosmeticProfile,
  CosmeticReasonCode,
  CosmeticScoreResult
} from "./types.ts";

export const COSMETIC_METHODOLOGY_VERSION = "cosmetic-us-ca-v1" as const;

// A banned substance is the ONLY thing that hard-caps the score. Everything else contributes to a
// weighted, multi-axis, dose/use-aware score — the explicit rejection of the Yuka/EWG
// "worst-ingredient caps everything" model.
const BANNED_OPTISCORE_CAP = 30;
const BANNED_FIT_CAP = 12;

const WEIGHTS = {
  hazard: 0.35,
  sensitization: 0.25,
  transparency: 0.15,
  environmental: 0.1,
  positiveFormulation: 0.15
} as const;

export function scoreCosmeticProduct(product: CosmeticProduct, profile: CosmeticProfile): CosmeticScoreResult {
  const reasonCodes = new Set<CosmeticReasonCode>();
  const advisories: string[] = [];
  const rinseOff = product.use === "rinse_off";

  const counts = concernCounts(product);
  const ingredientCount = product.ingredients.length;
  const totalConcerned = product.ingredients.filter((item) => item.concerns.length > 0).length;

  const hazardScore = scoreHazard(counts, reasonCodes, advisories);
  const sensitizationScore = scoreSensitization(counts, rinseOff, reasonCodes, advisories);
  const transparencyScore = scoreTransparency(product, ingredientCount, reasonCodes, advisories);
  const environmentalScore = scoreEnvironmental(counts, reasonCodes);
  const positiveFormulationScore = scorePositiveFormulation(product, ingredientCount, totalConcerned, reasonCodes);
  const confidenceScore = clampScore(Math.round(product.dataQuality.confidence * 100));

  let optiScore = clampScore(Math.round(
    WEIGHTS.hazard * hazardScore +
    WEIGHTS.sensitization * sensitizationScore +
    WEIGHTS.transparency * transparencyScore +
    WEIGHTS.environmental * environmentalScore +
    WEIGHTS.positiveFormulation * positiveFormulationScore
  ));

  let safetyLevel: SafetyLevel = "ok";
  if (counts.banned > 0) {
    optiScore = Math.min(optiScore, BANNED_OPTISCORE_CAP);
    safetyLevel = "avoid";
  }

  const personalizationReasonCodes = new Set<CosmeticReasonCode>();
  const { adjustment, safetyLevel: personalSafety } = personalizationAdjustment(product, profile, counts, personalizationReasonCodes);
  safetyLevel = escalate(safetyLevel, personalSafety);
  let optiFit = clampScore(optiScore + adjustment);
  if (safetyLevel === "avoid") {
    optiFit = Math.min(optiFit, BANNED_FIT_CAP);
  }

  return {
    methodologyVersion: COSMETIC_METHODOLOGY_VERSION,
    aiFinalJudge: false,
    safetyLevel,
    gradeBand: gradeBandFor(optiScore),
    scoreComponents: {
      optiScore,
      optiFit,
      hazardScore,
      sensitizationScore,
      transparencyScore,
      environmentalScore,
      confidenceScore
    },
    reasonCodes: [...reasonCodes],
    personalizationReasonCodes: [...personalizationReasonCodes],
    advisories
  };
}

interface ConcernCounts {
  banned: number;
  restricted_use: number;
  cmr: number;
  formaldehyde_releaser: number;
  endocrine_suspected: number;
  fragrance_allergen: number;
  irritant: number;
  environmental: number;
  contested: number;
}

function concernCounts(product: CosmeticProduct): ConcernCounts {
  const counts: ConcernCounts = {
    banned: 0, restricted_use: 0, cmr: 0, formaldehyde_releaser: 0, endocrine_suspected: 0,
    fragrance_allergen: 0, irritant: 0, environmental: 0, contested: 0
  };
  for (const ingredient of product.ingredients) {
    for (const concern of new Set(ingredient.concerns)) {
      counts[concern] += 1;
    }
  }
  return counts;
}

function scoreHazard(counts: ConcernCounts, reasonCodes: Set<CosmeticReasonCode>, advisories: string[]): number {
  let score = 92;
  if (counts.banned > 0) {
    score -= 60;
    reasonCodes.add("COS_BANNED_SUBSTANCE");
  }
  if (counts.cmr > 0) {
    score -= Math.min(40, 25 * counts.cmr);
    reasonCodes.add("COS_CMR_CONCERN");
  }
  if (counts.formaldehyde_releaser > 0) {
    score -= Math.min(30, 15 * counts.formaldehyde_releaser);
    reasonCodes.add("COS_FORMALDEHYDE_RELEASER");
  }
  if (counts.endocrine_suspected > 0) {
    // Mostly contested / data-gap (e.g. parabens are low-risk at use levels): modest, labeled.
    score -= Math.min(16, 8 * counts.endocrine_suspected);
    reasonCodes.add("COS_ENDOCRINE_SUSPECTED");
  }
  if (counts.restricted_use > 0) {
    score -= Math.min(12, 6 * counts.restricted_use);
    reasonCodes.add("COS_RESTRICTED_USE");
    advisories.push("Contains use-restricted actives — follow the product's usage directions.");
  }
  if (counts.contested > 0) {
    score -= Math.min(8, 4 * counts.contested);
    reasonCodes.add("COS_CONTESTED_INGREDIENT");
    advisories.push("Contains an ingredient whose safety is genuinely debated (e.g. a chemical UV filter); the evidence is not settled.");
  }
  return clampScore(score);
}

function scoreSensitization(counts: ConcernCounts, rinseOff: boolean, reasonCodes: Set<CosmeticReasonCode>, advisories: string[]): number {
  let score = 92;
  const factor = rinseOff ? 0.5 : 1;
  if (counts.fragrance_allergen > 0) {
    score -= Math.min(25, Math.round(5 * counts.fragrance_allergen * factor));
    reasonCodes.add("COS_FRAGRANCE_ALLERGEN");
    advisories.push("Contains fragrance allergens — patch-test first if you have sensitive skin.");
  }
  if (counts.irritant > 0) {
    score -= Math.round((rinseOff ? 4 : 10) * Math.min(2, counts.irritant));
    reasonCodes.add("COS_IRRITANT");
  }
  return clampScore(score);
}

function scoreTransparency(product: CosmeticProduct, ingredientCount: number, reasonCodes: Set<CosmeticReasonCode>, advisories: string[]): number {
  let score = 95;
  if (product.hasUndisclosedFragrance) {
    score -= 15;
    reasonCodes.add("COS_FRAGRANCE_UNDISCLOSED");
    advisories.push("Lists 'fragrance/parfum' without fully disclosing its components.");
  }
  if (ingredientCount > 30) {
    score -= 8;
  } else if (ingredientCount > 20) {
    score -= 4;
  }
  return clampScore(score);
}

function scoreEnvironmental(counts: ConcernCounts, reasonCodes: Set<CosmeticReasonCode>): number {
  let score = 95;
  if (counts.environmental > 0) {
    score -= Math.min(24, 12 * counts.environmental);
    reasonCodes.add("COS_ENVIRONMENTAL");
  }
  return clampScore(score);
}

function scorePositiveFormulation(product: CosmeticProduct, ingredientCount: number, totalConcerned: number, reasonCodes: Set<CosmeticReasonCode>): number {
  let score = 60;
  if (totalConcerned === 0) {
    score += 30;
    reasonCodes.add("COS_SIMPLE_FORMULATION");
  }
  if (!product.hasUndisclosedFragrance) {
    score += 5;
  }
  if (ingredientCount > 0 && ingredientCount <= 12) {
    score += 5;
  }
  return clampScore(score);
}

function personalizationAdjustment(
  product: CosmeticProduct,
  profile: CosmeticProfile,
  counts: ConcernCounts,
  reasonCodes: Set<CosmeticReasonCode>
): { adjustment: number; safetyLevel: SafetyLevel } {
  let adjustment = 0;
  let safetyLevel: SafetyLevel = "ok";
  const preferences = new Set(profile.preferences);

  if (preferences.has("fragrance_free") && (product.hasUndisclosedFragrance || counts.fragrance_allergen > 0)) {
    adjustment -= 30;
    reasonCodes.add("PERS_FRAGRANCE_CONFLICT");
    safetyLevel = escalate(safetyLevel, "caution");
  }

  if (preferences.has("sensitive_skin") && (counts.irritant > 0 || counts.fragrance_allergen > 0)) {
    adjustment -= 20;
    reasonCodes.add("PERS_SENSITIVE_SKIN_CONFLICT");
    safetyLevel = escalate(safetyLevel, "caution");
  }

  if (preferences.has("pregnancy_safe") && counts.restricted_use > 0) {
    adjustment -= 25;
    reasonCodes.add("PERS_PREGNANCY_CONFLICT");
    safetyLevel = escalate(safetyLevel, "caution");
  }

  if (preferences.has("avoid_endocrine_disruptors") && counts.endocrine_suspected > 0) {
    adjustment -= 20;
    reasonCodes.add("PERS_ENDOCRINE_CONFLICT");
    safetyLevel = escalate(safetyLevel, "caution");
  }

  for (const avoided of profile.avoidedIngredients) {
    const needle = avoided.toLowerCase();
    if (product.ingredients.some((item) => item.normalizedName.includes(needle))) {
      adjustment -= 25;
      reasonCodes.add("PERS_AVOIDED_INGREDIENT");
    }
  }

  return { adjustment, safetyLevel };
}

function gradeBandFor(optiScore: number): GradeBand {
  if (optiScore >= 75) {
    return "good";
  }
  if (optiScore >= 50) {
    return "mixed";
  }
  return "poor";
}

const SAFETY_RANK: Record<SafetyLevel, number> = { ok: 0, caution: 1, avoid: 2 };

function escalate(current: SafetyLevel, next: SafetyLevel): SafetyLevel {
  return SAFETY_RANK[next] > SAFETY_RANK[current] ? next : current;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export type { CosmeticConcernType };
