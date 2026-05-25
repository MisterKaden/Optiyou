import Foundation

enum ProductCategory: String, CaseIterable, Hashable, Identifiable {
    case unknown
    case cereal
    case yogurt
    case snackBar
    case beverage
    case preparedMeal
    case sauce

    var id: String { rawValue }

    var title: String {
        switch self {
        case .unknown: "Unknown food"
        case .cereal: "Cereal"
        case .yogurt: "Yogurt"
        case .snackBar: "Snack bar"
        case .beverage: "Beverage"
        case .preparedMeal: "Prepared meal"
        case .sauce: "Sauce"
        }
    }
}

struct NutritionFacts: Hashable {
    var calories: Int
    var addedSugarGrams: Double
    var proteinGrams: Double
    var fiberGrams: Double
    var sodiumMilligrams: Int
}

struct Ingredient: Identifiable, Hashable {
    let id = UUID()
    var name: String
    var flags: Set<IngredientFlag>

    init(name: String, flags: Set<IngredientFlag> = []) {
        self.name = name
        self.flags = flags
    }
}

enum IngredientFlag: String, CaseIterable, Hashable, Identifiable {
    case addedSugar
    case artificialSweetener
    case syntheticDye
    case preservative
    case ultraProcessedMarker
    case containsDairy
    case containsGluten

    var id: String { rawValue }

    var title: String {
        switch self {
        case .addedSugar: "Added sugar"
        case .artificialSweetener: "Artificial sweetener"
        case .syntheticDye: "Synthetic dye"
        case .preservative: "Preservative"
        case .ultraProcessedMarker: "Processing marker"
        case .containsDairy: "Dairy"
        case .containsGluten: "Gluten"
        }
    }
}

enum Allergen: String, CaseIterable, Hashable, Identifiable {
    case dairy
    case gluten
    case peanut
    case treeNut
    case soy
    case egg
    case fish
    case shellfish
    case sesame

    var id: String { rawValue }

    var title: String {
        switch self {
        case .dairy: "Dairy"
        case .gluten: "Gluten"
        case .peanut: "Peanut"
        case .treeNut: "Tree nut"
        case .soy: "Soy"
        case .egg: "Egg"
        case .fish: "Fish"
        case .shellfish: "Shellfish"
        case .sesame: "Sesame"
        }
    }
}

enum UserPreference: String, CaseIterable, Hashable, Identifiable {
    case lowSugar
    case highProtein
    case vegetarian
    case vegan
    case glutenFree
    case dairyFree
    case avoidArtificialSweeteners
    case avoidDyes
    case avoidPreservatives
    case kidsMode
    case budgetSensitive

    var id: String { rawValue }

    var title: String {
        switch self {
        case .lowSugar: "Low sugar"
        case .highProtein: "High protein"
        case .vegetarian: "Vegetarian"
        case .vegan: "Vegan"
        case .glutenFree: "Gluten-free"
        case .dairyFree: "Dairy-free"
        case .avoidArtificialSweeteners: "Avoid sweeteners"
        case .avoidDyes: "Avoid dyes"
        case .avoidPreservatives: "Avoid preservatives"
        case .kidsMode: "Household/kids mode"
        case .budgetSensitive: "Budget sensitive"
        }
    }
}

struct UserNutritionProfile: Hashable {
    var preferences: Set<UserPreference>
    var allergens: Set<Allergen>
    var avoidedIngredients: [String]

    init(
        preferences: [UserPreference] = [],
        allergens: [Allergen] = [],
        avoidedIngredients: [String] = []
    ) {
        self.preferences = Set(preferences)
        self.allergens = Set(allergens)
        self.avoidedIngredients = avoidedIngredients
    }

    mutating func setPreference(_ preference: UserPreference, enabled: Bool) {
        if enabled {
            preferences.insert(preference)
        } else {
            preferences.remove(preference)
        }
    }

    mutating func setAllergen(_ allergen: Allergen, enabled: Bool) {
        if enabled {
            allergens.insert(allergen)
        } else {
            allergens.remove(allergen)
        }
    }
}

enum ProcessingLevel: String, Hashable {
    case minimal
    case moderate
    case high

    var title: String {
        switch self {
        case .minimal: "Minimally processed"
        case .moderate: "Moderately processed"
        case .high: "Highly processed"
        }
    }
}

enum DataQuality: String, Hashable {
    case verifiedDatabase
    case openFoodFacts
    case communitySubmission
    case userPhotoExtraction

    var label: String {
        switch self {
        case .verifiedDatabase: "Verified database"
        case .openFoodFacts: "Open product data"
        case .communitySubmission: "Community submission"
        case .userPhotoExtraction: "User photo extraction"
        }
    }

    var confidenceBase: Int {
        switch self {
        case .verifiedDatabase: 94
        case .openFoodFacts: 84
        case .communitySubmission: 72
        case .userPhotoExtraction: 56
        }
    }
}

struct Product: Identifiable, Hashable {
    var id: String
    var barcode: String
    var name: String
    var brand: String
    var category: ProductCategory
    var imageSystemName: String
    var imageURL: URL?
    var nutrition: NutritionFacts
    var ingredients: [Ingredient]
    var allergens: Set<Allergen>
    var processingLevel: ProcessingLevel
    var dataQuality: DataQuality
    var packageClaims: [String]
    var priceTier: PriceTier
    var serverResult: ScoreResult? = nil
    var serverExplanation: AIExplanation? = nil
    var serverAlternatives: [ProductAlternativeSuggestion] = []
}

enum PriceTier: String, Hashable {
    case budget
    case standard
    case premium

    var title: String {
        switch self {
        case .budget: "Budget"
        case .standard: "Standard"
        case .premium: "Premium"
        }
    }
}

extension Product {
    static func pendingContribution(gtin: String) -> Product {
        let score = Score(value: 0, status: .poor)
        let pendingResult = ScoreResult(
            engineVersion: "food-us-ca-v1",
            optiScore: score,
            optiFit: score,
            confidence: ConfidenceBadge(
                value: 0,
                label: "Awaiting review",
                detail: "Label photos are needed before Optiyou can score this product."
            ),
            verdict: "This product is waiting for contribution review.",
            reasons: [
                ScoreReason(
                    title: "Missing product",
                    detail: "Optiyou has the scan, but not enough verified label data yet.",
                    impact: .neutral
                )
            ],
            warnings: []
        )

        return Product.fixture(
            id: "missing-\(gtin)",
            barcode: gtin,
            name: "Product \(gtin)",
            brand: "Missing product",
            category: .unknown,
            imageSystemName: "questionmark.square.dashed",
            nutrition: NutritionFacts(
                calories: 0,
                addedSugarGrams: 0,
                proteinGrams: 0,
                fiberGrams: 0,
                sodiumMilligrams: 0
            ),
            ingredients: [],
            dataQuality: .communitySubmission,
            serverResult: pendingResult
        )
    }

    static func fixture(
        id: String = UUID().uuidString,
        barcode: String = "000000000000",
        name: String = "Everyday Lentil Bowl",
        brand: String = "Optiyou Test Kitchen",
        category: ProductCategory = .preparedMeal,
        imageSystemName: String = "takeoutbag.and.cup.and.straw",
        imageURL: URL? = nil,
        nutrition: NutritionFacts = NutritionFacts(
            calories: 320,
            addedSugarGrams: 3,
            proteinGrams: 18,
            fiberGrams: 8,
            sodiumMilligrams: 430
        ),
        ingredients: [Ingredient] = [
            Ingredient(name: "lentils"),
            Ingredient(name: "brown rice"),
            Ingredient(name: "tomato"),
            Ingredient(name: "spices")
        ],
        allergens: [Allergen] = [],
        processingLevel: ProcessingLevel = .moderate,
        dataQuality: DataQuality = .verifiedDatabase,
        packageClaims: [String] = [],
        priceTier: PriceTier = .standard,
        serverResult: ScoreResult? = nil,
        serverExplanation: AIExplanation? = nil,
        serverAlternatives: [ProductAlternativeSuggestion] = []
    ) -> Product {
        Product(
            id: id,
            barcode: barcode,
            name: name,
            brand: brand,
            category: category,
            imageSystemName: imageSystemName,
            imageURL: imageURL,
            nutrition: nutrition,
            ingredients: ingredients,
            allergens: Set(allergens),
            processingLevel: processingLevel,
            dataQuality: dataQuality,
            packageClaims: packageClaims,
            priceTier: priceTier,
            serverResult: serverResult,
            serverExplanation: serverExplanation,
            serverAlternatives: serverAlternatives
        )
    }

    func score(profile: UserNutritionProfile) -> ScoreResult {
        serverResult ?? ScoringEngine().score(product: self, profile: profile)
    }
}

struct BarcodeScanResult: Equatable, Hashable {
    var rawValue: String
    var normalizedGTIN: String
    var detectedAt: Date
}

enum ScanSessionState: Equatable {
    case idle
    case scanning
    case processing(String)
    case productFound(String)
    case unknownProduct(String)
    case unavailable(String)
    case failed(String)

    var isActivelyScanning: Bool {
        switch self {
        case .scanning:
            true
        default:
            false
        }
    }

    var title: String {
        switch self {
        case .idle: "Ready when you are"
        case .scanning: "Point at a barcode"
        case .processing: "Checking product"
        case .productFound: "Product found"
        case .unknownProduct: "Product not found yet"
        case .unavailable: "Scanner unavailable"
        case .failed: "Scan needs another try"
        }
    }

    var detail: String {
        switch self {
        case .idle:
            "Optiyou opens the camera first so scanning feels instant."
        case .scanning:
            "Hold the barcode inside the frame. Detection is automatic."
        case let .processing(gtin):
            "Looking up \(gtin) with your profile."
        case let .productFound(gtin):
            "Loaded \(gtin)."
        case let .unknownProduct(gtin):
            "\(gtin) needs a label contribution before confidence can improve."
        case let .unavailable(reason):
            reason
        case let .failed(message):
            message
        }
    }
}

struct ProductCard: Identifiable, Hashable {
    var id: String { product.id }
    var product: Product
    var result: ScoreResult
    var explanation: AIExplanation
    var alternatives: [Product]
}

struct HistoryEntry: Identifiable, Hashable {
    let id: String
    var product: Product
    var source: ScanSource
    var date: Date
    var isFavorite: Bool
    var resultStatus: String

    var isMissingProduct: Bool {
        resultStatus == "missing_product"
    }

    init(
        id: String = UUID().uuidString,
        product: Product,
        source: ScanSource,
        date: Date,
        isFavorite: Bool = false,
        resultStatus: String = "known"
    ) {
        self.id = id
        self.product = product
        self.source = source
        self.date = date
        self.isFavorite = isFavorite
        self.resultStatus = resultStatus
    }

    init(id: String = UUID().uuidString, missingGTIN gtin: String, source: ScanSource, date: Date) {
        self.init(
            id: id,
            product: .pendingContribution(gtin: gtin),
            source: source,
            date: date,
            resultStatus: "missing_product"
        )
    }
}

struct RecommendationPair: Identifiable, Hashable {
    var id: String { "\(current.id)-\(replacement.id)" }
    var current: Product
    var replacement: Product
    var reasons: [String]
}

struct ProductAlternativeSuggestion: Identifiable, Hashable {
    var id: String { gtin }
    var gtin: String
    var name: String
    var brand: String
    var optiFit: Int
    var whyBetter: [String]
    var paidPlacement: Bool
}

struct OverviewBucket: Identifiable, Hashable {
    var id: ScoreStatus { status }
    var status: ScoreStatus
    var count: Int
}

struct ContributionDraft: Identifiable, Hashable {
    enum PhotoKind: String, CaseIterable, Hashable, Identifiable {
        case frontPackage
        case nutritionLabel
        case ingredientsLabel

        var id: String { rawValue }

        var title: String {
            switch self {
            case .frontPackage: "Front package"
            case .nutritionLabel: "Nutrition label"
            case .ingredientsLabel: "Ingredients list"
            }
        }

        var systemImage: String {
            switch self {
            case .frontPackage: "shippingbox"
            case .nutritionLabel: "tablecells"
            case .ingredientsLabel: "text.viewfinder"
            }
        }
    }

    var id: String
    var gtin: String
    var status: String
    var confidenceLabel: String
    var uploads: [ContributionUpload]

    var requiredPhotos: [PhotoKind] {
        uploads.map(\.kind)
    }

    init(
        id: String,
        gtin: String,
        status: String,
        confidenceLabel: String,
        uploads: [ContributionUpload]
    ) {
        self.id = id
        self.gtin = gtin
        self.status = status
        self.confidenceLabel = confidenceLabel
        self.uploads = uploads
    }

    init(
        id: String,
        gtin: String,
        status: String,
        confidenceLabel: String,
        requiredPhotos: [PhotoKind]
    ) {
        self.init(
            id: id,
            gtin: gtin,
            status: status,
            confidenceLabel: confidenceLabel,
            uploads: requiredPhotos.map { ContributionUpload(kind: $0) }
        )
    }

    func upload(for kind: PhotoKind) -> ContributionUpload? {
        uploads.first { $0.kind == kind }
    }

    static func missingProduct(gtin: String) -> ContributionDraft {
        ContributionDraft(
            id: "draft-\(gtin)",
            gtin: gtin,
            status: "Awaiting label photos",
            confidenceLabel: "Low confidence until reviewed",
            requiredPhotos: PhotoKind.allCases
        )
    }
}

struct ContributionUpload: Identifiable, Hashable {
    var id: ContributionDraft.PhotoKind { kind }
    var kind: ContributionDraft.PhotoKind
    var url: URL?
    var expiresAt: Date?

    init(kind: ContributionDraft.PhotoKind, url: URL? = nil, expiresAt: Date? = nil) {
        self.kind = kind
        self.url = url
        self.expiresAt = expiresAt
    }
}

enum ScanLookupOutcome: Hashable {
    case product(Product)
    case contribution(ContributionDraft)
    case failure(String)
}

enum GTINNormalizer {
    static func normalize(_ value: String) -> String? {
        let digits = value.filter(\.isNumber)
        let normalized = digits.count == 13 && digits.hasPrefix("0") ? String(digits.dropFirst()) : digits
        guard (8...14).contains(normalized.count) else {
            return nil
        }
        return normalized
    }
}

struct BarcodeScanDebouncer {
    var interval: TimeInterval = 1.5
    private(set) var lastAccepted: BarcodeScanResult?

    mutating func shouldAccept(rawValue: String, now: Date = .now) -> BarcodeScanResult? {
        guard let normalized = GTINNormalizer.normalize(rawValue) else {
            return nil
        }

        if let lastAccepted,
           lastAccepted.normalizedGTIN == normalized,
           now.timeIntervalSince(lastAccepted.detectedAt) < interval {
            return nil
        }

        let result = BarcodeScanResult(rawValue: rawValue, normalizedGTIN: normalized, detectedAt: now)
        lastAccepted = result
        return result
    }
}
