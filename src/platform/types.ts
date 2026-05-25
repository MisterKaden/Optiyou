export type Market = "US_CA";

export type ProductCategory =
  | "unknown"
  | "cereal"
  | "yogurt"
  | "snack_bar"
  | "beverage"
  | "prepared_meal"
  | "sauce";

export type ProductDataSource =
  | "verified_label"
  | "brand_portal"
  | "open_product_database"
  | "community_contribution"
  | "ai_extraction";

export type VerificationStatus = "verified" | "needs_review" | "unverified" | "conflicted";
export type BrandConfirmation = "none" | "claimed" | "confirmed" | "disputed";

export interface DataQuality {
  source: ProductDataSource;
  observedAt: string;
  confidence: number;
  verificationStatus: VerificationStatus;
  lastSeenAt: string;
  userContributionCount: number;
  brandConfirmation: BrandConfirmation;
  conflictFlags: string[];
}

export interface NutritionFacts {
  calories: number;
  addedSugarGrams: number;
  proteinGrams: number;
  fiberGrams: number;
  sodiumMilligrams: number;
}

export type IngredientFlag =
  | "added_sugar"
  | "artificial_sweetener"
  | "synthetic_dye"
  | "preservative"
  | "ultra_processed_marker"
  | "contains_dairy"
  | "contains_gluten";

export interface Ingredient {
  position: number;
  name: string;
  flags: IngredientFlag[];
}

export type Allergen =
  | "dairy"
  | "gluten"
  | "peanut"
  | "tree_nut"
  | "soy"
  | "egg"
  | "fish"
  | "shellfish"
  | "sesame";

export type ProcessingLevel = "minimal" | "moderate" | "high";

export interface FoodProduct {
  id: string;
  gtin: string;
  market: Market;
  category: ProductCategory;
  name: string;
  brand: string;
  versionId: string;
  version: number;
  dataQuality: DataQuality;
  nutrition: NutritionFacts;
  ingredients: Ingredient[];
  allergens: Allergen[];
  processingLevel: ProcessingLevel;
  imageUrl?: string;
}

export type Preference =
  | "low_sugar"
  | "high_protein"
  | "vegetarian"
  | "vegan"
  | "gluten_free"
  | "dairy_free"
  | "avoid_artificial_sweeteners"
  | "avoid_synthetic_dyes"
  | "avoid_preservatives"
  | "kids_mode"
  | "budget_sensitive";

export interface PersonalizationProfile {
  id: string;
  preferences: Preference[];
  allergens: Allergen[];
  avoidedIngredients: string[];
}

export type ReasonCode =
  | "NUTRI_ADDED_SUGAR_HIGH"
  | "NUTRI_ADDED_SUGAR_LOW"
  | "NUTRI_FIBER_GOOD"
  | "NUTRI_PROTEIN_GOOD"
  | "NUTRI_SODIUM_HIGH"
  | "ING_SYNTHETIC_DYE"
  | "ING_ARTIFICIAL_SWEETENER"
  | "ING_PRESERVATIVE"
  | "ING_ULTRA_PROCESSED_MARKER"
  | "PROCESSING_HIGH"
  | "PROCESSING_MINIMAL"
  | "PREF_LOW_SUGAR_CONFLICT"
  | "PREF_HIGH_PROTEIN_MATCH"
  | "PREF_HIGH_PROTEIN_GAP"
  | "PREF_SYNTHETIC_DYE_CONFLICT"
  | "PREF_ARTIFICIAL_SWEETENER_CONFLICT"
  | "PREF_PRESERVATIVE_CONFLICT"
  | "PREF_ALLERGEN_CONFLICT"
  | "PREF_DAIRY_FREE_CONFLICT"
  | "PREF_GLUTEN_FREE_CONFLICT";

export interface ScoreComponents {
  optiScore: number;
  optiFit: number;
  nutritionScore: number;
  ingredientScore: number;
  processingScore: number;
  confidenceScore: number;
}

export interface ScoreResult {
  methodologyVersion: "food-us-ca-v1";
  aiFinalJudge: false;
  scoreComponents: ScoreComponents;
  reasonCodes: ReasonCode[];
}

export interface ExplanationClaimMap {
  claim: string;
  source: "product_field" | "score_reason" | "methodology" | "approved_evidence";
  ref: string;
}

export interface ProductExplanation {
  summary: string;
  claimMap: ExplanationClaimMap[];
}

export interface ProductCard {
  status: "known" | "estimated";
  product: {
    id: string;
    gtin: string;
    name: string;
    brand: string;
    category: ProductCategory;
    versionId: string;
    imageUrl?: string;
  };
  scores: ScoreComponents;
  confidence: {
    value: number;
    label: "High confidence" | "Good confidence" | "Low confidence";
    verificationStatus: VerificationStatus;
    source: ProductDataSource;
    fieldLevelRequired: true;
  };
  reasonCodes: ReasonCode[];
  explanation: ProductExplanation & { aiFinalJudge: false };
  alternatives: ProductAlternative[];
  methodology: {
    version: "food-us-ca-v1";
    scope: "U.S./Canada packaged food";
    medicalDisclaimer: string;
  };
}

export interface ProductAlternative {
  gtin: string;
  name: string;
  brand: string;
  optiFit: number;
  whyBetter: string[];
  paidPlacement: false;
}

export interface ContributionIntent {
  status: "missing_product";
  product: {
    id: string;
    gtin: string;
    market: Market;
    verificationStatus: "unverified";
  };
  contribution: {
    id: string;
    profileId: string;
    status: "awaiting_uploads";
  };
  uploads: ContributionUploadIntent[];
  queueMessage: IngestionQueueMessage;
}

export type UploadKind = "front_package" | "nutrition_label" | "ingredients_label";

export interface ContributionUploadIntent {
  kind: UploadKind;
  objectKey: string;
  url: string;
  expiresAt: string;
}

export interface IngestionQueueMessage {
  type: "ingest_missing_product";
  productId: string;
  contributionId: string;
  gtin: string;
  market: Market;
  uploadKeys: Record<UploadKind, string>;
}

export interface ScanRequestBody {
  gtin: string;
  profileId?: string;
  profile?: PersonalizationProfile;
}
