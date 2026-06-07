import type {
  FoodProduct,
  GradeBand,
  IngredientFlag,
  PersonalizationProfile,
  ProcessingLevel,
  ReasonCode,
  SafetyLevel,
  ScoreResult
} from "../platform/types.ts";

export const FOOD_METHODOLOGY_VERSION = "food-us-ca-v1" as const;

// When a declared allergen (or hard dietary restriction) conflicts, OptiFit is capped here
// regardless of universal quality — a great cereal is still "avoid" if it contains your allergen.
const ALLERGEN_FIT_CAP = 12;

export function scoreFoodProduct(product: FoodProduct, profile: PersonalizationProfile): ScoreResult {
  const reasonCodes = new Set<ReasonCode>();
  const personalizationReasonCodes = new Set<ReasonCode>();
  const nutritionScore = scoreNutrition(product, reasonCodes);
  const ingredientScore = scoreIngredients(product, reasonCodes);
  const processingScore = scoreProcessing(product.processingLevel, reasonCodes);
  const confidenceScore = clampScore(Math.round(product.dataQuality.confidence * 100));
  const optiScore = scoreGeneralProductQuality(product, reasonCodes);

  const { adjustment, safetyLevel } = personalizationAdjustment(product, profile, personalizationReasonCodes);
  let optiFit = clampScore(optiScore + adjustment);
  if (safetyLevel === "avoid") {
    optiFit = Math.min(optiFit, ALLERGEN_FIT_CAP);
  }

  return {
    methodologyVersion: FOOD_METHODOLOGY_VERSION,
    aiFinalJudge: false,
    safetyLevel,
    gradeBand: gradeBandFor(optiScore),
    scoreComponents: {
      optiScore,
      optiFit,
      nutritionScore,
      ingredientScore,
      processingScore,
      confidenceScore
    },
    reasonCodes: [...reasonCodes],
    personalizationReasonCodes: [...personalizationReasonCodes]
  };
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

function scoreNutrition(product: FoodProduct, reasonCodes: Set<ReasonCode>): number {
  let score = 85;
  const nutrition = product.nutrition;

  if (nutrition.addedSugarGrams >= 10) {
    score -= 22;
    reasonCodes.add("NUTRI_ADDED_SUGAR_HIGH");
  } else if (nutrition.addedSugarGrams <= 4) {
    score += 4;
    reasonCodes.add("NUTRI_ADDED_SUGAR_LOW");
  }

  if (nutrition.fiberGrams >= 6) {
    score += 7;
    reasonCodes.add("NUTRI_FIBER_GOOD");
  } else if (nutrition.fiberGrams < 3) {
    score -= 8;
  }

  if (nutrition.proteinGrams >= 12) {
    score += 7;
    reasonCodes.add("NUTRI_PROTEIN_GOOD");
  } else if (nutrition.proteinGrams >= 8) {
    score += 4;
    reasonCodes.add("NUTRI_PROTEIN_GOOD");
  }

  if (nutrition.sodiumMilligrams > 700) {
    score -= 14;
    reasonCodes.add("NUTRI_SODIUM_HIGH");
  } else if (nutrition.sodiumMilligrams > 450) {
    score -= 7;
    reasonCodes.add("NUTRI_SODIUM_HIGH");
  }

  return clampScore(score);
}

function scoreIngredients(product: FoodProduct, reasonCodes: Set<ReasonCode>): number {
  let score = 90;

  for (const flag of allIngredientFlags(product)) {
    switch (flag) {
      case "synthetic_dye":
        score -= 10;
        reasonCodes.add("ING_SYNTHETIC_DYE");
        break;
      case "artificial_sweetener":
        score -= 8;
        reasonCodes.add("ING_ARTIFICIAL_SWEETENER");
        break;
      case "preservative":
        score -= 5;
        reasonCodes.add("ING_PRESERVATIVE");
        break;
      case "ultra_processed_marker":
        score -= 8;
        reasonCodes.add("ING_ULTRA_PROCESSED_MARKER");
        break;
      case "added_sugar":
      case "contains_dairy":
      case "contains_gluten":
        break;
    }
  }

  return clampScore(score);
}

function scoreProcessing(processingLevel: ProcessingLevel, reasonCodes: Set<ReasonCode>): number {
  switch (processingLevel) {
    case "minimal":
      reasonCodes.add("PROCESSING_MINIMAL");
      return 90;
    case "moderate":
      return 72;
    case "high":
      reasonCodes.add("PROCESSING_HIGH");
      return 45;
  }
}

function scoreGeneralProductQuality(product: FoodProduct, reasonCodes: Set<ReasonCode>): number {
  let score = 82;

  if (product.nutrition.addedSugarGrams >= 10) {
    score -= 10;
    reasonCodes.add("NUTRI_ADDED_SUGAR_HIGH");
  } else if (product.nutrition.addedSugarGrams <= 4) {
    score += 4;
    reasonCodes.add("NUTRI_ADDED_SUGAR_LOW");
  }

  if (product.nutrition.proteinGrams >= 8) {
    score += 4;
    reasonCodes.add("NUTRI_PROTEIN_GOOD");
  }

  if (product.nutrition.fiberGrams >= 6) {
    score += 7;
    reasonCodes.add("NUTRI_FIBER_GOOD");
  }

  if (product.nutrition.sodiumMilligrams > 700) {
    score -= 14;
    reasonCodes.add("NUTRI_SODIUM_HIGH");
  } else if (product.nutrition.sodiumMilligrams > 450) {
    score -= 7;
    reasonCodes.add("NUTRI_SODIUM_HIGH");
  }

  if (product.processingLevel === "minimal") {
    score += 5;
    reasonCodes.add("PROCESSING_MINIMAL");
  } else if (product.processingLevel === "high") {
    score -= 10;
    reasonCodes.add("PROCESSING_HIGH");
  }

  for (const flag of allIngredientFlags(product)) {
    switch (flag) {
      case "synthetic_dye":
        score -= 8;
        reasonCodes.add("ING_SYNTHETIC_DYE");
        break;
      case "artificial_sweetener":
        score -= 6;
        reasonCodes.add("ING_ARTIFICIAL_SWEETENER");
        break;
      case "preservative":
        score -= 4;
        reasonCodes.add("ING_PRESERVATIVE");
        break;
      case "ultra_processed_marker":
        score -= 8;
        reasonCodes.add("ING_ULTRA_PROCESSED_MARKER");
        break;
      case "added_sugar":
      case "contains_dairy":
      case "contains_gluten":
        break;
    }
  }

  return clampScore(score);
}

function personalizationAdjustment(
  product: FoodProduct,
  profile: PersonalizationProfile,
  reasonCodes: Set<ReasonCode>
): { adjustment: number; safetyLevel: SafetyLevel } {
  let adjustment = 0;
  let safetyLevel: SafetyLevel = "ok";
  const preferences = new Set(profile.preferences);
  const flags = allIngredientFlags(product);

  if (preferences.has("low_sugar")) {
    if (product.nutrition.addedSugarGrams >= 8) {
      adjustment -= 18;
      reasonCodes.add("PREF_LOW_SUGAR_CONFLICT");
    } else {
      adjustment += 4;
    }
  }

  if (preferences.has("high_protein")) {
    if (product.nutrition.proteinGrams >= 8) {
      adjustment += 5;
      reasonCodes.add("PREF_HIGH_PROTEIN_MATCH");
    } else {
      adjustment -= 8;
      reasonCodes.add("PREF_HIGH_PROTEIN_GAP");
    }
  }

  if (preferences.has("avoid_synthetic_dyes") && flags.has("synthetic_dye")) {
    adjustment -= 20;
    reasonCodes.add("PREF_SYNTHETIC_DYE_CONFLICT");
  }

  if (preferences.has("avoid_artificial_sweeteners") && flags.has("artificial_sweetener")) {
    adjustment -= 25;
    reasonCodes.add("PREF_ARTIFICIAL_SWEETENER_CONFLICT");
  }

  if (preferences.has("avoid_preservatives") && flags.has("preservative")) {
    adjustment -= 12;
    reasonCodes.add("PREF_PRESERVATIVE_CONFLICT");
  }

  // Dietary restrictions are a stronger-than-preference signal: "caution", not a hard "avoid".
  if (preferences.has("dairy_free") && (product.allergens.includes("dairy") || flags.has("contains_dairy"))) {
    adjustment -= 55;
    reasonCodes.add("PREF_DAIRY_FREE_CONFLICT");
    safetyLevel = escalate(safetyLevel, "caution");
  }

  if (preferences.has("gluten_free") && (product.allergens.includes("wheat") || flags.has("contains_gluten"))) {
    adjustment -= 55;
    reasonCodes.add("PREF_GLUTEN_FREE_CONFLICT");
    safetyLevel = escalate(safetyLevel, "caution");
  }

  // A declared allergen is a hard safety signal: "avoid", which caps OptiFit upstream.
  for (const allergen of profile.allergens) {
    if (product.allergens.includes(allergen)) {
      adjustment -= 60;
      reasonCodes.add("PREF_ALLERGEN_CONFLICT");
      safetyLevel = escalate(safetyLevel, "avoid");
    }
  }

  for (const avoided of profile.avoidedIngredients) {
    const avoidedLower = avoided.toLowerCase();
    if (product.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(avoidedLower))) {
      adjustment -= 30;
      reasonCodes.add("PREF_AVOIDED_INGREDIENT");
    }
  }

  return { adjustment, safetyLevel };
}

function allIngredientFlags(product: FoodProduct): Set<IngredientFlag> {
  return new Set(product.ingredients.flatMap((ingredient) => ingredient.flags));
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
