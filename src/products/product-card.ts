import { scoreFoodProduct } from "../scoring/food-scoring.ts";
import type {
  FoodProduct,
  PersonalizationProfile,
  ProductAlternative,
  ProductCard,
  ProductExplanation
} from "../platform/types.ts";

interface BuildProductCardInput {
  product: FoodProduct;
  profile: PersonalizationProfile;
  alternatives: FoodProduct[];
  explanation?: ProductExplanation;
  status?: "known" | "estimated";
}

export function buildProductCard(input: BuildProductCardInput): ProductCard {
  const score = scoreFoodProduct(input.product, input.profile);

  return {
    status: input.status ?? "known",
    product: input.product,
    scores: score.scoreComponents,
    confidence: {
      value: score.scoreComponents.confidenceScore,
      label: confidenceLabel(score.scoreComponents.confidenceScore),
      verificationStatus: input.product.dataQuality.verificationStatus,
      source: input.product.dataQuality.source,
      fieldLevelRequired: true
    },
    reasonCodes: score.reasonCodes,
    explanation: {
      summary: input.explanation?.summary ?? defaultExplanation(score.reasonCodes),
      claimMap: input.explanation?.claimMap ?? score.reasonCodes.map((reason) => ({
        claim: reasonToPlainEnglish(reason),
        source: "score_reason",
        ref: reason
      })),
      aiFinalJudge: false
    },
    alternatives: input.alternatives.map((alternative) =>
      buildAlternative(input.product, alternative, input.profile)
    ),
    methodology: {
      version: score.methodologyVersion,
      scope: "U.S./Canada packaged food",
      medicalDisclaimer: "Optiyou is product-label education and comparison, not medical advice."
    }
  };
}

function buildAlternative(
  current: FoodProduct,
  alternative: FoodProduct,
  profile: PersonalizationProfile
): ProductAlternative {
  const alternativeScore = scoreFoodProduct(alternative, profile);

  return {
    gtin: alternative.gtin,
    name: alternative.name,
    brand: alternative.brand,
    optiFit: alternativeScore.scoreComponents.optiFit,
    whyBetter: betterReasons(current, alternative),
    paidPlacement: false
  };
}

function betterReasons(current: FoodProduct, alternative: FoodProduct): string[] {
  const reasons: string[] = [];

  if (alternative.nutrition.addedSugarGrams < current.nutrition.addedSugarGrams) {
    reasons.push("Less added sugar in the same category.");
  }

  if (alternative.nutrition.fiberGrams > current.nutrition.fiberGrams) {
    reasons.push("Higher fiber for a similar use.");
  }

  if (alternative.nutrition.proteinGrams > current.nutrition.proteinGrams) {
    reasons.push("Higher protein for your selected goals.");
  }

  if (reasons.length === 0) {
    reasons.push("Higher personalized OptiFit for this category.");
  }

  return reasons;
}

function confidenceLabel(score: number): "High confidence" | "Good confidence" | "Low confidence" {
  if (score >= 90) {
    return "High confidence";
  }

  if (score >= 70) {
    return "Good confidence";
  }

  return "Low confidence";
}

function defaultExplanation(reasonCodes: string[]): string {
  if (reasonCodes.includes("PREF_ALLERGEN_CONFLICT")) {
    return "Avoid for your profile until the allergen conflict is resolved.";
  }

  if (reasonCodes.includes("PREF_LOW_SUGAR_CONFLICT")) {
    return "Good information is available, but this is a poor fit for your low-sugar profile.";
  }

  if (reasonCodes.includes("NUTRI_ADDED_SUGAR_HIGH")) {
    return "This product has a notable added-sugar concern.";
  }

  return "This product has no major Optiyou concern in the current methodology.";
}

function reasonToPlainEnglish(reason: string): string {
  return reason.toLowerCase().replaceAll("_", " ");
}
