import type { CosmeticConcernType, CosmeticIngredient } from "./types.ts";

// Bump when the concern tables or parsing change output.
export const COSMETIC_CONCERN_VERSION = "cosmetic-concerns-v0.1.0" as const;

const MAX_INGREDIENTS = 80;
const MAX_NAME_LENGTH = 120;

// v0 keyword seed grounded in the research brief. This is intentionally conservative and will be
// replaced by ATLAS + CosIng / regulatory-list classifications (evidence-tiered, dose-aware).
// Guiding calibration: banned = hard cap; parabens = low concern (small penalty); sulfates = irritant
// (not toxicant); chemical UV filters = contested; fragrance = sensitization, not systemic toxicity.
const CONCERN_KEYWORDS: Record<CosmeticConcernType, string[]> = {
  banned: [
    "mercury", "lead acetate", "methylene chloride", "chloroform", "vinyl chloride",
    "bithionol", "chlorofluorocarbon", "hexachlorophene"
  ],
  restricted_use: [
    "hydroquinone", "salicylic acid", "retinol", "retinoic acid", "selenium sulfide",
    "aluminum chlorohydrate", "thioglycolate"
  ],
  // "dioxane" (not "1,4-dioxane") because INCI tokens are comma-split before matching, so a literal
  // comma in a keyword can never match.
  cmr: ["coal tar", "toluene", "benzene", "formaldehyde", "dioxane"],
  formaldehyde_releaser: [
    "dmdm hydantoin", "diazolidinyl urea", "imidazolidinyl urea", "quaternium-15",
    "sodium hydroxymethylglycinate", "bronopol", "2-bromo-2-nitropropane"
  ],
  // Mostly contested / data-gap; weighted lightly and labeled, not alarmist.
  endocrine_suspected: [
    "butylparaben", "propylparaben", "isobutylparaben", "isopropylparaben",
    "oxybenzone", "octinoxate", "triclosan", "triclocarban", "resorcinol", "bha"
  ],
  // Subset of the EU declarable fragrance allergens (24→80).
  fragrance_allergen: [
    "limonene", "linalool", "citronellol", "geraniol", "eugenol", "isoeugenol",
    "coumarin", "cinnamal", "citral", "farnesol", "benzyl alcohol", "benzyl salicylate",
    "hexyl cinnamal", "hydroxycitronellal", "amyl cinnamal", "benzyl benzoate"
  ],
  irritant: [
    "sodium lauryl sulfate", "ammonium lauryl sulfate", "alcohol denat", "sd alcohol",
    "menthol", "sodium hydroxide", "potassium hydroxide"
  ],
  // Human-health-safe but environmentally persistent (EU-restricted for that reason).
  environmental: ["cyclopentasiloxane", "cyclotetrasiloxane", "cyclohexasiloxane"],
  // Genuinely debated in the literature — label, do not assert harm.
  contested: ["oxybenzone", "octinoxate"]
};

function matchKeyword(text: string, keyword: string): boolean {
  if (/^[a-z0-9 ]+$/.test(keyword)) {
    return new RegExp(`\\b${keyword.replace(/ /g, "\\s+")}\\b`).test(text);
  }
  return text.includes(keyword);
}

export function concernsForIngredient(inci: string): CosmeticConcernType[] {
  const text = inci.toLowerCase();
  const concerns = new Set<CosmeticConcernType>();
  for (const [concern, keywords] of Object.entries(CONCERN_KEYWORDS) as Array<[CosmeticConcernType, string[]]>) {
    if (keywords.some((keyword) => matchKeyword(text, keyword))) {
      concerns.add(concern);
    }
  }
  // Generic "parabens" mention without a specific long-chain name → treat as suspected, lightly.
  if (/\bparaben\b/.test(text) && !concerns.has("endocrine_suspected")) {
    concerns.add("endocrine_suspected");
  }
  return [...concerns];
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

export interface ParsedInciList {
  ingredients: CosmeticIngredient[];
  hasUndisclosedFragrance: boolean;
}

export function parseInciList(raw: string): ParsedInciList {
  if (!raw) {
    return { ingredients: [], hasUndisclosedFragrance: false };
  }

  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/^ingredients?:?\s*/i, "");

  const ingredients: CosmeticIngredient[] = [];
  let hasUndisclosedFragrance = false;

  for (const token of splitTopLevel(s)) {
    const inci = token.trim().replace(/\.$/, "").slice(0, MAX_NAME_LENGTH);
    if (inci.length < 2) {
      continue;
    }
    const normalizedName = inci.toLowerCase();
    if (/\b(fragrance|parfum)\b/.test(normalizedName)) {
      hasUndisclosedFragrance = true;
    }
    ingredients.push({
      position: ingredients.length + 1,
      inci,
      normalizedName,
      concerns: concernsForIngredient(inci)
    });
    if (ingredients.length >= MAX_INGREDIENTS) {
      break;
    }
  }

  return { ingredients, hasUndisclosedFragrance };
}
