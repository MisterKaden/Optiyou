import XCTest
@testable import Optiyou

final class ScoringEngineTests: XCTestCase {
    func testLowSugarProfileCanReduceFitBelowOverallQuality() {
        let product = Product.fixture(
            name: "Maple Protein Granola",
            category: .cereal,
            nutrition: NutritionFacts(
                calories: 230,
                addedSugarGrams: 12,
                proteinGrams: 9,
                fiberGrams: 5,
                sodiumMilligrams: 110
            ),
            ingredients: [
                Ingredient(name: "whole grain oats", flags: []),
                Ingredient(name: "cane sugar", flags: [.addedSugar]),
                Ingredient(name: "chicory root fiber", flags: [])
            ],
            dataQuality: .verifiedDatabase
        )
        let profile = UserNutritionProfile(preferences: [.lowSugar, .highProtein], allergens: [])

        let result = ScoringEngine().score(product: product, profile: profile)

        XCTAssertEqual(result.engineVersion, "OptiScoreEngine/1.0")
        XCTAssertGreaterThan(result.optiScore.value, 70)
        XCTAssertLessThan(result.optiFit.value, result.optiScore.value)
        XCTAssertTrue(result.warnings.contains { $0.title == "High for your low-sugar profile" })
    }

    func testPhotoExtractionLowersConfidenceButDoesNotChangeDeterministicScoreInputs() {
        let verified = Product.fixture(
            nutrition: NutritionFacts(
                calories: 160,
                addedSugarGrams: 2,
                proteinGrams: 6,
                fiberGrams: 7,
                sodiumMilligrams: 90
            ),
            dataQuality: .verifiedDatabase
        )
        let photoExtracted = Product.fixture(
            nutrition: verified.nutrition,
            dataQuality: .userPhotoExtraction
        )
        let profile = UserNutritionProfile(preferences: [.lowSugar], allergens: [])
        let engine = ScoringEngine()

        let verifiedResult = engine.score(product: verified, profile: profile)
        let photoResult = engine.score(product: photoExtracted, profile: profile)

        XCTAssertEqual(verifiedResult.optiScore.value, photoResult.optiScore.value)
        XCTAssertGreaterThan(verifiedResult.confidence.value, photoResult.confidence.value)
        XCTAssertEqual(photoResult.confidence.label, "Low confidence")
    }

    func testAllergenConflictProducesCriticalWarningAndFitPenalty() {
        let product = Product.fixture(
            nutrition: NutritionFacts(
                calories: 210,
                addedSugarGrams: 4,
                proteinGrams: 8,
                fiberGrams: 4,
                sodiumMilligrams: 180
            ),
            ingredients: [
                Ingredient(name: "brown rice", flags: []),
                Ingredient(name: "milk protein", flags: [.containsDairy])
            ],
            allergens: [.dairy],
            dataQuality: .verifiedDatabase
        )
        let profile = UserNutritionProfile(preferences: [.dairyFree], allergens: [.dairy])

        let result = ScoringEngine().score(product: product, profile: profile)

        XCTAssertLessThan(result.optiFit.value, 50)
        XCTAssertTrue(result.warnings.contains { $0.severity == .critical && $0.title == "Contains dairy" })
    }

    func testGTINNormalizerHandlesVisionKitEANPrefixAndInvalidCodes() {
        XCTAssertEqual(GTINNormalizer.normalize("0 06178200002"), "006178200002")
        XCTAssertEqual(GTINNormalizer.normalize("0006178200002"), "006178200002")
        XCTAssertEqual(GTINNormalizer.normalize("12345678"), "12345678")
        XCTAssertNil(GTINNormalizer.normalize("12345"))
        XCTAssertNil(GTINNormalizer.normalize("not-a-code"))
    }

    func testBarcodeDebouncerRejectsDuplicateScansInsideWindow() {
        var debouncer = BarcodeScanDebouncer(interval: 1.5)
        let start = Date(timeIntervalSince1970: 1_000)

        XCTAssertNotNil(debouncer.shouldAccept(rawValue: "006178200002", now: start))
        XCTAssertNil(debouncer.shouldAccept(rawValue: "006178200002", now: start.addingTimeInterval(0.5)))
        XCTAssertNotNil(debouncer.shouldAccept(rawValue: "006178200002", now: start.addingTimeInterval(2.0)))
    }

    func testContributionDraftKeepsSignedUploadTargetsByPhotoKind() throws {
        let frontURL = try XCTUnwrap(URL(string: "https://optiyou.test/v1/uploads/front-token"))
        let nutritionURL = try XCTUnwrap(URL(string: "https://optiyou.test/v1/uploads/nutrition-token"))
        let draft = ContributionDraft(
            id: "contrib-1",
            gtin: "000000000999",
            status: "awaiting_uploads",
            confidenceLabel: "Low confidence until reviewed",
            uploads: [
                ContributionUpload(kind: .frontPackage, url: frontURL, expiresAt: Date(timeIntervalSince1970: 2_000)),
                ContributionUpload(kind: .nutritionLabel, url: nutritionURL, expiresAt: Date(timeIntervalSince1970: 2_000))
            ]
        )

        XCTAssertEqual(draft.requiredPhotos, [.frontPackage, .nutritionLabel])
        XCTAssertEqual(draft.upload(for: .frontPackage)?.url, frontURL)
        XCTAssertNil(draft.upload(for: .ingredientsLabel))
    }

    @MainActor
    func testOverviewBucketsCountCurrentHistoryStatuses() {
        let store = AppStore()
        store.recordScan(SampleCatalog.products[1], source: .barcode)
        let buckets = store.overviewBuckets()

        XCTAssertEqual(buckets.reduce(0) { $0 + $1.count }, store.history.count)
        XCTAssertTrue(buckets.contains { $0.status == .poor && $0.count >= 1 })
    }

    func testRecommendationPairUsesSameCategoryHigherFitProduct() {
        let profile = UserNutritionProfile(preferences: [.lowSugar, .avoidDyes], allergens: [])
        let current = SampleCatalog.products[1]
        let pair = SampleCatalog.recommendationPair(for: current, profile: profile)

        XCTAssertNotNil(pair)
        XCTAssertEqual(pair?.current.category, pair?.replacement.category)
        let currentFit = ScoringEngine().score(product: current, profile: profile).optiFit.value
        let replacementFit = ScoringEngine().score(product: pair!.replacement, profile: profile).optiFit.value
        XCTAssertGreaterThan(replacementFit, currentFit)
        XCTAssertFalse(pair!.reasons.isEmpty)
    }
}
