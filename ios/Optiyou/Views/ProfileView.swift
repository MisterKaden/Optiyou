import SwiftUI

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Profile")
                    .font(.largeTitle.weight(.black))
                    .foregroundStyle(Color.optiInk)

                SectionCard {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Personalization")
                            .font(.headline)
                        PreferenceToggleGrid(profile: $store.profile)
                    }
                }

                SectionCard {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Allergens")
                            .font(.headline)
                        AllergenToggleGrid(profile: $store.profile)
                    }
                }

                SectionCard {
                    VStack(alignment: .leading, spacing: 12) {
                        NavigationLink {
                            PremiumView()
                        } label: {
                            Label("Premium", systemImage: "sparkles")
                        }

                        NavigationLink {
                            ContributeView()
                        } label: {
                            Label("Contribute product data", systemImage: "square.and.pencil")
                        }
                    }
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.optiGreen)
                }
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("Profile")
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

struct PremiumView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Premium")
                    .font(.largeTitle.weight(.black))
                premiumRow("Family profiles", "Separate OptiFit scoring for kids, partners, and household needs.")
                premiumRow("AI follow-up", "Ask for label explanations, swap rationale, and pantry comparisons.")
                premiumRow("Advanced history", "Keep deeper scan history, pantry tools, and product comparisons.")
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("Premium")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    dismiss()
                }
            }
        }
    }

    private func premiumRow(_ title: String, _ detail: String) -> some View {
        SectionCard {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline.weight(.black))
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Color.optiMuted)
            }
        }
    }
}

struct ContributeView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Contribute")
                    .font(.largeTitle.weight(.black))
                SectionCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Photo extraction is lower confidence until verified.", systemImage: "camera.viewfinder")
                        Label("Community data never overrides deterministic scoring rules.", systemImage: "checkmark.shield")
                        Label("No paid rankings, sponsored swaps, or score manipulation.", systemImage: "hand.raised")
                    }
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.optiInk)
                }
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("Contribute")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    dismiss()
                }
            }
        }
    }
}
