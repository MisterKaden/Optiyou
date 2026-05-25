import Foundation

struct OptiyouAPIClient: Sendable {
    var baseURL: URL
    var bearerToken: String?
    var session: URLSession

    static var live: OptiyouAPIClient {
        OptiyouAPIClient(
            baseURL: configuredBaseURL(),
            bearerToken: storedAccessToken() ?? configuredAccessToken(),
            session: .shared
        )
    }

    func scan(gtin: String, profile: UserNutritionProfile, source: ScanSource) async throws -> ScanLookupOutcome {
        var request = try jsonRequest(path: "/v1/scan", method: "POST")
        request.httpBody = try JSONEncoder().encode(ScanRequest(gtin: gtin, source: source.apiValue, profile: ProfileRequest(profile: profile)))

        let response: ScanResponse = try await send(request)
        return try response.lookupOutcome(profile: profile)
    }

    func product(gtin: String) async throws -> Product {
        let request = try jsonRequest(path: "/v1/products/\(gtin)", method: "GET")
        let response: ProductLookupResponse = try await send(request)
        return try response.product.product()
    }

    func searchProducts(query: String) async throws -> [Product] {
        var components = URLComponents()
        components.path = "/v1/products"
        components.queryItems = [
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "limit", value: "20")
        ]
        let request = try jsonRequest(path: components.string ?? "/v1/products", method: "GET")
        let response: ProductSearchResponse = try await send(request)
        return response.products.compactMap { try? $0.product() }
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

    func uploadContributionPhoto(_ data: Data, to upload: ContributionUpload) async throws {
        guard let url = upload.url else {
            throw OptiyouAPIError.missingUploadTarget
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue("image/jpeg", forHTTPHeaderField: "content-type")

        let (_, response) = try await session.upload(for: request, from: data)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw OptiyouAPIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw OptiyouAPIError.httpStatus(httpResponse.statusCode)
        }
    }

    func appleSignInNonce() async throws -> AppleSignInNonce {
        let request = try jsonRequest(path: "/v1/auth/apple/nonce", method: "GET")
        return try await send(request)
    }

    func exchangeAppleIdentityToken(_ identityToken: String, nonce: String) async throws -> AuthSession {
        var request = try jsonRequest(path: "/v1/auth/apple", method: "POST")
        request.httpBody = try JSONEncoder().encode(AppleSignInRequest(identityToken: identityToken, nonce: nonce))
        let session: AuthSession = try await send(request)
        Self.storeAuthSession(session)
        return session
    }

    func withAccessToken(_ accessToken: String?) -> OptiyouAPIClient {
        var copy = self
        copy.bearerToken = accessToken
        return copy
    }

    static func clearStoredAuthSession() {
        OptiyouAuthSessionStore.clear()
    }

    private func jsonRequest(path: String, method: String) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw OptiyouAPIError.invalidURL(path)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        if let bearerToken = bearerToken ?? Self.storedAccessToken() {
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

    private static func configuredBaseURL() -> URL {
        if let value = configuredString("OPTIYOU_API_BASE_URL"),
           let url = URL(string: value) {
            return url
        }
        return URL(string: "https://optiyou.co")!
    }

    private static func configuredAccessToken() -> String? {
        configuredString("OPTIYOU_API_ACCESS_TOKEN")
    }

    private static func storedAccessToken() -> String? {
        OptiyouAuthSessionStore.accessToken()
    }

    private static func storeAuthSession(_ session: AuthSession) {
        OptiyouAuthSessionStore.save(session)
    }

    private static func configuredString(_ key: String) -> String? {
        let environmentValue = ProcessInfo.processInfo.environment[key]
        let plistValue = Bundle.main.object(forInfoDictionaryKey: key) as? String
        let value = (environmentValue?.isEmpty == false ? environmentValue : plistValue)?.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let value,
              value.isEmpty == false,
              value.hasPrefix("$(") == false else {
            return nil
        }

        return value
    }
}

enum OptiyouAPIError: Error, Equatable, LocalizedError {
    case invalidURL(String)
    case invalidResponse
    case httpStatus(Int)
    case missingProduct
    case missingUploadTarget

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            "Optiyou API URL is not configured correctly."
        case .invalidResponse:
            "Optiyou returned an invalid response."
        case let .httpStatus(status):
            status == 401 ? "Optiyou API authentication failed." : "Optiyou API request failed with status \(status)."
        case .missingProduct:
            "Optiyou could not load this product yet."
        case .missingUploadTarget:
            "Optiyou could not find a signed upload target for this photo."
        }
    }
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
    var source: String
    var profile: ProfileRequest
}

private struct ProfileRequest: Encodable {
    var id: String
    var preferences: [String]
    var allergens: [String]
    var avoidedIngredients: [String]

    init(profile: UserNutritionProfile) {
        id = "local-profile"
        preferences = profile.preferences.map(\.apiValue).sorted()
        allergens = profile.allergens.map(\.apiValue).sorted()
        avoidedIngredients = profile.avoidedIngredients
    }
}

private struct ContributionRequest: Encodable {
    var gtin: String
    var profileId: String
}

private struct AppleSignInRequest: Encodable {
    var identityToken: String
    var nonce: String
}

struct AppleSignInNonce: Decodable, Hashable {
    var nonce: String
    var nonceSha256: String
    var expiresAt: String
}

struct AuthSession: Codable, Hashable {
    var accessToken: String
    var tokenType: String
    var expiresAt: String
    var authentication: String
    var user: AuthenticatedAPIUser
}

struct AuthenticatedAPIUser: Codable, Hashable {
    var id: String
    var email: String?
}

private enum OptiyouAuthSessionStore {
    private static let sessionKey = "co.optiyou.auth.session"

    static func save(_ session: AuthSession) {
        guard let data = try? JSONEncoder().encode(session) else {
            return
        }
        UserDefaults.standard.set(data, forKey: sessionKey)
    }

    static func accessToken(now: Date = .now) -> String? {
        guard let data = UserDefaults.standard.data(forKey: sessionKey),
              let session = try? JSONDecoder.optiyou.decode(AuthSession.self, from: data),
              Date.optiyouAPI(session.expiresAt).map({ $0 > now }) == true else {
            clear()
            return nil
        }

        return session.accessToken
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: sessionKey)
    }
}

private struct ScanResponse: Decodable {
    var status: String?
    var product: ProductDTO?
    var scores: ScoresDTO?
    var confidence: ConfidenceDTO?
    var reasonCodes: [String]?
    var explanation: ExplanationDTO?
    var alternatives: [AlternativeDTO]?
    var contribution: ContributionDTO?
    var uploads: [UploadDTO]?

    func lookupOutcome(profile: UserNutritionProfile) throws -> ScanLookupOutcome {
        if status == "missing_product" {
            return .contribution(contributionDraft)
        }

        guard let productDTO = product else {
            throw OptiyouAPIError.missingProduct
        }

        var product = try productDTO.product()
        let fallback = product.score(profile: profile)
        let serverResult = scoreResult(product: product, profile: profile, fallback: fallback)
        let serverExplanation = AIExplanation(
            summary: explanation?.summary ?? serverResult.verdict,
            bullets: explanation?.claimMap?.map { "\($0.claim) · \($0.source)" } ?? serverResult.reasons.map(\.detail),
            suggestedQuestion: "Ask why this scored \(serverResult.optiFit.value) for me"
        )
        product.serverResult = serverResult
        product.serverExplanation = serverExplanation
        product.serverAlternatives = alternatives?.map(\.suggestion) ?? []

        return .product(product)
    }

    private var contributionDraft: ContributionDraft {
        let uploadTargets = uploads?.compactMap(\.contributionUpload) ?? []
        return ContributionDraft(
            id: contribution?.id ?? UUID().uuidString,
            gtin: product?.gtin ?? "",
            status: contribution?.status ?? "Awaiting label photos",
            confidenceLabel: "Low confidence until reviewed",
            uploads: uploadTargets.isEmpty ? uploadKinds.map { ContributionUpload(kind: $0) } : uploadTargets
        )
    }

    private var uploadKinds: [ContributionDraft.PhotoKind] {
        let kinds = uploads?.compactMap { ContributionDraft.PhotoKind(apiValue: $0.kind) } ?? []
        return kinds.isEmpty ? ContributionDraft.PhotoKind.allCases : kinds
    }

    private func scoreResult(product: Product, profile: UserNutritionProfile, fallback: ScoreResult) -> ScoreResult {
        let optiScoreValue = scores?.optiScore ?? fallback.optiScore.value
        let optiFitValue = scores?.optiFit ?? fallback.optiFit.value
        let confidenceValue = confidence?.value ?? fallback.confidence.value
        let mappedReasons = (reasonCodes ?? []).map { ScoreReason(reasonCode: $0, product: product) }
        let mappedWarnings = (reasonCodes ?? []).compactMap { ProductWarning(reasonCode: $0, product: product, profile: profile) }

        return ScoreResult(
            engineVersion: "food-us-ca-v1",
            optiScore: Score(value: optiScoreValue, status: ScoreStatus(value: optiScoreValue)),
            optiFit: Score(value: optiFitValue, status: ScoreStatus(value: optiFitValue)),
            confidence: ConfidenceBadge(
                value: confidenceValue,
                label: confidence?.label ?? fallback.confidence.label,
                detail: confidence?.source ?? fallback.confidence.detail
            ),
            verdict: explanation?.summary ?? fallback.verdict,
            reasons: mappedReasons.isEmpty ? fallback.reasons : mappedReasons,
            warnings: mappedWarnings.isEmpty ? fallback.warnings : mappedWarnings
        )
    }
}

private struct ProductLookupResponse: Decodable {
    var product: ProductDTO
}

private struct ProductSearchResponse: Decodable {
    var products: [ProductDTO]
}

private struct HistoryResponse: Decodable {
    var history: [HistoryEntryDTO]
}

private struct ContributionResponse: Decodable {
    var product: ProductDTO?
    var contribution: ContributionDTO?
    var uploads: [UploadDTO]?

    var draft: ContributionDraft {
        let kinds = uploads?.compactMap { ContributionDraft.PhotoKind(apiValue: $0.kind) } ?? []
        let uploadTargets = uploads?.compactMap(\.contributionUpload) ?? []
        return ContributionDraft(
            id: contribution?.id ?? UUID().uuidString,
            gtin: product?.gtin ?? "",
            status: contribution?.status ?? "Awaiting label photos",
            confidenceLabel: "Low confidence until reviewed",
            uploads: uploadTargets.isEmpty ? (kinds.isEmpty ? ContributionDraft.PhotoKind.allCases : kinds).map { ContributionUpload(kind: $0) } : uploadTargets
        )
    }
}

private struct ProductDTO: Decodable {
    var id: String?
    var gtin: String?
    var barcode: String?
    var name: String?
    var brand: String?
    var category: String?
    var imageUrl: String?
    var nutrition: NutritionDTO?
    var ingredients: [IngredientDTO]?
    var allergens: [String]?
    var processingLevel: String?
    var dataQuality: DataQualityDTO?

    func product() throws -> Product {
        guard let id,
              let name,
              let brand,
              let category else {
            throw OptiyouAPIError.missingProduct
        }

        let productCategory = ProductCategory(apiValue: category)
        return Product(
            id: id,
            barcode: gtin ?? barcode ?? "000000000000",
            name: name,
            brand: brand,
            category: productCategory,
            imageSystemName: productCategory.fallbackImage,
            imageURL: imageUrl.flatMap(URL.httpURL(string:)),
            nutrition: nutrition?.nutritionFacts ?? NutritionFacts(calories: 0, addedSugarGrams: 0, proteinGrams: 0, fiberGrams: 0, sodiumMilligrams: 0),
            ingredients: ingredients?.map(\.ingredient) ?? [],
            allergens: Set((allergens ?? []).compactMap(Allergen.init(apiValue:))),
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
    var nutritionScore: Int?
    var ingredientScore: Int?
    var processingScore: Int?
    var confidenceScore: Int?
}

private struct ConfidenceDTO: Decodable {
    var value: Int?
    var label: String?
    var source: String?
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
    var optiFit: Int?
    var whyBetter: [String]?
    var paidPlacement: Bool?

    var suggestion: ProductAlternativeSuggestion {
        ProductAlternativeSuggestion(
            gtin: gtin,
            name: name,
            brand: brand,
            optiFit: optiFit ?? 0,
            whyBetter: whyBetter ?? [],
            paidPlacement: paidPlacement ?? false
        )
    }
}

private struct HistoryEntryDTO: Decodable {
    var id: String?
    var gtin: String?
    var product: ProductDTO?
    var source: String?
    var resultStatus: String?
    var optiScore: Int?
    var optiFit: Int?
    var createdAt: String?

    func historyEntry() throws -> HistoryEntry {
        let parsedSource = ScanSource(apiValue: source ?? "") ?? .barcode
        let parsedDate = Date.optiyouAPI(createdAt) ?? .now

        guard let product else {
            if resultStatus == "missing_product",
               let gtin {
                return HistoryEntry(
                    id: id ?? UUID().uuidString,
                    missingGTIN: gtin,
                    source: parsedSource,
                    date: parsedDate
                )
            }
            throw OptiyouAPIError.missingProduct
        }

        var parsedProduct = try product.product()
        if let optiScore, let optiFit {
            parsedProduct.serverResult = parsedProduct.historyScore(optiScore: optiScore, optiFit: optiFit)
        }

        return HistoryEntry(
            id: id ?? UUID().uuidString,
            product: parsedProduct,
            source: parsedSource,
            date: parsedDate,
            resultStatus: resultStatus ?? "known"
        )
    }
}

private struct ContributionDTO: Decodable {
    var id: String?
    var status: String?
}

private struct UploadDTO: Decodable {
    var kind: String
    var url: String?
    var expiresAt: String?

    var contributionUpload: ContributionUpload? {
        guard let kind = ContributionDraft.PhotoKind(apiValue: kind),
              let url,
              let uploadURL = URL(string: url) else {
            return nil
        }

        return ContributionUpload(
            kind: kind,
            url: uploadURL,
            expiresAt: Date.optiyouAPI(expiresAt)
        )
    }
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

private extension URL {
    static func httpURL(string: String) -> URL? {
        guard let url = URL(string: string),
              url.scheme == "http" || url.scheme == "https" else {
            return nil
        }
        return url
    }
}

private extension UserPreference {
    var apiValue: String {
        switch self {
        case .lowSugar: "low_sugar"
        case .highProtein: "high_protein"
        case .vegetarian: "vegetarian"
        case .vegan: "vegan"
        case .glutenFree: "gluten_free"
        case .dairyFree: "dairy_free"
        case .avoidArtificialSweeteners: "avoid_artificial_sweeteners"
        case .avoidDyes: "avoid_synthetic_dyes"
        case .avoidPreservatives: "avoid_preservatives"
        case .kidsMode: "kids_mode"
        case .budgetSensitive: "budget_sensitive"
        }
    }
}

private extension Allergen {
    init?(apiValue: String) {
        switch apiValue {
        case "dairy": self = .dairy
        case "gluten": self = .gluten
        case "peanut": self = .peanut
        case "tree_nut": self = .treeNut
        case "soy": self = .soy
        case "egg": self = .egg
        case "fish": self = .fish
        case "shellfish": self = .shellfish
        case "sesame": self = .sesame
        default: return nil
        }
    }

    var apiValue: String {
        switch self {
        case .treeNut: "tree_nut"
        default: rawValue
        }
    }
}

private extension ScanSource {
    init?(apiValue: String) {
        switch apiValue {
        case "barcode": self = .barcode
        case "manual_search": self = .manualSearch
        case "nutrition_photo": self = .nutritionPhoto
        case "ingredients_photo": self = .ingredientsPhoto
        default: return nil
        }
    }

    var apiValue: String {
        switch self {
        case .barcode: "barcode"
        case .manualSearch: "manual_search"
        case .nutritionPhoto: "nutrition_photo"
        case .ingredientsPhoto: "ingredients_photo"
        }
    }
}

private extension ContributionDraft.PhotoKind {
    init?(apiValue: String) {
        switch apiValue {
        case "front_package": self = .frontPackage
        case "nutrition_label": self = .nutritionLabel
        case "ingredients_label": self = .ingredientsLabel
        default: return nil
        }
    }
}

private extension Product {
    func historyScore(optiScore: Int, optiFit: Int) -> ScoreResult {
        let fallback = score(profile: UserNutritionProfile())
        return ScoreResult(
            engineVersion: "food-us-ca-v1",
            optiScore: Score(value: optiScore, status: ScoreStatus(value: optiScore)),
            optiFit: Score(value: optiFit, status: ScoreStatus(value: optiFit)),
            confidence: fallback.confidence,
            verdict: fallback.verdict,
            reasons: fallback.reasons,
            warnings: fallback.warnings
        )
    }
}

private extension ScoreReason {
    init(reasonCode: String, product: Product) {
        switch reasonCode {
        case "NUTRI_ADDED_SUGAR_HIGH":
            self.init(title: "Added sugar", detail: "\(formatted(product.nutrition.addedSugarGrams))g added sugar lowers the score.", impact: .negative)
        case "NUTRI_ADDED_SUGAR_LOW":
            self.init(title: "Low added sugar", detail: "\(formatted(product.nutrition.addedSugarGrams))g added sugar supports the score.", impact: .positive)
        case "NUTRI_FIBER_GOOD":
            self.init(title: "Fiber context", detail: "\(formatted(product.nutrition.fiberGrams))g fiber supports a stronger score.", impact: .positive)
        case "NUTRI_PROTEIN_GOOD", "PREF_HIGH_PROTEIN_MATCH":
            self.init(title: "Protein support", detail: "\(formatted(product.nutrition.proteinGrams))g protein supports your profile.", impact: .positive)
        case "NUTRI_SODIUM_HIGH":
            self.init(title: "Sodium", detail: "\(product.nutrition.sodiumMilligrams)mg sodium lowers the score.", impact: .negative)
        case "ING_SYNTHETIC_DYE":
            self.init(title: "Synthetic dye", detail: "A synthetic dye flag appears in the ingredient list.", impact: .negative)
        case "ING_ARTIFICIAL_SWEETENER":
            self.init(title: "Artificial sweetener", detail: "An artificial sweetener flag appears in the ingredient list.", impact: .negative)
        case "ING_PRESERVATIVE":
            self.init(title: "Preservative", detail: "A preservative flag appears in the ingredient list.", impact: .negative)
        case "ING_ULTRA_PROCESSED_MARKER", "PROCESSING_HIGH":
            self.init(title: "Processing", detail: "Processing markers lower the product-quality score.", impact: .negative)
        case "PROCESSING_MINIMAL":
            self.init(title: "Processing", detail: "Fewer processing markers support the score.", impact: .positive)
        case "PREF_LOW_SUGAR_CONFLICT":
            self.init(title: "Low-sugar fit", detail: "This conflicts with your low-sugar preference.", impact: .negative)
        case "PREF_HIGH_PROTEIN_GAP":
            self.init(title: "Protein gap", detail: "This is lower protein than your selected profile prefers.", impact: .negative)
        default:
            self.init(title: reasonCode.lowercased().replacingOccurrences(of: "_", with: " "), detail: "Server reason code: \(reasonCode)", impact: .neutral)
        }
    }
}

private extension ProductWarning {
    init?(reasonCode: String, product: Product, profile: UserNutritionProfile) {
        switch reasonCode {
        case "PREF_ALLERGEN_CONFLICT":
            self.init(severity: .critical, title: "Allergen conflict", detail: "This product conflicts with an allergen in your profile.")
        case "PREF_DAIRY_FREE_CONFLICT":
            self.init(severity: .critical, title: "Contains dairy", detail: "This conflicts with your dairy-free setting.")
        case "PREF_GLUTEN_FREE_CONFLICT":
            self.init(severity: .critical, title: "Contains gluten", detail: "This conflicts with your gluten-free setting.")
        case "PREF_SYNTHETIC_DYE_CONFLICT":
            self.init(severity: .caution, title: "Synthetic dye", detail: "Your profile says to avoid synthetic dyes.")
        case "PREF_ARTIFICIAL_SWEETENER_CONFLICT":
            self.init(severity: .caution, title: "Artificial sweetener", detail: "Your profile says to avoid artificial sweeteners.")
        case "PREF_PRESERVATIVE_CONFLICT":
            self.init(severity: .info, title: "Preservative present", detail: "This may matter because of your preservative setting.")
        case "PREF_LOW_SUGAR_CONFLICT":
            self.init(severity: .caution, title: "High for your low-sugar profile", detail: "\(formatted(product.nutrition.addedSugarGrams))g added sugar per serving.")
        default:
            return nil
        }
    }
}

private extension Date {
    static func optiyouAPI(_ value: String?) -> Date? {
        guard let value else {
            return nil
        }

        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) {
            return date
        }

        return ISO8601DateFormatter().date(from: value)
    }
}

private func formatted(_ value: Double) -> String {
    value.formatted(.number.precision(.fractionLength(0...1)))
}
