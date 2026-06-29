import SwiftUI

struct AccountView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore

    var body: some View {
        List {
            Section("Profile") {
                NavigationLink("Preferences") {
                    ProfileView()
                }
            }

            Section("Membership") {
                NavigationLink {
                    PremiumView()
                } label: {
                    Text(store.isPremium ? "Premium active" : "Premium")
                }
            }

            Section {
                Button(role: .destructive) {
                    store.signOut()
                } label: {
                    Text("Sign out")
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    dismiss()
                }
            }
        }
    }
}

struct HelpView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var query = ""

    private var recentProblemProducts: [HistoryEntry] {
        store.history.prefix(2).map { $0 }
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(Color.optiMuted)
                    TextField("Search", text: $query)
                }
            }

            if recentProblemProducts.isEmpty == false {
                Section("Problem with a product") {
                    ForEach(recentProblemProducts) { entry in
                        ProductListRow(product: entry.product, score: entry.product.score(profile: store.profile), subtitle: "Recently scanned")
                            .padding(.vertical, 6)
                    }
                    Button("See more") {
                    }
                }
            }

            Section("General problems") {
                NavigationLink("The scanner does not work") {
                    HelpArticleView(title: "The scanner does not work", bodyText: "Check camera permission, lighting, and barcode condition. Search also works.")
                }
                NavigationLink("The product has no barcode") {
                    HelpArticleView(title: "The product has no barcode", bodyText: "Search by name or add label photos.")
                }
                NavigationLink("Other problem") {
                    HelpArticleView(title: "Other problem", bodyText: "Send a correction from the product page.")
                }
            }

            Section("About Optiyou") {
                NavigationLink("What is Optiyou's mission?") {
                    HelpArticleView(title: "What is Optiyou's mission?", bodyText: "Optiyou helps you read labels and choose with confidence.")
                }
                NavigationLink("Is Optiyou independent?") {
                    HelpArticleView(title: "Is Optiyou independent?", bodyText: "No paid placements. No sponsored swaps.")
                }
                NavigationLink("How are products rated?") {
                    HelpArticleView(title: "How are products rated?", bodyText: "OptiScore grades the product. OptiFit reflects your profile.")
                }
                NavigationLink("Other question") {
                    HelpArticleView(title: "Other question", bodyText: "Ask Optiyou from any result.")
                }
            }
        }
        .navigationTitle("Help")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    dismiss()
                }
            }
        }
    }
}

private struct HelpArticleView: View {
    var title: String
    var bodyText: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(title)
                    .font(.optiTitle)
                Text(bodyText)
                    .font(.headline)
                    .foregroundStyle(Color.optiMuted)
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
