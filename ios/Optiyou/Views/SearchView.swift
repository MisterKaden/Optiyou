import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var store: AppStore
    var openSheet: (AppSheet) -> Void
    var openProduct: (Product) -> Void
    @State private var query = ""
    @State private var results: [Product] = []
    @State private var isSearching = false
    @State private var loadingProductID: Product.ID?
    @State private var errorMessage: String?
    @State private var contributionDraft: ContributionDraft?

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

                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    SearchPremiumCard(openSheet: openSheet)
                } else if isSearching {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 36)
                } else if let errorMessage {
                    EmptyStateView(
                        systemImage: "wifi.exclamationmark",
                        title: "Search unavailable",
                        message: errorMessage
                    )
                } else if results.isEmpty {
                    EmptyStateView(
                        systemImage: "magnifyingglass",
                        title: "No product match",
                        message: "Try the barcode digits, brand, or product name."
                    )
                } else {
                    SectionCard {
                        VStack(spacing: 0) {
                            ForEach(results) { product in
                                Button {
                                    Task {
                                        await openSearchResult(product)
                                    }
                                } label: {
                                    ZStack(alignment: .trailing) {
                                        ProductListRow(product: product, score: product.score(profile: store.profile), subtitle: product.category.title)
                                            .padding(.vertical, 10)
                                        if loadingProductID == product.id {
                                            ProgressView()
                                        }
                                    }
                                }
                                .disabled(loadingProductID != nil)
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
        .task(id: query) {
            await refreshSearch()
        }
        .sheet(item: $contributionDraft) { draft in
            ContributionDraftSheet(draft: draft)
        }
    }

    private func refreshSearch() async {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard term.isEmpty == false else {
            results = []
            errorMessage = nil
            isSearching = false
            return
        }

        isSearching = true
        errorMessage = nil
        try? await Task.sleep(for: .milliseconds(250))
        guard Task.isCancelled == false else {
            return
        }

        do {
            results = try await store.searchProducts(query: term)
        } catch {
            results = []
            errorMessage = userFacingMessage(for: error)
        }

        isSearching = false
    }

    private func openSearchResult(_ product: Product) async {
        loadingProductID = product.id
        let outcome = await store.lookupProduct(gtin: product.barcode, source: .manualSearch)
        loadingProductID = nil

        switch outcome {
        case let .product(product):
            openProduct(product)
        case let .contribution(draft):
            contributionDraft = draft
        case let .failure(message):
            errorMessage = message
        }
    }

    private func userFacingMessage(for error: Error) -> String {
        if let localized = error as? LocalizedError,
           let description = localized.errorDescription {
            return description
        }
        return "Optiyou could not reach product search."
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
