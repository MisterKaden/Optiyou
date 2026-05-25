import SwiftUI

struct ScannerView: View {
    var openProduct: (Product, ScanSource) -> Void
    @State private var query = ""

    private let parser = ProductParser()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Scan smarter. Choose better.")
                        .font(.largeTitle.weight(.black))
                        .foregroundStyle(Color.optiInk)
                    Text("Packaged food scanner for the U.S. and Canada.")
                        .font(.headline)
                        .foregroundStyle(Color.optiMuted)
                }

                scannerPanel

                manualSearch

                VStack(alignment: .leading, spacing: 12) {
                    Text("Recent examples")
                        .font(.title3.weight(.black))
                    ForEach(SampleCatalog.products) { product in
                        let result = ScoringEngine().score(product: product, profile: UserNutritionProfile(preferences: [.lowSugar], allergens: []))
                        Button {
                            open(product, source: .manualSearch)
                        } label: {
                            ProductRow(product: product, score: result)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("Scan")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var scannerPanel: some View {
        SectionCard {
            VStack(spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color.optiInk)
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(Color.white.opacity(0.86), style: StrokeStyle(lineWidth: 2, dash: [16, 10]))
                        .padding(24)
                    VStack(spacing: 10) {
                        Image(systemName: "barcode.viewfinder")
                            .font(.system(size: 46, weight: .semibold))
                        Text("Ready to scan")
                            .font(.title3.weight(.black))
                    }
                    .foregroundStyle(.white)
                }
                .frame(height: 300)

                Button {
                    open(SampleCatalog.products[1], source: .barcode)
                } label: {
                    Label("Scan Barcode", systemImage: "barcode.viewfinder")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .tint(Color.optiGreen)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    scanModeButton(title: "Scan Nutrition", source: .nutritionPhoto, product: SampleCatalog.products[4])
                    scanModeButton(title: "Scan Ingredients", source: .ingredientsPhoto, product: SampleCatalog.products[3])
                    scanModeButton(title: "Search Manually", source: .manualSearch, product: SampleCatalog.products[0])
                    scanModeButton(title: "Compare Food", source: .manualSearch, product: SampleCatalog.products[2])
                }
            }
        }
    }

    private var manualSearch: some View {
        SectionCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Manual search", systemImage: "magnifyingglass")
                    .font(.headline)
                TextField("Search cereal, yogurt, snack bars...", text: $query)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.search)
                    .onSubmit {
                        if let first = filteredProducts.first {
                            open(first, source: .manualSearch)
                        }
                    }

                if query.isEmpty == false {
                    ForEach(filteredProducts) { product in
                        Button {
                            open(product, source: .manualSearch)
                        } label: {
                            HStack {
                                Text(product.name)
                                    .font(.subheadline.weight(.bold))
                                Spacer()
                                Image(systemName: "arrow.right")
                            }
                            .foregroundStyle(Color.optiInk)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var filteredProducts: [Product] {
        guard query.isEmpty == false else { return [] }
        return SampleCatalog.products.filter {
            $0.name.localizedCaseInsensitiveContains(query) ||
                $0.brand.localizedCaseInsensitiveContains(query) ||
                $0.category.title.localizedCaseInsensitiveContains(query)
        }
    }

    private func scanModeButton(title: String, source: ScanSource, product: Product) -> some View {
        Button {
            open(product, source: source)
        } label: {
            VStack(spacing: 8) {
                Image(systemName: source.systemImage)
                    .font(.title3.weight(.bold))
                Text(title)
                    .font(.caption.weight(.black))
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 72)
        }
        .buttonStyle(.bordered)
        .tint(Color.optiGreen)
    }

    private func open(_ product: Product, source: ScanSource) {
        let parsedProduct = parser.parse(StructuredProductInput(source: source, product: product))
        openProduct(parsedProduct, source)
    }
}
