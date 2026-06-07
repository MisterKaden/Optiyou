import type {
  FoodProduct,
  Ingredient,
  IngredientFlag,
  NutritionFacts,
  ProcessingLevel,
  ProductCategory
} from "../platform/types.ts";
import { INGREDIENT_FLAG_VERSION, allergensFromIngredients, parseIngredientString } from "./ingredient-flags.ts";

// Bump when normalization mapping changes output, so persisted products/scores are traceable.
export const NORMALIZATION_VERSION = "usda-v0.1.0" as const;

// Subset of the USDA FoodData Central "Branded Foods" record shape that we consume.
export interface UsdaLabelNutrient {
  value?: number;
}

export interface UsdaFoodNutrient {
  nutrient?: { name?: string; unitName?: string };
  nutrientName?: string;
  unitName?: string;
  amount?: number;
  value?: number;
}

export interface UsdaBrandedFood {
  fdcId?: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  ingredients?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  brandedFoodCategory?: string;
  marketCountry?: string;
  publicationDate?: string;
  labelNutrients?: Record<string, UsdaLabelNutrient | undefined>;
  foodNutrients?: UsdaFoodNutrient[];
}

export interface NormalizedProduct {
  product: FoodProduct;
  primarySource: "usda";
  sourceRef: string;
  observedAt: string;          // when Optiyou ingested this record
  sourcePublishedAt?: string;  // when USDA published/updated the record
  normalizationVersion: string;
  ingredientFlagVersion: string;
  rawIngredients: string;
}

export interface NormalizeOptions {
  // When Optiyou observed/ingested the record. Defaults to now; pass explicitly for deterministic runs.
  observedAt?: string;
}

export function normalizeUsdaFood(
  raw: UsdaBrandedFood,
  options: NormalizeOptions = {}
): NormalizedProduct | null {
  const gtin = sanitizeGtin(raw.gtinUpc);
  if (!gtin) {
    return null;
  }

  const productId = `usda_${gtin}`;
  const versionId = `${productId}_v1`;
  const name = cleanText(raw.description) || "Unknown product";
  const brand = cleanText(raw.brandName) || cleanText(raw.brandOwner) || "Unknown brand";
  const rawIngredients = raw.ingredients ?? "";
  const parsed = parseIngredientString(rawIngredients);
  const ingredients: Ingredient[] = parsed.ingredients.map((item) => ({
    position: item.position,
    name: item.displayName,
    flags: item.flags
  }));
  const flagSet = new Set<IngredientFlag>(ingredients.flatMap((item) => item.flags));
  const allergens = allergensFromIngredients(parsed.containsStatement, flagSet);
  const { nutrition, confidence, conflictFlags } = mapNutrition(raw);
  const sourcePublishedAt = parseUsdaDate(raw.publicationDate) ?? undefined;
  const observedAt = options.observedAt ?? new Date().toISOString();

  const product: FoodProduct = {
    id: productId,
    gtin,
    market: "US_CA",
    category: mapCategory(raw.brandedFoodCategory),
    name,
    brand,
    versionId,
    version: 1,
    dataQuality: {
      source: "open_product_database",
      observedAt,
      sourcePublishedAt,
      confidence,
      verificationStatus: "unverified",
      lastSeenAt: observedAt,
      userContributionCount: 0,
      brandConfirmation: "none",
      conflictFlags
    },
    nutrition,
    ingredients,
    allergens,
    processingLevel: deriveProcessingLevel(flagSet, ingredients.length)
  };

  return {
    product,
    primarySource: "usda",
    sourceRef: `usda-fdc:${raw.fdcId ?? gtin}`,
    observedAt,
    sourcePublishedAt,
    normalizationVersion: NORMALIZATION_VERSION,
    ingredientFlagVersion: INGREDIENT_FLAG_VERSION,
    rawIngredients
  };
}

function sanitizeGtin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) {
    return null;
  }
  return digits;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function mapCategory(value: string | undefined): ProductCategory {
  const c = (value ?? "").toLowerCase();
  if (!c) {
    return "unknown";
  }
  if (/(cereal|granola|oatmeal)/.test(c)) {
    return "cereal";
  }
  if (/(yogurt|yoghurt)/.test(c)) {
    return "yogurt";
  }
  if (/(snack|bar|chip|cracker|cookie|popcorn|pretzel)/.test(c)) {
    return "snack_bar";
  }
  if (/(beverage|drink|soda|juice|water|tea|coffee)/.test(c)) {
    return "beverage";
  }
  if (/(meal|entree|entrée|pizza|frozen dinner|prepared)/.test(c)) {
    return "prepared_meal";
  }
  if (/(sauce|dressing|condiment|ketchup|salsa|mayonnaise|gravy)/.test(c)) {
    return "sauce";
  }
  return "unknown";
}

interface NutritionMapping {
  nutrition: NutritionFacts;
  confidence: number;
  conflictFlags: string[];
}

function mapNutrition(raw: UsdaBrandedFood): NutritionMapping {
  const conflictFlags: string[] = [];
  const label = raw.labelNutrients ?? {};
  const value = (entry: UsdaLabelNutrient | undefined): number | undefined =>
    typeof entry?.value === "number" && Number.isFinite(entry.value) ? entry.value : undefined;

  let calories = value(label.calories);
  let protein = value(label.protein);
  let fiber = value(label.fiber);
  let totalSugar = value(label.sugars);
  let addedSugar = value(label.addedSugars);
  let sodium = value(label.sodium);

  let confidence = 0.8;
  let usedFallback = false;

  if (calories === undefined && protein === undefined && sodium === undefined) {
    const scaled = fromFoodNutrients(raw);
    if (scaled) {
      calories ??= scaled.calories;
      protein ??= scaled.protein;
      fiber ??= scaled.fiber;
      totalSugar ??= scaled.totalSugar;
      addedSugar ??= scaled.addedSugar;
      sodium ??= scaled.sodium;
      usedFallback = true;
    }
  }

  if (addedSugar === undefined && totalSugar !== undefined) {
    addedSugar = totalSugar;
    conflictFlags.push("added_sugar_estimated_from_total");
    confidence -= 0.1;
  }

  const complete = [calories, protein, fiber, sodium].every((entry) => entry !== undefined);
  if (!complete) {
    conflictFlags.push("incomplete_nutrition");
    confidence = Math.min(confidence, 0.45);
  }
  if (usedFallback) {
    confidence = Math.min(confidence, 0.7);
  }

  return {
    nutrition: {
      calories: round(calories ?? 0),
      addedSugarGrams: round(addedSugar ?? 0),
      proteinGrams: round(protein ?? 0),
      fiberGrams: round(fiber ?? 0),
      sodiumMilligrams: round(sodium ?? 0)
    },
    confidence: clamp(confidence, 0.3, 0.85),
    conflictFlags
  };
}

interface ScaledNutrients {
  calories?: number;
  protein?: number;
  fiber?: number;
  totalSugar?: number;
  addedSugar?: number;
  sodium?: number;
}

function fromFoodNutrients(raw: UsdaBrandedFood): ScaledNutrients | null {
  const list = raw.foodNutrients;
  if (!list || list.length === 0) {
    return null;
  }
  const unit = raw.servingSizeUnit ?? "";
  if (!/^(g|ml)$/i.test(unit) || typeof raw.servingSize !== "number") {
    return null;
  }
  const factor = raw.servingSize / 100;
  const lookup = (names: string[]): number | undefined => {
    for (const entry of list) {
      const name = (entry.nutrient?.name ?? entry.nutrientName ?? "").toLowerCase();
      const amount = typeof entry.amount === "number" ? entry.amount
        : typeof entry.value === "number" ? entry.value
        : undefined;
      if (amount !== undefined && names.some((candidate) => name.includes(candidate))) {
        return amount;
      }
    }
    return undefined;
  };
  const scale = (entry: number | undefined): number | undefined =>
    entry === undefined ? undefined : entry * factor;

  return {
    calories: scale(lookup(["energy"])),
    protein: scale(lookup(["protein"])),
    fiber: scale(lookup(["fiber"])),
    totalSugar: scale(lookup(["sugars, total", "total sugars", "sugars"])),
    addedSugar: scale(lookup(["added sugars", "sugars, added"])),
    sodium: scale(lookup(["sodium"]))
  };
}

function deriveProcessingLevel(flags: Set<IngredientFlag>, ingredientCount: number): ProcessingLevel {
  if (flags.has("ultra_processed_marker") || flags.has("synthetic_dye") || flags.has("artificial_sweetener")) {
    return "high";
  }
  if (flags.has("preservative") || ingredientCount > 10) {
    return "moderate";
  }
  return ingredientCount <= 5 ? "minimal" : "moderate";
}

function parseUsdaDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  return `${match[3]}-${month}-${day}T00:00:00.000Z`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
