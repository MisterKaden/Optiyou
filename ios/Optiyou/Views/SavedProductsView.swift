import SwiftUI

struct SavedProductsView: View {
    @EnvironmentObject private var store: AppStore
    var openProduct: (Product) -> Void

    private var savedProducts: [Product] {
        SampleCatalog.products.filter { store.savedProductIDs.contains($0.id) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Saved products")
                    .font(.largeTitle.weight(.black))
                    .foregroundStyle(Color.optiInk)

                if savedProducts.isEmpty {
                    EmptyStateView(
                        systemImage: "bookmark",
                        title: "Nothing saved",
                        message: "Save products from a result page to build a cleaner shopping list."
                    )
                } else {
                    ForEach(savedProducts) { product in
                        let score = ScoringEngine().score(product: product, profile: store.profile)
                        Button {
                            openProduct(product)
                        } label: {
                            SectionCard {
                                ProductRow(product: product, score: score)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("Saved")
        .navigationBarTitleDisplayMode(.inline)
    }
}
