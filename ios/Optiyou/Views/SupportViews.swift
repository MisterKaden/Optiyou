import SwiftUI

struct AccountView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore

    var body: some View {
        List {
            Section("Personal information") {
                LabeledContent("First name", value: "Kaden")
                LabeledContent("Email", value: "kadenprete@live.com")
                NavigationLink("Profile preferences") {
                    ProfileView()
                }
            }

            Section("Subscription") {
                NavigationLink {
                    PremiumView()
                } label: {
                    Text(store.isPremium ? "Premium active" : "Become a Premium member")
                }
            }

            Section {
                Button(role: .destructive) {
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
                        let score = ScoringEngine().score(product: entry.product, profile: store.profile)
                        ProductListRow(product: entry.product, score: score, subtitle: "Recently scanned")
                            .padding(.vertical, 6)
                    }
                    Button("See more") {
                    }
                }
            }

            Section("General problems") {
                NavigationLink("The scanner does not work") {
                    HelpArticleView(title: "The scanner does not work", bodyText: "Check camera permission, lighting, barcode damage, and device support. You can always use manual search or contribute label photos.")
                }
                NavigationLink("The product has no barcode") {
                    HelpArticleView(title: "The product has no barcode", bodyText: "Use Scan Nutrition or Scan Ingredients to start a contribution with lower confidence until the label is reviewed.")
                }
                NavigationLink("Other problem") {
                    HelpArticleView(title: "Other problem", bodyText: "Send a correction through the product options menu so the review queue can inspect it.")
                }
            }

            Section("About Optiyou") {
                NavigationLink("What is Optiyou's mission?") {
                    HelpArticleView(title: "What is Optiyou's mission?", bodyText: "Optiyou helps people understand packaged food labels and compare products without paid rankings or score manipulation.")
                }
                NavigationLink("Is Optiyou independent?") {
                    HelpArticleView(title: "Is Optiyou independent?", bodyText: "Recommendations are not paid placements. Scores come from deterministic methodology and approved evidence.")
                }
                NavigationLink("How are products rated?") {
                    HelpArticleView(title: "How are products rated?", bodyText: "AI extracts and explains labels, but final OptiScore and OptiFit come from a versioned scoring engine.")
                }
                NavigationLink("Other question") {
                    HelpArticleView(title: "Other question", bodyText: "Ask Optiyou can explain product fields, reason codes, methodology, and approved evidence.")
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
                    .font(.largeTitle.weight(.black))
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
