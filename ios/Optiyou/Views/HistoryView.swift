import SwiftUI

struct HistoryView: View {
    @EnvironmentObject private var store: AppStore
    var openProduct: (Product) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Product history")
                    .font(.largeTitle.weight(.black))
                    .foregroundStyle(Color.optiInk)

                if store.history.isEmpty {
                    EmptyStateView(
                        systemImage: "clock",
                        title: "No scans yet",
                        message: "Scanned foods will appear here with their source and latest score."
                    )
                } else {
                    ForEach(store.history) { event in
                        let score = ScoringEngine().score(product: event.product, profile: store.profile)
                        Button {
                            openProduct(event.product)
                        } label: {
                            SectionCard {
                                VStack(alignment: .leading, spacing: 10) {
                                    ProductRow(product: event.product, score: score)
                                    Label("\(event.source.title) · \(event.date.formatted(date: .abbreviated, time: .shortened))", systemImage: event.source.systemImage)
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(Color.optiMuted)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
    }
}
