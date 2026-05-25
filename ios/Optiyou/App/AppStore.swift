import Foundation

@MainActor
final class AppStore: ObservableObject {
    @Published var profile = UserNutritionProfile(
        preferences: [.lowSugar, .highProtein, .avoidDyes],
        allergens: []
    )
    @Published private(set) var history: [HistoryEntry] = []
    @Published var savedProductIDs: Set<Product.ID> = []
    @Published var isPremium = false

    private let apiClient: OptiyouAPIClient
    private let parser = ProductParser()

    init(apiClient: OptiyouAPIClient = .live) {
        self.apiClient = apiClient

        history = [
            HistoryEntry(product: SampleCatalog.products[1], source: .barcode, date: .now.addingTimeInterval(-3_600)),
            HistoryEntry(product: SampleCatalog.products[3], source: .ingredientsPhoto, date: .now.addingTimeInterval(-86_400), isFavorite: true),
            HistoryEntry(product: SampleCatalog.products[2], source: .manualSearch, date: .now.addingTimeInterval(-172_800))
        ]
        savedProductIDs = [SampleCatalog.products[0].id]
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

    func scanBarcode(_ gtin: String) async -> ScanLookupOutcome {
        if let card = try? await apiClient.scan(gtin: gtin, profile: profile) {
            let product = parser.parse(StructuredProductInput(source: .barcode, product: card.product))
            recordScan(product, source: .barcode)
            return .product(product)
        }

        if let product = SampleCatalog.product(barcode: gtin) {
            let parsedProduct = parser.parse(StructuredProductInput(source: .barcode, product: product))
            recordScan(parsedProduct, source: .barcode)
            return .product(parsedProduct)
        }

        return .contribution(ContributionDraft.missingProduct(gtin: gtin))
    }

    func searchProducts(query: String) -> [Product] {
        guard query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else {
            return []
        }

        return SampleCatalog.search(query)
    }

    func recommendationPairs(limit: Int = 6) -> [RecommendationPair] {
        let candidates = history.map(\.product) + SampleCatalog.products
        var seen = Set<String>()
        let uniqueProducts = candidates.filter { product in
            if seen.contains(product.id) {
                return false
            }
            seen.insert(product.id)
            return true
        }

        return uniqueProducts.compactMap { product in
            SampleCatalog.recommendationPair(for: product, profile: profile)
        }
        .prefix(limit)
        .map { $0 }
    }

    func overviewBuckets() -> [OverviewBucket] {
        let statuses: [ScoreStatus] = [.excellent, .good, .watch, .poor]
        let scoredHistory = history.map { ScoringEngine().score(product: $0.product, profile: profile).optiFit.status }

        return statuses.map { status in
            OverviewBucket(status: status, count: scoredHistory.filter { $0 == status }.count)
        }
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
