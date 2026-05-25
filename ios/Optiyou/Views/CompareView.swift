import SwiftUI

struct CompareView: View {
    @EnvironmentObject private var store: AppStore
    var openProduct: (Product) -> Void

    private let left = SampleCatalog.products[1]
    private let right = SampleCatalog.products[0]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Compare")
                    .font(.largeTitle.weight(.black))
                    .foregroundStyle(Color.optiInk)
                Text("Same-category comparison keeps swaps honest and avoids paid placement logic.")
                    .font(.headline)
                    .foregroundStyle(Color.optiMuted)

                HStack(alignment: .top, spacing: 12) {
                    comparisonColumn(product: left)
                    comparisonColumn(product: right)
                }

                SectionCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Why Optiyou prefers \(right.name)")
                            .font(.headline.weight(.black))
                        Label("Less added sugar", systemImage: "minus.circle")
                        Label("Higher fiber", systemImage: "plus.circle")
                        Label("No synthetic dye flag", systemImage: "checkmark.circle")
                    }
                    .foregroundStyle(Color.optiInk)
                }
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("Compare")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func comparisonColumn(product: Product) -> some View {
        let score = ScoringEngine().score(product: product, profile: store.profile)

        return Button {
            openProduct(product)
        } label: {
            SectionCard {
                VStack(alignment: .leading, spacing: 12) {
                    ProductThumbnail(product: product, size: 72)
                    Text(product.name)
                        .font(.headline.weight(.black))
                        .foregroundStyle(Color.optiInk)
                        .fixedSize(horizontal: false, vertical: true)
                    ScoreDial(label: "OptiFit", score: score.optiFit)
                    Text("\(formatted(product.nutrition.addedSugarGrams))g added sugar")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.optiMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
    }

    private func formatted(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...1)))
    }
}
