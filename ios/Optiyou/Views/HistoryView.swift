import SwiftUI

struct HistoryView: View {
    @EnvironmentObject private var store: AppStore
    var openSheet: (AppSheet) -> Void
    var openProduct: (Product) -> Void
    @State private var showsFavoritesOnly = false
    @State private var isEditingHistory = false

    private var visibleHistory: [HistoryEntry] {
        showsFavoritesOnly ? store.history.filter(\.isFavorite) : store.history
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Button {
                        showsFavoritesOnly.toggle()
                    } label: {
                        Text(showsFavoritesOnly ? "All scans" : "Favorites")
                    }
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(Color.optiGreen)

                    Spacer()

                    Button {
                        isEditingHistory.toggle()
                    } label: {
                        Text(isEditingHistory ? "OK" : "Edit")
                    }
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.optiGreen)
                }

                Text(showsFavoritesOnly ? "Favorites" : "History")
                    .font(.largeTitle.weight(.black))
                    .foregroundStyle(Color.optiInk)

                if visibleHistory.isEmpty {
                    EmptyStateView(
                        systemImage: showsFavoritesOnly ? "bookmark" : "clock",
                        title: showsFavoritesOnly ? "No favorites yet" : "No scans yet",
                        message: showsFavoritesOnly ? "Save products from a result page to keep them close." : "Scanned foods will appear here with their source and latest score."
                    )
                } else {
                    ForEach(visibleHistory) { event in
                        let score = ScoringEngine().score(product: event.product, profile: store.profile)
                        HStack(spacing: 10) {
                            if isEditingHistory {
                                Button {
                                    store.removeHistoryEntry(event)
                                } label: {
                                    Image(systemName: "minus.circle.fill")
                                        .font(.title2)
                                        .foregroundStyle(Color.optiRed)
                                }
                                .accessibilityLabel("Delete \(event.product.name) from history")
                            }

                            Button {
                                openProduct(event.product)
                            } label: {
                                ProductListRow(
                                    product: event.product,
                                    score: score,
                                    subtitle: relativeDate(event.date),
                                    showsChevron: isEditingHistory == false
                                )
                                .padding(.vertical, 10)
                                .background(Color.white)
                            }
                            .buttonStyle(.plain)
                        }

                        Divider()
                    }
                }
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            AppInfoToolbar(openSheet: openSheet)
        }
    }

    private func relativeDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: .now)
    }
}
