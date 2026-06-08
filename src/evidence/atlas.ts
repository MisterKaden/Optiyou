import type {
  ConcernLevel,
  EffectDirection,
  EvidenceCard,
  EvidenceCitation,
  EvidenceDomain,
  EvidenceSourceType,
  EvidenceStatus,
  EvidenceTier,
  MagnitudeBand
} from "./types.ts";

// ATLAS — the evidence gatekeeper (see docs/nutrition-evidence-gatekeeper.md). This module holds the
// PURE, testable pieces: building the prompt and parsing/guarding the model's response into an
// Evidence Card. The actual Workers AI call is a thin integration point (runAtlasExtraction).

export interface AtlasSubject {
  ingredientCanonicalName: string;
  domain: EvidenceDomain;
}

export function buildAtlasPrompt(subject: AtlasSubject): { system: string; user: string } {
  const system = [
    "You are ATLAS, Optiyou's Nutrition/Cosmetic Evidence Gatekeeper.",
    "Reason from primary literature; embody evidence-first rigor (mechanism-aware, measurement-driven, anti-dogma AND anti-hype).",
    "HARD RULES:",
    "- NEVER fabricate a citation. If you cannot verify a source is real and says what you claim, mark it verified:false.",
    "- Tier A/B require verified human evidence (meta-analyses, RCTs, regulatory). Animal/in-vitro only is never above C.",
    "- A genuinely debated topic must set contested:true and may NOT carry a 'large' magnitude.",
    "- You recommend a scoring direction + magnitude BAND only; deterministic code owns the points. aiFinalJudge is false.",
    "- The villain is ultra-processing/added sugar/refined starch/sodium (food) and banned/CMR substances (cosmetic), not macros or scary-sounding names.",
    "Output ONLY a JSON object with keys: concern_level (beneficial|neutral|caution|avoid), evidence_tier (A|B|C|D),",
    "evidence_status (consensus|strong_contextual|emerging|contested|weak_mechanistic|regulatory_action),",
    "effect_direction (positive|negative|neutral), reason_code, magnitude_band (none|small|moderate|large),",
    "dose_context, contested (boolean), advisory, needs_human_verification (boolean),",
    "citations (array of {title, identifier, year, type, finding, verified})."
  ].join("\n");

  const user = `Draft an Evidence Card for the ${subject.domain} ingredient: "${subject.ingredientCanonicalName}".`;
  return { system, user };
}

const CONCERN_LEVELS = new Set<ConcernLevel>(["beneficial", "neutral", "caution", "avoid"]);
const TIERS = new Set<EvidenceTier>(["A", "B", "C", "D"]);
const STATUSES = new Set<EvidenceStatus>([
  "consensus", "strong_contextual", "emerging", "contested", "weak_mechanistic", "regulatory_action"
]);
const DIRECTIONS = new Set<EffectDirection>(["positive", "negative", "neutral"]);
const BANDS = new Set<MagnitudeBand>(["none", "small", "moderate", "large"]);
const SOURCE_TYPES = new Set<EvidenceSourceType>([
  "meta_analysis", "rct", "cohort", "mechanistic", "animal", "invitro", "regulatory", "review"
]);

// Parse the model's raw text into a guarded Evidence Card. Returns null if no JSON can be recovered.
// Applies the guardrails deterministically so a hallucinating model can't sneak a high-tier,
// score-moving card through: unverifiable -> needs_human_verification + tier capped at C; contested
// can't be 'large'. Always returns reviewStatus "draft" (auto-approval is decided separately).
export function parseAtlasResponse(raw: string, subject: AtlasSubject): EvidenceCard | null {
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    return null;
  }

  const citations = parseCitations(parsed.citations);
  const hasVerifiedCitation = citations.some((citation) => citation.verified);

  let evidenceTier = pick(parsed.evidence_tier, TIERS, "C");
  const preclinicalOnly = citations.length > 0 && citations.every((c) => c.type === "animal" || c.type === "invitro");

  // No-fabricated-citations + preclinical guardrails.
  let needsHumanVerification = asBoolean(parsed.needs_human_verification, true) || !hasVerifiedCitation;
  if ((evidenceTier === "A" || evidenceTier === "B") && (needsHumanVerification || preclinicalOnly)) {
    evidenceTier = "C";
  }

  const contested = asBoolean(parsed.contested, false) || parsed.evidence_status === "contested";
  let magnitudeBand = pick(parsed.magnitude_band, BANDS, "none");
  if (contested && magnitudeBand === "large") {
    magnitudeBand = "moderate";
  }

  const evidenceStatus = STATUSES.has(parsed.evidence_status as EvidenceStatus)
    ? (parsed.evidence_status as EvidenceStatus)
    : deriveStatus(evidenceTier, contested);

  return {
    ingredientCanonicalName: asString(parsed.canonical_name) ?? subject.ingredientCanonicalName,
    domain: subject.domain,
    concernLevel: pick(parsed.concern_level, CONCERN_LEVELS, "neutral"),
    evidenceTier,
    evidenceStatus,
    effectDirection: pick(parsed.effect_direction, DIRECTIONS, "neutral"),
    reasonCode: asString(parsed.reason_code),
    magnitudeBand,
    doseContext: asString(parsed.dose_context),
    contested,
    advisory: asString(parsed.advisory),
    citations,
    needsHumanVerification,
    reviewStatus: "draft",
    confidence: asNumber(parsed.confidence)
  };
}

// Thin Workers AI integration point. Runtime-dependent (env.AI), so it is intentionally tiny and is
// not exercised by unit tests — the testable logic lives in buildAtlasPrompt / parseAtlasResponse.
export async function runAtlasExtraction(
  env: Env,
  subject: AtlasSubject,
  model = "@cf/meta/llama-3.1-8b-instruct"
): Promise<EvidenceCard | null> {
  const ai = (env as unknown as { AI?: { run(model: string, input: unknown): Promise<{ response?: string }> } }).AI;
  if (!ai) {
    return null;
  }
  const { system, user } = buildAtlasPrompt(subject);
  const result = await ai.run(model, {
    messages: [{ role: "system", content: system }, { role: "user", content: user }]
  });
  return result.response ? parseAtlasResponse(result.response, subject) : null;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseCitations(value: unknown): EvidenceCitation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): EvidenceCitation[] => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const title = asString(record.title);
    if (!title) {
      return [];
    }
    return [{
      title,
      identifier: asString(record.identifier),
      year: asNumber(record.year),
      type: SOURCE_TYPES.has(record.type as EvidenceSourceType) ? (record.type as EvidenceSourceType) : "review",
      finding: asString(record.finding),
      verified: record.verified === true
    }];
  });
}

function deriveStatus(tier: EvidenceTier, contested: boolean): EvidenceStatus {
  if (contested) {
    return "contested";
  }
  if (tier === "A") {
    return "consensus";
  }
  if (tier === "B") {
    return "strong_contextual";
  }
  return "emerging";
}

function pick<T>(value: unknown, allowed: Set<T>, fallback: T): T {
  return allowed.has(value as T) ? (value as T) : fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
