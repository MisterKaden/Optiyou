import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var store: AppStore
    var openSheet: (AppSheet) -> Void
    var openProduct: (Product) -> Void
    @State private var query = ""

    private var results: [Product] {
        store.searchProducts(query: query)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Search")
                    .font(.largeTitle.weight(.black))
                    .foregroundStyle(Color.optiInk)

                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(Color.optiMuted)
                    TextField("All food products", text: $query)
                        .textInputAutocapitalization(.never)
                        .submitLabel(.search)
                }
                .padding(14)
                .background(Color.optiLine.opacity(0.48))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                if query.isEmpty {
                    SearchPremiumCard(openSheet: openSheet)
                } else if results.isEmpty {
                    EmptyStateView(
                        systemImage: "magnifyingglass",
                        title: "No local match",
                        message: "Basic food search is free. Backend semantic search will expand this beyond the sample catalog."
                    )
                } else {
                    SectionCard {
                        VStack(spacing: 0) {
                            ForEach(results) { product in
                                let score = ScoringEngine().score(product: product, profile: store.profile)
                                Button {
                                    openProduct(product)
                                } label: {
                                    ProductListRow(product: product, score: score, subtitle: product.category.title)
                                        .padding(.vertical, 10)
                                }
                                .buttonStyle(.plain)

                                if product.id != results.last?.id {
                                    Divider()
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            AppInfoToolbar(openSheet: openSheet)
        }
    }
}

private struct SearchPremiumCard: View {
    var openSheet: (AppSheet) -> Void

    var body: some View {
        SectionCard {
            VStack(spacing: 16) {
                Text("Premium")
                    .font(.caption.weight(.black))
                    .textCase(.uppercase)
                    .foregroundStyle(Color.optiGreen)
                Text("Search smarter with Optiyou")
                    .font(.title2.weight(.black))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.optiInk)
                Text("Free search covers food basics. Premium adds family profiles, offline cache, pantry tools, and deeper AI explanations.")
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.optiMuted)
                Button {
                    openSheet(.premium)
                } label: {
                    Text("See premium")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .tint(Color.optiGreen)
            }
        }
        .padding(.top, 180)
    }
}
