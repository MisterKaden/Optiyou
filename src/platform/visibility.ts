import type { FoodProduct } from "./types.ts";

// Regular users only ever see verified or sufficiently-confident products. Everything else stays
// admin-only until verified, so unverified / low-confidence data never reaches end users. USDA bulk
// imports land at ~0.8 confidence (visible); records with incomplete nutrition drop below the bar.
export const USER_VISIBILITY_MIN_CONFIDENCE = 0.7;

export function isUserVisible(product: FoodProduct): boolean {
  const { verificationStatus, confidence } = product.dataQuality;
  if (verificationStatus === "verified") {
    return true;
  }
  if (verificationStatus === "conflicted" || verificationStatus === "needs_review") {
    return false;
  }
  // "unverified": gate on confidence.
  return confidence >= USER_VISIBILITY_MIN_CONFIDENCE;
}

// Admins see the hidden layer by default; they can preview the regular-user view with
// ?includeUnverified=false. Non-admins are always gated regardless of the query param.
export function includeUnverified(isAdmin: boolean, url: URL): boolean {
  if (!isAdmin) {
    return false;
  }
  return url.searchParams.get("includeUnverified") !== "false";
}

export function visibilityLabel(product: FoodProduct): "public" | "admin_only" {
  return isUserVisible(product) ? "public" : "admin_only";
}
