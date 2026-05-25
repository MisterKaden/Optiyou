import Foundation

enum SampleCatalog {
    static let products: [Product] = [
        Product.fixture(
            id: "cereal-heritage-oats",
            barcode: "006178200001",
            name: "Heritage Oat Squares",
            brand: "Field & Spoon",
            category: .cereal,
            imageSystemName: "leaf",
            nutrition: NutritionFacts(calories: 180, addedSugarGrams: 4, proteinGrams: 6, fiberGrams: 7, sodiumMilligrams: 115),
            ingredients: [
                Ingredient(name: "whole grain oats"),
                Ingredient(name: "brown rice"),
                Ingredient(name: "date powder", flags: [.addedSugar]),
                Ingredient(name: "sea salt")
            ],
            processingLevel: .moderate,
            dataQuality: .verifiedDatabase,
            packageClaims: ["Whole grain", "No synthetic dyes"],
            priceTier: .standard
        ),
        Product.fixture(
            id: "cereal-cocoa-crunch",
            barcode: "006178200002",
            name: "Cocoa Crunch Cereal",
            brand: "Morning Bolt",
            category: .cereal,
            imageSystemName: "takeoutbag.and.cup.and.straw",
            nutrition: NutritionFacts(calories: 210, addedSugarGrams: 15, proteinGrams: 3, fiberGrams: 2, sodiumMilligrams: 180),
            ingredients: [
                Ingredient(name: "corn flour"),
                Ingredient(name: "cane sugar", flags: [.addedSugar]),
                Ingredient(name: "cocoa powder"),
                Ingredient(name: "red 40", flags: [.syntheticDye]),
                Ingredient(name: "natural flavor", flags: [.ultraProcessedMarker])
            ],
            processingLevel: .high,
            dataQuality: .openFoodFacts,
            packageClaims: ["Family size"],
            priceTier: .budget
        ),
        Product.fixture(
            id: "yogurt-berry-high-protein",
            barcode: "006178200003",
            name: "Berry Protein Yogurt",
            brand: "North Valley",
            category: .yogurt,
            imageSystemName: "cup.and.saucer",
            nutrition: NutritionFacts(calories: 150, addedSugarGrams: 6, proteinGrams: 15, fiberGrams: 1, sodiumMilligrams: 75),
            ingredients: [
                Ingredient(name: "cultured milk", flags: [.containsDairy]),
                Ingredient(name: "strawberries"),
                Ingredient(name: "cane sugar", flags: [.addedSugar]),
                Ingredient(name: "pectin")
            ],
            allergens: [.dairy],
            processingLevel: .moderate,
            dataQuality: .verifiedDatabase,
            packageClaims: ["High protein"],
            priceTier: .standard
        ),
        Product.fixture(
            id: "bar-chocolate-fiber",
            barcode: "006178200004",
            name: "Chocolate Fiber Bar",
            brand: "Trail Theory",
            category: .snackBar,
            imageSystemName: "rectangle.roundedtop",
            nutrition: NutritionFacts(calories: 190, addedSugarGrams: 3, proteinGrams: 10, fiberGrams: 9, sodiumMilligrams: 130),
            ingredients: [
                Ingredient(name: "almonds"),
                Ingredient(name: "chicory root fiber"),
                Ingredient(name: "cocoa"),
                Ingredient(name: "sucralose", flags: [.artificialSweetener])
            ],
            allergens: [.treeNut],
            processingLevel: .moderate,
            dataQuality: .communitySubmission,
            packageClaims: ["High fiber"],
            priceTier: .premium
        ),
        Product.fixture(
            id: "meal-lentil-bowl",
            barcode: "006178200005",
            name: "Lentil Harvest Bowl",
            brand: "Bright Fork",
            category: .preparedMeal,
            imageSystemName: "takeoutbag.and.cup.and.straw",
            nutrition: NutritionFacts(calories: 340, addedSugarGrams: 2, proteinGrams: 17, fiberGrams: 10, sodiumMilligrams: 480),
            ingredients: [
                Ingredient(name: "lentils"),
                Ingredient(name: "brown rice"),
                Ingredient(name: "tomatoes"),
                Ingredient(name: "spinach"),
                Ingredient(name: "spices")
            ],
            processingLevel: .minimal,
            dataQuality: .verifiedDatabase,
            packageClaims: ["Plant-based", "High fiber"],
            priceTier: .standard
        )
    ]

    static func product(id: Product.ID) -> Product? {
        products.first { $0.id == id }
    }

    static func product(barcode: String) -> Product? {
        products.first { $0.barcode == barcode }
    }

    static func search(_ query: String) -> [Product] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard term.isEmpty == false else {
            return []
        }

        return products.filter {
            $0.name.localizedCaseInsensitiveContains(term) ||
                $0.brand.localizedCaseInsensitiveContains(term) ||
                $0.category.title.localizedCaseInsensitiveContains(term) ||
                $0.barcode.contains(term)
        }
    }

    static func betterSwaps(for product: Product, profile: UserNutritionProfile) -> [Product] {
        let engine = ScoringEngine()
        let currentFit = engine.score(product: product, profile: profile).optiFit.value

        return products
            .filter { $0.id != product.id && $0.category == product.category }
            .map { product in
                (product, engine.score(product: product, profile: profile).optiFit.value)
            }
            .filter { $0.1 > currentFit }
            .sorted { $0.1 > $1.1 }
            .prefix(3)
            .map(\.0)
    }

    static func recommendationPair(for product: Product, profile: UserNutritionProfile) -> RecommendationPair? {
        guard let replacement = betterSwaps(for: product, profile: profile).first else {
            return nil
        }

        return RecommendationPair(
            current: product,
            replacement: replacement,
            reasons: swapReasons(from: product, to: replacement, profile: profile)
        )
    }

    static func swapReasons(from current: Product, to replacement: Product, profile: UserNutritionProfile) -> [String] {
        var reasons: [String] = []

        if replacement.nutrition.addedSugarGrams < current.nutrition.addedSugarGrams {
            reasons.append("Less added sugar")
        }
        if replacement.nutrition.fiberGrams > current.nutrition.fiberGrams {
            reasons.append("More fiber")
        }
        if replacement.nutrition.proteinGrams > current.nutrition.proteinGrams {
            reasons.append("More protein")
        }
        if profile.preferences.contains(.avoidDyes),
           current.ingredients.contains(where: { $0.flags.contains(.syntheticDye) }),
           replacement.ingredients.contains(where: { $0.flags.contains(.syntheticDye) }) == false {
            reasons.append("No synthetic dye flag")
        }

        return reasons.isEmpty ? ["Higher OptiFit in the same category"] : reasons
    }
}

struct StructuredProductInput {
    var source: ScanSource
    var product: Product
}

struct ProductParser {
    func parse(_ input: StructuredProductInput) -> Product {
        input.product
    }
}

struct ExplanationComposer {
    func compose(product: Product, result: ScoreResult, profile: UserNutritionProfile) -> AIExplanation {
        let leadingReason = result.reasons.first?.detail ?? "Optiyou found no major scoring issue."
        let profileNote = profile.preferences.isEmpty ? "general food quality" : "your selected preferences"

        return AIExplanation(
            summary: "\(result.verdict) \(leadingReason)",
            bullets: [
                "Scores come from \(result.engineVersion), not from AI.",
                "AI explains the parsed label in plain English for \(profileNote).",
                "Confidence is based on data source quality: \(result.confidence.detail)."
            ],
            suggestedQuestion: "Ask why this scored \(result.optiFit.value) for me"
        )
    }
}

struct AIExplanation: Hashable {
    var summary: String
    var bullets: [String]
    var suggestedQuestion: String
}
