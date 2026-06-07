import type { CosmeticCategory, CosmeticProduct, CosmeticUse } from "./types.ts";
import { COSMETIC_CONCERN_VERSION, parseInciList } from "./ingredient-concerns.ts";

// Bump when the OBF→Optiyou mapping changes output.
export const COSMETIC_NORMALIZATION_VERSION = "obf-v0.1.0" as const;

// Subset of the Open Beauty Facts product record we consume. OBF mirrors Open Food Facts' shape.
export interface OpenBeautyFactsProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  ingredients_text?: string;
  categories_tags?: string[];
  last_modified_t?: number;
}

export interface NormalizedCosmetic {
  product: CosmeticProduct;
  primarySource: "off";        // Open Beauty Facts is ODbL — isolate like Open Food Facts.
  sourceRef: string;
  observedAt: string;
  sourcePublishedAt?: string;
  normalizationVersion: string;
  concernVersion: string;
  rawIngredients: string;
}

export interface NormalizeCosmeticOptions {
  observedAt?: string;
}

export function normalizeOpenBeautyProduct(
  raw: OpenBeautyFactsProduct,
  options: NormalizeCosmeticOptions = {}
): NormalizedCosmetic | null {
  const gtin = sanitizeGtin(raw.code);
  if (!gtin) {
    return null;
  }

  const productId = `obf_${gtin}`;
  const versionId = `${productId}_v1`;
  const name = cleanText(raw.product_name) || "Unknown product";
  const brand = firstBrand(raw.brands) || "Unknown brand";
  const rawIngredients = raw.ingredients_text ?? "";
  const parsed = parseInciList(rawIngredients);
  const tags = raw.categories_tags ?? [];

  const hasIngredients = parsed.ingredients.length > 0;
  const conflictFlags: string[] = [];
  let confidence = 0.72;
  if (!hasIngredients) {
    confidence = 0.4;
    conflictFlags.push("no_ingredient_list");
  }
  if (!raw.product_name) {
    confidence = Math.min(confidence, 0.45);
  }

  const observedAt = options.observedAt ?? new Date().toISOString();
  const sourcePublishedAt = raw.last_modified_t ? new Date(raw.last_modified_t * 1000).toISOString() : undefined;

  const product: CosmeticProduct = {
    id: productId,
    gtin,
    market: "US_CA",
    vertical: "cosmetic",
    category: mapCategory(tags),
    use: inferUse(tags),
    name,
    brand,
    versionId,
    version: 1,
    dataQuality: {
      source: "open_product_database",
      observedAt,
      sourcePublishedAt,
      confidence: clamp(confidence, 0.3, 0.8),
      verificationStatus: "unverified",
      lastSeenAt: observedAt,
      userContributionCount: 0,
      brandConfirmation: "none",
      conflictFlags
    },
    ingredients: parsed.ingredients,
    hasUndisclosedFragrance: parsed.hasUndisclosedFragrance
  };

  return {
    product,
    primarySource: "off",
    sourceRef: `obf:${gtin}`,
    observedAt,
    sourcePublishedAt,
    normalizationVersion: COSMETIC_NORMALIZATION_VERSION,
    concernVersion: COSMETIC_CONCERN_VERSION,
    rawIngredients
  };
}

function sanitizeGtin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function firstBrand(value: string | undefined): string {
  return cleanText((value ?? "").split(",")[0]);
}

function mapCategory(tags: string[]): CosmeticCategory {
  const joined = tags.join(" ").toLowerCase();
  if (/(shampoo|conditioner|hair)/.test(joined)) {
    return "haircare";
  }
  if (/(sunscreen|sun-care|suncare|spf)/.test(joined)) {
    return "suncare";
  }
  if (/(makeup|foundation|lipstick|mascara|make-up)/.test(joined)) {
    return "makeup";
  }
  if (/(deodorant|antiperspirant)/.test(joined)) {
    return "deodorant";
  }
  if (/(moisturizer|cream|serum|lotion|cleanser|skin|face|toner)/.test(joined)) {
    return "skincare";
  }
  return "unknown";
}

function inferUse(tags: string[]): CosmeticUse {
  const joined = tags.join(" ").toLowerCase();
  if (/(shampoo|conditioner|cleanser|wash|scrub|mask|soap)/.test(joined)) {
    return "rinse_off";
  }
  if (/(cream|serum|lotion|moisturizer|sunscreen|toner|deodorant|foundation|balm)/.test(joined)) {
    return "leave_on";
  }
  return "unknown";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
