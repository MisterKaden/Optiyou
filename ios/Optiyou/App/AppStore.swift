import Foundation

final class AppStore: ObservableObject {
    @Published var profile = UserNutritionProfile(
        preferences: [.lowSugar, .highProtein, .avoidDyes],
        allergens: []
    )
    @Published private(set) var history: [ScanEvent] = []
    @Published var savedProductIDs: Set<Product.ID> = []

    init() {
        history = [
            ScanEvent(product: SampleCatalog.products[1], source: .barcode, date: .now.addingTimeInterval(-3_600)),
            ScanEvent(product: SampleCatalog.products[2], source: .ingredientsPhoto, date: .now.addingTimeInterval(-86_400))
        ]
        savedProductIDs = [SampleCatalog.products[0].id]
    }

    func recordScan(_ product: Product, source: ScanSource = .barcode) {
        history.removeAll { $0.product.id == product.id }
        history.insert(ScanEvent(product: product, source: source, date: .now), at: 0)
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
    }
}

struct ScanEvent: Identifiable, Hashable {
    let id = UUID()
    let product: Product
    let source: ScanSource
    let date: Date
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
