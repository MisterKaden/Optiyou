import { isScoreEligible, scoringDirectiveFromCard } from "./evidence-card.ts";
import type { EvidenceCard, EvidenceDomain, ScoringDirective } from "./types.ts";

// The read path from the Ingredient Intelligence graph into scoring. At ingest time the pipeline
// loads approved Evidence Cards into an index; the scorer then applies evidence-graded directives
// (and advisories) for the product's actual ingredients — gradually replacing the v0 keyword seeds.

export type KnowledgeIndex = Map<string, EvidenceCard>;

function key(name: string, domain: EvidenceDomain): string {
  return `${domain}:${name.trim().toLowerCase()}`;
}

// Build an index keyed by (domain, canonical name). When several cards exist for one ingredient,
// prefer a score-eligible card; otherwise keep the first (advisory-only) card.
export function buildKnowledgeIndex(cards: EvidenceCard[]): KnowledgeIndex {
  const index: KnowledgeIndex = new Map();
  for (const card of cards) {
    const k = key(card.ingredientCanonicalName, card.domain);
    const existing = index.get(k);
    if (!existing || (!isScoreEligible(existing) && isScoreEligible(card))) {
      index.set(k, card);
    }
  }
  return index;
}

export interface AppliedEvidence {
  directives: ScoringDirective[];
  advisories: string[];
  matchedIngredients: string[];
}

// Resolve directives + advisories for a product's ingredient names against the graph. Names are
// matched case-insensitively; an ingredient with no card simply contributes nothing (the v0 keyword
// flagger still handles it until the graph is fully populated).
export function applyEvidence(
  normalizedNames: string[],
  index: KnowledgeIndex,
  domain: EvidenceDomain
): AppliedEvidence {
  const directives: ScoringDirective[] = [];
  const advisories: string[] = [];
  const matchedIngredients: string[] = [];
  const seenAdvisories = new Set<string>();

  for (const name of normalizedNames) {
    const card = index.get(key(name, domain));
    if (!card) {
      continue;
    }
    matchedIngredients.push(name.toLowerCase());
    const directive = scoringDirectiveFromCard(card);
    if (directive.points !== 0) {
      directives.push(directive);
    }
    if (directive.advisory && !seenAdvisories.has(directive.advisory)) {
      seenAdvisories.add(directive.advisory);
      advisories.push(directive.advisory);
    }
  }

  return { directives, advisories, matchedIngredients };
}

// Net point delta from all score-moving directives (sign already applied).
export function netPoints(applied: AppliedEvidence): number {
  return applied.directives.reduce((sum, directive) => sum + directive.points, 0);
}
