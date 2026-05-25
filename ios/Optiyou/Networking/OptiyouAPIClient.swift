import Foundation

struct OptiyouAPIClient: Sendable {
    var baseURL: URL
    var bearerToken: String?
    var session: URLSession

    static let live = OptiyouAPIClient(
        baseURL: URL(string: "https://optiyou.co")!,
        bearerToken: nil,
        session: .shared
    )

    func scan(gtin: String, profile: UserNutritionProfile) async throws -> ProductCard {
        var request = try jsonRequest(path: "/v1/scan", method: "POST")
        request.httpBody = try JSONEncoder().encode(ScanRequest(gtin: gtin, profile: ProfileRequest(profile: profile)))

        let response: ScanResponse = try await send(request)
        return try response.productCard(profile: profile)
    }

    func product(gtin: String) async throws -> Product {
        let request = try jsonRequest(path: "/v1/products/\(gtin)", method: "GET")
        let response: ProductLookupResponse = try await send(request)
        return try response.product.product()
    }

    func history() async throws -> [HistoryEntry] {
        let request = try jsonRequest(path: "/v1/history", method: "GET")
        let response: HistoryResponse = try await send(request)
        return response.history.compactMap { try? $0.historyEntry() }
    }

    func methodology() async throws -> MethodologySummary {
        let request = try jsonRequest(path: "/v1/methodology", method: "GET")
        return try await send(request)
    }

    func createContribution(gtin: String, profileId: String) async throws -> ContributionDraft {
        var request = try jsonRequest(path: "/v1/contributions", method: "POST")
        request.httpBody = try JSONEncoder().encode(ContributionRequest(gtin: gtin, profileId: profileId))
        let response: ContributionResponse = try await send(request)
        return response.draft
    }

    private func jsonRequest(path: String, method: String) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw OptiyouAPIError.invalidURL(path)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        if let bearerToken {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "authorization")
        }
        return request
    }

    private func send<ResponseBody: Decodable>(_ request: URLRequest) async throws -> ResponseBody {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw OptiyouAPIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw OptiyouAPIError.httpStatus(httpResponse.statusCode)
        }

        return try JSONDecoder.optiyou.decode(ResponseBody.self, from: data)
    }
}

enum OptiyouAPIError: Error, Equatable {
    case invalidURL(String)
    case invalidResponse
    case httpStatus(Int)
    case missingProduct
}

struct MethodologySummary: Decodable, Hashable {
    var version: String
    var scope: String
    var trustRules: [String]

    enum CodingKeys: String, CodingKey {
        case version
        case scope
        case trustRules
    }
}

private struct ScanRequest: Encodable {
    var gtin: String
    var profile: ProfileRequest
}

private struct ProfileRequest: Encodable {
    var id: String
    var preferences: [String]
    var allergens: [String]
    var avoidedIngredients: [String]

    init(profile: UserNutritionProfile) {
        id = "local-profile"
        preferences = profile.preferences.map(\.rawValue).sorted()
        allergens = profile.allergens.map(\.rawValue).sorted()
        avoidedIngredients = profile.avoidedIngredients
    }
}

private struct ContributionRequest: Encodable {
    var gtin: String
    var profileId: String
}

private struct ScanResponse: Decodable {
    var status: String?
    var product: ProductDTO?
    var scores: ScoresDTO?
    var explanation: ExplanationDTO?
    var alternatives: [AlternativeDTO]?

    func productCard(profile: UserNutritionProfile) throws -> ProductCard {
        guard let productDTO = product else {
            throw OptiyouAPIError.missingProduct
        }

        let product = try productDTO.product()
        let result = ScoringEngine().score(product: product, profile: profile)
        let explanation = AIExplanation(
            summary: explanation?.summary ?? result.verdict,
            bullets: explanation?.claimMap?.map { "\($0.claim) · \($0.source)" } ?? [],
            suggestedQuestion: "Ask why this scored \(result.optiFit.value) for me"
        )

        return ProductCard(
            product: product,
            result: result,
            explanation: explanation,
            alternatives: alternatives?.compactMap { try? $0.product() } ?? []
        )
    }
}

private struct ProductLookupResponse: Decodable {
    var product: ProductDTO
}

private struct HistoryResponse: Decodable {
    var history: [HistoryEntryDTO]
}

private struct ContributionResponse: Decodable {
    var contribution: ContributionDTO?

    var draft: ContributionDraft {
        ContributionDraft(
            id: contribution?.id ?? UUID().uuidString,
            gtin: contribution?.gtin ?? "",
            status: contribution?.status ?? "Awaiting label photos",
            confidenceLabel: "Low confidence until reviewed",
            requiredPhotos: ContributionDraft.PhotoKind.allCases
        )
    }
}

private struct ProductDTO: Decodable {
    var id: String
    var gtin: String?
    var barcode: String?
    var name: String
    var brand: String
    var category: String
    var imageUrl: String?
    var nutrition: NutritionDTO?
    var ingredients: [IngredientDTO]?
    var allergens: [String]?
    var processingLevel: String?
    var dataQuality: DataQualityDTO?

    func product() throws -> Product {
        Product.fixture(
            id: id,
            barcode: gtin ?? barcode ?? "000000000000",
            name: name,
            brand: brand,
            category: ProductCategory(apiValue: category),
            imageSystemName: ProductCategory(apiValue: category).fallbackImage,
            imageURL: imageUrl.flatMap(URL.init(string:)),
            nutrition: nutrition?.nutritionFacts ?? Product.fixture().nutrition,
            ingredients: ingredients?.map(\.ingredient) ?? [],
            allergens: (allergens ?? []).compactMap(Allergen.init(rawValue:)),
            processingLevel: ProcessingLevel(apiValue: processingLevel),
            dataQuality: DataQuality(apiValue: dataQuality?.source),
            packageClaims: [],
            priceTier: .standard
        )
    }
}

private struct NutritionDTO: Decodable {
    var calories: Double
    var addedSugarGrams: Double
    var proteinGrams: Double
    var fiberGrams: Double
    var sodiumMilligrams: Double

    var nutritionFacts: NutritionFacts {
        NutritionFacts(
            calories: Int(calories.rounded()),
            addedSugarGrams: addedSugarGrams,
            proteinGrams: proteinGrams,
            fiberGrams: fiberGrams,
            sodiumMilligrams: Int(sodiumMilligrams.rounded())
        )
    }
}

private struct IngredientDTO: Decodable {
    var name: String?
    var flags: [String]?

    var ingredient: Ingredient {
        Ingredient(
            name: name ?? "Unknown ingredient",
            flags: Set((flags ?? []).compactMap(IngredientFlag.init(apiValue:)))
        )
    }
}

private struct DataQualityDTO: Decodable {
    var source: String?
}

private struct ScoresDTO: Decodable {
    var optiScore: Int?
    var optiFit: Int?
}

private struct ExplanationDTO: Decodable {
    var summary: String?
    var claimMap: [ClaimDTO]?
}

private struct ClaimDTO: Decodable {
    var claim: String
    var source: String
}

private struct AlternativeDTO: Decodable {
    var gtin: String
    var name: String
    var brand: String

    func product() throws -> Product {
        Product.fixture(
            id: "alt-\(gtin)",
            barcode: gtin,
            name: name,
            brand: brand,
            category: .unknown
        )
    }
}

private struct HistoryEntryDTO: Decodable {
    var product: ProductDTO?
    var source: String?
    var createdAt: Date?

    func historyEntry() throws -> HistoryEntry {
        guard let product else {
            throw OptiyouAPIError.missingProduct
        }

        return HistoryEntry(
            product: try product.product(),
            source: ScanSource(rawValue: source ?? "") ?? .barcode,
            date: createdAt ?? .now
        )
    }
}

private struct ContributionDTO: Decodable {
    var id: String?
    var gtin: String?
    var status: String?
}

private extension JSONDecoder {
    static var optiyou: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

private extension ProductCategory {
    init(apiValue: String) {
        switch apiValue {
        case "cereal": self = .cereal
        case "yogurt": self = .yogurt
        case "snack_bar": self = .snackBar
        case "beverage": self = .beverage
        case "prepared_meal": self = .preparedMeal
        case "sauce": self = .sauce
        default: self = .unknown
        }
    }

    var fallbackImage: String {
        switch self {
        case .unknown: "takeoutbag.and.cup.and.straw"
        case .cereal: "leaf"
        case .yogurt: "cup.and.saucer"
        case .snackBar: "rectangle.roundedtop"
        case .beverage: "waterbottle"
        case .preparedMeal: "takeoutbag.and.cup.and.straw"
        case .sauce: "drop"
        }
    }
}

private extension ProcessingLevel {
    init(apiValue: String?) {
        switch apiValue {
        case "minimal": self = .minimal
        case "high": self = .high
        default: self = .moderate
        }
    }
}

private extension DataQuality {
    init(apiValue: String?) {
        switch apiValue {
        case "verified_label", "brand_portal": self = .verifiedDatabase
        case "open_product_database": self = .openFoodFacts
        case "ai_extraction": self = .userPhotoExtraction
        default: self = .communitySubmission
        }
    }
}

private extension IngredientFlag {
    init?(apiValue: String) {
        switch apiValue {
        case "added_sugar": self = .addedSugar
        case "artificial_sweetener": self = .artificialSweetener
        case "synthetic_dye": self = .syntheticDye
        case "preservative": self = .preservative
        case "ultra_processed_marker": self = .ultraProcessedMarker
        case "contains_dairy": self = .containsDairy
        case "contains_gluten": self = .containsGluten
        default: return nil
        }
    }
}
