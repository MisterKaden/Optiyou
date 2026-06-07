import { scoreCosmeticProduct } from "./scoring.ts";
import type {
  CosmeticAlternative,
  CosmeticProduct,
  CosmeticProductCard,
  CosmeticProfile
} from "./types.ts";

interface BuildCosmeticCardInput {
  product: CosmeticProduct;
  profile: CosmeticProfile;
  alternatives?: CosmeticProduct[];
  status?: "known" | "estimated";
}

const DISCLAIMER = "Optiyou is cosmetic-label education and comparison, not medical or dermatological advice.";

export function buildCosmeticCard(input: BuildCosmeticCardInput): CosmeticProductCard {
  const score = scoreCosmeticProduct(input.product, input.profile);
  // Universal + personalization reasons are combined for the consumer card view.
  const reasonCodes = [...score.reasonCodes, ...score.personalizationReasonCodes];

  return {
    status: input.status ?? "known",
    vertical: "cosmetic",
    product: input.product,
    scores: score.scoreComponents,
    safetyLevel: score.safetyLevel,
    gradeBand: score.gradeBand,
    confidence: {
      value: score.scoreComponents.confidenceScore,
      label: confidenceLabel(score.scoreComponents.confidenceScore),
      verificationStatus: input.product.dataQuality.verificationStatus,
      source: input.product.dataQuality.source
    },
    reasonCodes,
    advisories: score.advisories,
    alternatives: (input.alternatives ?? []).map((alternative) =>
      buildAlternative(input.product, alternative, input.profile)
    ),
    methodology: {
      version: score.methodologyVersion,
      scope: "U.S./Canada cosmetics & personal care",
      disclaimer: DISCLAIMER
    }
  };
}

function buildAlternative(
  current: CosmeticProduct,
  alternative: CosmeticProduct,
  profile: CosmeticProfile
): CosmeticAlternative {
  const altScore = scoreCosmeticProduct(alternative, profile);
  return {
    gtin: alternative.gtin,
    name: alternative.name,
    brand: alternative.brand,
    optiFit: altScore.scoreComponents.optiFit,
    whyBetter: betterReasons(current, alternative),
    paidPlacement: false
  };
}

function betterReasons(current: CosmeticProduct, alternative: CosmeticProduct): string[] {
  const reasons: string[] = [];
  const currentConcerns = countConcerned(current);
  const altConcerns = countConcerned(alternative);

  if (altConcerns < currentConcerns) {
    reasons.push("Fewer flagged ingredients for a similar use.");
  }
  if (current.hasUndisclosedFragrance && !alternative.hasUndisclosedFragrance) {
    reasons.push("Fully discloses fragrance components.");
  }
  if (reasons.length === 0) {
    reasons.push("Higher personalized OptiFit for this category.");
  }
  return reasons;
}

function countConcerned(product: CosmeticProduct): number {
  return product.ingredients.filter((item) => item.concerns.length > 0).length;
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
