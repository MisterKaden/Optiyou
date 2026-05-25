import type {
  FoodProduct,
  IngredientFlag,
  PersonalizationProfile,
  ProcessingLevel,
  ReasonCode,
  ScoreResult
} from "../platform/types.ts";

export const FOOD_METHODOLOGY_VERSION = "food-us-ca-v1" as const;

export function scoreFoodProduct(product: FoodProduct, profile: PersonalizationProfile): ScoreResult {
  const reasonCodes = new Set<ReasonCode>();
  const nutritionScore = scoreNutrition(product, reasonCodes);
  const ingredientScore = scoreIngredients(product, reasonCodes);
  const processingScore = scoreProcessing(product.processingLevel, reasonCodes);
  const confidenceScore = clampScore(Math.round(product.dataQuality.confidence * 100));
  const optiScore = scoreGeneralProductQuality(product, reasonCodes);
  const optiFit = clampScore(optiScore + personalizationAdjustment(product, profile, reasonCodes));

  return {
    methodologyVersion: FOOD_METHODOLOGY_VERSION,
    aiFinalJudge: false,
    scoreComponents: {
      optiScore,
      optiFit,
      nutritionScore,
      ingredientScore,
      processingScore,
      confidenceScore
    },
    reasonCodes: [...reasonCodes]
  };
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
): number {
  let adjustment = 0;
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

  if (preferences.has("dairy_free") && (product.allergens.includes("dairy") || flags.has("contains_dairy"))) {
    adjustment -= 55;
    reasonCodes.add("PREF_DAIRY_FREE_CONFLICT");
  }

  if (preferences.has("gluten_free") && (product.allergens.includes("gluten") || flags.has("contains_gluten"))) {
    adjustment -= 55;
    reasonCodes.add("PREF_GLUTEN_FREE_CONFLICT");
  }

  for (const allergen of profile.allergens) {
    if (product.allergens.includes(allergen)) {
      adjustment -= 60;
      reasonCodes.add("PREF_ALLERGEN_CONFLICT");
    }
  }

  for (const avoided of profile.avoidedIngredients) {
    const avoidedLower = avoided.toLowerCase();
    if (product.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(avoidedLower))) {
      adjustment -= 30;
    }
  }

  return adjustment;
}

function allIngredientFlags(product: FoodProduct): Set<IngredientFlag> {
  return new Set(product.ingredients.flatMap((ingredient) => ingredient.flags));
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
