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
}
