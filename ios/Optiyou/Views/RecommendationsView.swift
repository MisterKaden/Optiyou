import SwiftUI

struct RecommendationsView: View {
    @EnvironmentObject private var store: AppStore
    var openSheet: (AppSheet) -> Void
    var openProduct: (Product) -> Void

    private var pairs: [RecommendationPair] {
        store.recommendationPairs()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Recommendations")
                    .font(.largeTitle.weight(.black))
                    .foregroundStyle(Color.optiInk)

                if pairs.isEmpty {
                    EmptyStateView(
                        systemImage: "arrow.left.arrow.right.circle",
                        title: "No swaps yet",
                        message: "Scan more foods and Optiyou will suggest higher-scoring same-category swaps."
                    )
                } else {
                    ForEach(pairs) { pair in
                        RecommendationPairCard(pair: pair, openProduct: openProduct)
                    }
                }

                Text("Recommendations are same-category, profile-aware, and never paid placements.")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.optiMuted)
                    .padding(.horizontal, 4)
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("Recs")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            AppInfoToolbar(openSheet: openSheet)
        }
    }
}

private struct RecommendationPairCard: View {
    @EnvironmentObject private var store: AppStore
    var pair: RecommendationPair
    var openProduct: (Product) -> Void

    var body: some View {
        SectionCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 14) {
                    recommendationColumn(product: pair.current, marker: "xmark", markerColor: .optiRed)
                    Image(systemName: "chevron.right")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.optiMuted.opacity(0.5))
                        .padding(.top, 58)
                    recommendationColumn(product: pair.replacement, marker: "checkmark", markerColor: .optiGreen)
                }

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Text("Why this swap is better")
                        .font(.headline.weight(.black))
                    ForEach(pair.reasons, id: \.self) { reason in
                        Label(reason, systemImage: "checkmark.circle")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.optiInk)
                    }
                }
            }
        }
    }

    private func recommendationColumn(product: Product, marker: String, markerColor: Color) -> some View {
        let score = ScoringEngine().score(product: product, profile: store.profile)

        return Button {
            openProduct(product)
        } label: {
            VStack(alignment: .center, spacing: 8) {
                ZStack(alignment: .topLeading) {
                    ProductThumbnail(product: product, size: 118)
                    Circle()
                        .fill(markerColor)
                        .frame(width: 34, height: 34)
                        .overlay {
                            Image(systemName: marker)
                                .font(.headline.weight(.black))
                                .foregroundStyle(.white)
                        }
                        .offset(x: -8, y: -8)
                }

                Text(product.name)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.optiInk)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                Text(product.brand)
                    .font(.caption)
                    .foregroundStyle(Color.optiMuted)
                HStack(spacing: 5) {
                    RatingDot(status: score.optiFit.status, size: 10)
                    Text(score.optiFit.status.title)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.optiMuted)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}
