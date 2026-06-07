import type { Allergen, IngredientFlag } from "../platform/types.ts";

// Bump when the keyword tables or parsing logic change output, so persisted flags are traceable.
export const INGREDIENT_FLAG_VERSION = "ingredients-v0.1.0" as const;

export interface ParsedIngredient {
  position: number;
  displayName: string;
  normalizedName: string;
  flags: IngredientFlag[];
}

export interface ParsedIngredientList {
  ingredients: ParsedIngredient[];
  containsStatement?: string;
}

const MAX_INGREDIENTS = 60;
const MAX_NAME_LENGTH = 120;

// v0 keyword heuristics. Deliberately simple and conservative; superseded later by the
// ATLAS-backed Ingredient Intelligence graph (Phase 3). This only seeds flags so the
// deterministic scorer has something to work with at import time.
const KEYWORDS: Record<IngredientFlag, string[]> = {
  synthetic_dye: [
    "red 40", "red 3", "red no. 3", "red no. 40", "red #40", "red #3",
    "yellow 5", "yellow 6", "yellow no. 5", "yellow no. 6", "yellow #5", "yellow #6",
    "blue 1", "blue 2", "blue #1", "blue #2", "green 3", "fd&c",
    "tartrazine", "allura red", "sunset yellow", "brilliant blue", "erythrosine"
  ],
  artificial_sweetener: [
    "aspartame", "sucralose", "acesulfame", "ace-k", "saccharin", "neotame", "advantame"
  ],
  preservative: [
    "sodium benzoate", "potassium sorbate", "calcium propionate", "sodium nitrite",
    "sodium nitrate", "potassium nitrate", "bha", "bht", "tbhq", "sodium metabisulfite",
    "propyl gallate", "edta", "sulfur dioxide"
  ],
  ultra_processed_marker: [
    "maltodextrin", "high fructose corn syrup", "hydrogenated", "interesterified",
    "mono- and diglycerides", "monoglyceride", "diglyceride", "protein isolate",
    "corn syrup solids", "natural flavor", "artificial flavor", "soy lecithin",
    "carrageenan", "polysorbate", "cellulose gum"
  ],
  added_sugar: [
    "sugar", "cane sugar", "brown sugar", "corn syrup", "high fructose corn syrup",
    "dextrose", "fructose", "glucose syrup", "maltose", "molasses", "honey", "agave",
    "invert sugar", "rice syrup", "brown rice syrup", "barley malt syrup", "tapioca syrup",
    "fruit juice concentrate", "date powder", "cane juice", "evaporated cane juice",
    "coconut sugar", "maple syrup", "sucrose"
  ],
  contains_dairy: [
    "milk", "whey", "casein", "caseinate", "lactose", "butter", "cream", "cheese",
    "ghee", "milkfat", "buttermilk", "yogurt"
  ],
  contains_gluten: [
    "wheat", "barley", "rye", "malt", "spelt", "semolina", "farro", "triticale",
    "graham", "durum"
  ]
};

// Big-9 allergens. Note: wheat is the allergen (FDA Big-9); gluten avoidance (which also covers
// barley/rye/malt) is handled as a *preference* via the contains_gluten ingredient flag, not here.
const ALLERGEN_KEYWORDS: Array<[Allergen, string[]]> = [
  ["dairy", ["milk", "dairy", "whey", "casein", "lactose", "cream", "butter", "cheese"]],
  ["wheat", ["wheat", "spelt", "semolina", "farro", "durum", "triticale"]],
  ["peanut", ["peanut"]],
  ["tree_nut", ["almond", "cashew", "walnut", "pecan", "hazelnut", "pistachio", "tree nut", "macadamia"]],
  ["soy", ["soy", "soya"]],
  ["egg", ["egg"]],
  ["fish", ["fish", "anchovy", "cod", "tuna", "salmon"]],
  ["shellfish", ["shellfish", "shrimp", "crab", "lobster", "prawn"]],
  ["sesame", ["sesame"]]
];

function matchKeyword(text: string, keyword: string): boolean {
  // Whole-word match for alphanumeric keywords (so "malt" does not match "maltodextrin");
  // substring match for keywords containing punctuation (e.g. "fd&c").
  if (/^[a-z0-9 ]+$/.test(keyword)) {
    return new RegExp(`\\b${keyword.replace(/ /g, "\\s+")}\\b`).test(text);
  }
  return text.includes(keyword);
}

export function flagsForIngredient(name: string): IngredientFlag[] {
  const text = name.toLowerCase();
  const flags = new Set<IngredientFlag>();
  for (const [flag, keywords] of Object.entries(KEYWORDS) as Array<[IngredientFlag, string[]]>) {
    if (keywords.some((keyword) => matchKeyword(text, keyword))) {
      flags.add(flag);
    }
  }
  if (text.includes("modified") && text.includes("starch")) {
    flags.add("ultra_processed_marker");
  }
  return [...flags];
}

function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(" || ch === "[") {
      depth++;
    } else if (ch === ")" || ch === "]") {
      depth = Math.max(0, depth - 1);
    }
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    out.push(current);
  }
  return out;
}

export function parseIngredientString(raw: string): ParsedIngredientList {
  if (!raw) {
    return { ingredients: [] };
  }

  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/^ingredients?:?\s*/i, "");

  // Extract a trailing allergen "CONTAINS ..." statement (the allergen form, which has no
  // digits, unlike "CONTAINS 2% OR LESS OF:").
  let containsStatement: string | undefined;
  const containsMatch = s.match(/contains:?\s+([a-z][a-z ,&]*?)\s*\.?\s*$/i);
  if (containsMatch && !/\d/.test(containsMatch[1])) {
    containsStatement = containsMatch[1].trim();
    s = s.slice(0, containsMatch.index).trim();
  }

  // Drop "2% or less of:" style prefixes but keep the ingredients that follow them.
  s = s.replace(/(?:less than|contains)?\s*\d+\s*%\s*or\s*less\s*(?:of)?:?/gi, " ");
  s = s.replace(/less than \d+\s*%\s*of:?/gi, " ");

  const ingredients: ParsedIngredient[] = [];
  for (const token of splitTopLevel(s)) {
    const display = token.trim().replace(/^[*•\-\s]+/, "").replace(/\.$/, "").trim().slice(0, MAX_NAME_LENGTH);
    if (display.length < 2 || /^(and|of|or|with)$/i.test(display)) {
      continue;
    }
    ingredients.push({
      position: ingredients.length + 1,
      displayName: display,
      normalizedName: display.toLowerCase(),
      flags: flagsForIngredient(display)
    });
    if (ingredients.length >= MAX_INGREDIENTS) {
      break;
    }
  }

  return { ingredients, containsStatement };
}

export function allergensFromIngredients(
  containsStatement: string | undefined,
  flags: Set<IngredientFlag>
): Allergen[] {
  const found = new Set<Allergen>();
  const text = (containsStatement ?? "").toLowerCase();
  for (const [allergen, keywords] of ALLERGEN_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      found.add(allergen);
    }
  }
  if (flags.has("contains_dairy")) {
    found.add("dairy");
  }
  // contains_gluten is NOT mapped to an allergen: gluten covers barley/rye/malt (not the wheat
  // allergen) and is a dietary preference, not a Big-9 allergen. Wheat is detected by keyword above.
  return [...found];
}
