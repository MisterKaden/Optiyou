import SwiftUI

struct OnboardingView: View {
    @State private var draftProfile: UserNutritionProfile
    var onComplete: (UserNutritionProfile) -> Void

    init(profile: UserNutritionProfile, onComplete: @escaping (UserNutritionProfile) -> Void) {
        _draftProfile = State(initialValue: profile)
        self.onComplete = onComplete
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Optiyou")
                            .font(.system(size: 48, weight: .black, design: .rounded))
                            .foregroundStyle(Color.optiInk)
                        Text("Scan smarter. Choose better. Built around you.")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(Color.optiGreen)
                        Text("Set the signals that change recommendations. You can adjust these anytime.")
                            .foregroundStyle(Color.optiMuted)
                    }

                    SectionCard {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Food preferences")
                                .font(.headline)
                            PreferenceToggleGrid(profile: $draftProfile)
                        }
                    }

                    SectionCard {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Allergens")
                                .font(.headline)
                            AllergenToggleGrid(profile: $draftProfile)
                        }
                    }

                    SectionCard {
                        Label("Product-label education and comparison only. Optiyou is not medical advice.", systemImage: "checkmark.shield")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.optiMuted)
                    }

                    Button {
                        onComplete(draftProfile)
                    } label: {
                        Label("Start scanning", systemImage: "barcode.viewfinder")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .tint(Color.optiGreen)
                }
                .padding(20)
            }
            .background(Color.optiBackground.ignoresSafeArea())
        }
    }
}

struct PreferenceToggleGrid: View {
    @Binding var profile: UserNutritionProfile

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 142), spacing: 10)], spacing: 10) {
            ForEach(UserPreference.allCases) { preference in
                TogglePill(
                    title: preference.title,
                    isOn: Binding(
                        get: { profile.preferences.contains(preference) },
                        set: { profile.setPreference(preference, enabled: $0) }
                    )
                )
            }
        }
    }
}

struct AllergenToggleGrid: View {
    @Binding var profile: UserNutritionProfile

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 118), spacing: 10)], spacing: 10) {
            ForEach(Allergen.allCases) { allergen in
                TogglePill(
                    title: allergen.title,
                    isOn: Binding(
                        get: { profile.allergens.contains(allergen) },
                        set: { profile.setAllergen(allergen, enabled: $0) }
                    )
                )
            }
        }
    }
}

private struct TogglePill: View {
    var title: String
    @Binding var isOn: Bool

    var body: some View {
        Button {
            isOn.toggle()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                Text(title)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
                Spacer(minLength: 0)
            }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(isOn ? Color.white : Color.optiInk)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(minHeight: 46)
            .background(isOn ? Color.optiGreen : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(isOn ? Color.optiGreen : Color.optiLine, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityValue(isOn ? "Selected" : "Not selected")
    }
}
