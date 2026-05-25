import Foundation

@MainActor
final class AppStore: ObservableObject {
    @Published var profile = UserNutritionProfile(
        preferences: [.lowSugar, .highProtein, .avoidDyes],
        allergens: []
    )
    @Published private(set) var history: [HistoryEntry] = []
    @Published private(set) var isLoadingHistory = false
    @Published private(set) var historyErrorMessage: String?
    @Published var savedProductIDs: Set<Product.ID> = []
    @Published var isPremium = false

    private var apiClient: OptiyouAPIClient
    private var hasLoadedHistory = false

    init(apiClient: OptiyouAPIClient = .live) {
        self.apiClient = apiClient
    }

    func recordScan(_ product: Product, source: ScanSource = .barcode) {
        history.removeAll { $0.product.id == product.id }
        history.insert(HistoryEntry(product: product, source: source, date: .now, isFavorite: savedProductIDs.contains(product.id)), at: 0)
    }

    func removeHistoryEntry(_ entry: HistoryEntry) {
        history.removeAll { $0.id == entry.id }
    }

    func removeProductFromHistory(_ product: Product) {
        history.removeAll { $0.product.id == product.id }
    }

    func isSaved(_ product: Product) -> Bool {
        savedProductIDs.contains(product.id)
    }

    func toggleSaved(_ product: Product) {
        if savedProductIDs.contains(product.id) {
            savedProductIDs.remove(product.id)
        } else {
            savedProductIDs.insert(product.id)
        }

        for index in history.indices where history[index].product.id == product.id {
            history[index].isFavorite = savedProductIDs.contains(product.id)
        }
    }

    func loadHistoryIfNeeded() async {
        guard hasLoadedHistory == false else {
            return
        }
        await loadHistory()
    }

    func loadHistory() async {
        isLoadingHistory = true
        historyErrorMessage = nil

        do {
            let remoteHistory = try await apiClient.history()
            history = remoteHistory.map { entry in
                var copy = entry
                copy.isFavorite = savedProductIDs.contains(entry.product.id)
                return copy
            }
            hasLoadedHistory = true
        } catch {
            historyErrorMessage = userFacingMessage(for: error)
        }

        isLoadingHistory = false
    }

    func lookupProduct(gtin: String, source: ScanSource) async -> ScanLookupOutcome {
        do {
            let outcome = try await apiClient.scan(gtin: gtin, profile: profile, source: source)
            if case let .product(product) = outcome {
                recordScan(product, source: source)
            }
            return outcome
        } catch {
            return .failure(userFacingMessage(for: error))
        }
    }

    func uploadContributionPhoto(draft: ContributionDraft, kind: ContributionDraft.PhotoKind, imageData: Data) async throws {
        guard let upload = draft.upload(for: kind) else {
            throw OptiyouAPIError.missingUploadTarget
        }

        try await apiClient.uploadContributionPhoto(imageData, to: upload)
    }

    func appleSignInNonce() async throws -> AppleSignInNonce {
        try await apiClient.appleSignInNonce()
    }

    func completeAppleSignIn(identityToken: String, nonce: String) async throws {
        let session = try await apiClient.exchangeAppleIdentityToken(identityToken, nonce: nonce)
        apiClient = apiClient.withAccessToken(session.accessToken)
        hasLoadedHistory = false
        await loadHistory()
    }

    func signOut() {
        OptiyouAPIClient.clearStoredAuthSession()
        apiClient = .live
        history = []
        hasLoadedHistory = false
    }

    func searchProducts(query: String) async throws -> [Product] {
        guard query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else {
            return []
        }

        return try await apiClient.searchProducts(query: query)
    }

    func recommendationPairs(limit: Int = 6) -> [RecommendationPair] {
        let candidates = history.map(\.product)
        var seen = Set<String>()
        let uniqueProducts = candidates.filter { product in
            if seen.contains(product.id) {
                return false
            }
            seen.insert(product.id)
            return true
        }

        return uniqueProducts.compactMap { product in
            recommendationPair(for: product, in: uniqueProducts)
        }
        .prefix(limit)
        .map { $0 }
    }

    func overviewBuckets() -> [OverviewBucket] {
        let statuses: [ScoreStatus] = [.excellent, .good, .watch, .poor]
        let scoredHistory = history.map { $0.product.score(profile: profile).optiFit.status }

        return statuses.map { status in
            OverviewBucket(status: status, count: scoredHistory.filter { $0 == status }.count)
        }
    }

    private func recommendationPair(for product: Product, in products: [Product]) -> RecommendationPair? {
        let currentFit = product.score(profile: profile).optiFit.value
        guard let replacement = products
            .filter({ $0.id != product.id && $0.category == product.category })
            .map({ ($0, $0.score(profile: profile).optiFit.value) })
            .filter({ $0.1 > currentFit })
            .sorted(by: { $0.1 > $1.1 })
            .first?.0 else {
            return nil
        }

        return RecommendationPair(
            current: product,
            replacement: replacement,
            reasons: swapReasons(from: product, to: replacement)
        )
    }

    private func swapReasons(from current: Product, to replacement: Product) -> [String] {
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

        return reasons.isEmpty ? ["Higher OptiFit in the same category"] : reasons
    }

    private func userFacingMessage(for error: Error) -> String {
        if let localized = error as? LocalizedError,
           let description = localized.errorDescription {
            return description
        }
        return "Optiyou could not reach the live API. Check your connection and API configuration."
    }
}

enum ScanSource: String, CaseIterable, Hashable, Identifiable {
    case barcode
    case nutritionPhoto
    case ingredientsPhoto
    case manualSearch

    var id: String { rawValue }

    var title: String {
        switch self {
        case .barcode: "Barcode"
        case .nutritionPhoto: "Nutrition"
        case .ingredientsPhoto: "Ingredients"
        case .manualSearch: "Manual search"
        }
    }

    var systemImage: String {
        switch self {
        case .barcode: "barcode.viewfinder"
        case .nutritionPhoto: "tablecells"
        case .ingredientsPhoto: "text.viewfinder"
        case .manualSearch: "magnifyingglass"
        }
    }
}
