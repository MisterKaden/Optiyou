import SwiftUI

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Profile")
                    .font(.optiTitle)
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
                        Text("Skin goals")
                            .font(.headline)
                        Text("For skincare scans.")
                            .font(.footnote)
                            .foregroundStyle(Color.optiMuted)
                        SkinGoalToggleGrid(profile: $store.profile)
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
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(Color.optiInk)
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
                    .font(.optiTitle)
                premiumRow("Family profiles", "Separate fits for your household.")
                premiumRow("AI follow-up", "Ask for label and swap context.")
                premiumRow("Advanced history", "Pantry tools and deeper comparisons.")
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
                    .font(.headline.weight(.semibold))
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
                    .font(.optiTitle)
                SectionCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Add clear label photos.", systemImage: "camera.viewfinder")
                        Label("Evidence stays protected.", systemImage: "checkmark.shield")
                        Label("No paid rankings.", systemImage: "hand.raised")
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
