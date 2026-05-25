import SwiftUI

struct ProductResultView: View {
    @EnvironmentObject private var store: AppStore
    let product: Product

    private var result: ScoreResult {
        ScoringEngine().score(product: product, profile: store.profile)
    }

    private var explanation: AIExplanation {
        ExplanationComposer().compose(product: product, result: result, profile: store.profile)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                heroCard
                warningsCard
                nutritionCard
                ingredientsCard
                additivesCard
                processingCard
                allergensCard
                preferencesCard
                swapsCard
                askOptiyouCard
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle(product.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var heroCard: some View {
        SectionCard {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 14) {
                    ProductThumbnail(product: product, size: 104)

                    VStack(alignment: .leading, spacing: 8) {
                        Text(product.name)
                            .font(.title2.weight(.black))
                            .foregroundStyle(Color.optiInk)
                        Text(product.brand)
                            .font(.headline)
                            .foregroundStyle(Color.optiMuted)
                        StatusBadge(
                            title: result.confidence.label,
                            systemImage: "scope",
                            color: result.confidence.value >= 70 ? .optiGreen : .optiAmber
                        )
                    }

                    Spacer()

                    Button {
                        store.toggleSaved(product)
                    } label: {
                        Image(systemName: store.isSaved(product) ? "bookmark.fill" : "bookmark")
                            .font(.title3.weight(.bold))
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.optiGreen)
                    .accessibilityLabel(store.isSaved(product) ? "Unsave product" : "Save product")
                }

                HStack(spacing: 24) {
                    ScoreDial(label: "OptiScore", score: result.optiScore)
                    ScoreDial(label: "OptiFit", score: result.optiFit)
                    Spacer(minLength: 0)
                }

                Text(result.verdict)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(result.optiFit.status.color)

                Text("Scores are deterministic. AI explains the label, but does not decide the score.")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.optiMuted)
            }
        }
    }

    @ViewBuilder
    private var warningsCard: some View {
        if result.warnings.isEmpty == false {
            SectionCard {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Profile warnings")
                        .font(.headline)
                    ForEach(result.warnings) { warning in
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: warning.severity.systemImage)
                                .foregroundStyle(warning.severity.color)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(warning.title)
                                    .font(.subheadline.weight(.black))
                                Text(warning.detail)
                                    .font(.footnote)
                                    .foregroundStyle(Color.optiMuted)
                            }
                        }
                    }
                }
            }
        }
    }

    private var nutritionCard: some View {
        ResultDisclosureCard(title: "Nutrition", systemImage: "chart.bar.doc.horizontal") {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                NutritionMetric(label: "Calories", value: "\(product.nutrition.calories)")
                NutritionMetric(label: "Added sugar", value: "\(formatted(product.nutrition.addedSugarGrams))g")
                NutritionMetric(label: "Protein", value: "\(formatted(product.nutrition.proteinGrams))g")
                NutritionMetric(label: "Fiber", value: "\(formatted(product.nutrition.fiberGrams))g")
                NutritionMetric(label: "Sodium", value: "\(product.nutrition.sodiumMilligrams)mg")
            }

            Divider()

            ForEach(result.reasons) { reason in
                Label(reason.title, systemImage: reason.impact.systemImage)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(reason.impact.color)
                Text(reason.detail)
                    .font(.footnote)
                    .foregroundStyle(Color.optiMuted)
            }
        }
    }

    private var ingredientsCard: some View {
        ResultDisclosureCard(title: "Ingredients", systemImage: "list.bullet.rectangle") {
            ForEach(product.ingredients) { ingredient in
                IngredientExplanationRow(ingredient: ingredient)
            }
        }
    }

    private var additivesCard: some View {
        ResultDisclosureCard(title: "Additives", systemImage: "testtube.2") {
            let additives = product.ingredients.filter { $0.flags.subtracting([.addedSugar, .containsDairy, .containsGluten]).isEmpty == false }
            if additives.isEmpty {
                Text("No major additive flags in this sample label.")
                    .font(.footnote)
                    .foregroundStyle(Color.optiMuted)
            } else {
                ForEach(additives) { ingredient in
                    IngredientExplanationRow(ingredient: ingredient)
                }
            }
        }
    }

    private var processingCard: some View {
        ResultDisclosureCard(title: "Processing", systemImage: "shippingbox") {
            Text(product.processingLevel.title)
                .font(.headline)
            Text(processingExplanation)
                .font(.footnote)
                .foregroundStyle(Color.optiMuted)
        }
    }

    private var allergensCard: some View {
        ResultDisclosureCard(title: "Allergens", systemImage: "exclamationmark.shield") {
            if product.allergens.isEmpty {
                Text("No common allergen flags are present in the structured sample.")
                    .font(.footnote)
                    .foregroundStyle(Color.optiMuted)
            } else {
                ForEach(Array(product.allergens).sorted { $0.title < $1.title }) { allergen in
                    Label(allergen.title, systemImage: "exclamationmark.triangle")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(store.profile.allergens.contains(allergen) ? Color.optiRed : Color.optiAmber)
                }
            }
        }
    }

    private var preferencesCard: some View {
        ResultDisclosureCard(title: "Preferences", systemImage: "person.text.rectangle") {
            if store.profile.preferences.isEmpty {
                Text("No preferences are active. OptiFit currently mirrors general product quality.")
                    .font(.footnote)
                    .foregroundStyle(Color.optiMuted)
            } else {
                ForEach(Array(store.profile.preferences).sorted { $0.title < $1.title }) { preference in
                    Label(preference.title, systemImage: "checkmark.circle")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.optiGreen)
                }
            }
        }
    }

    private var swapsCard: some View {
        ResultDisclosureCard(title: "Better Swaps", systemImage: "arrow.triangle.2.circlepath") {
            let swaps = SampleCatalog.betterSwaps(for: product, profile: store.profile)
            if swaps.isEmpty {
                Text("No higher-scoring same-category swap is available in the local sample catalog.")
                    .font(.footnote)
                    .foregroundStyle(Color.optiMuted)
            } else {
                ForEach(swaps) { swap in
                    let swapResult = ScoringEngine().score(product: swap, profile: store.profile)
                    VStack(alignment: .leading, spacing: 8) {
                        ProductRow(product: swap, score: swapResult)
                        Text(swapReason(from: product, to: swap))
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.optiMuted)
                    }
                    if swap.id != swaps.last?.id {
                        Divider()
                    }
                }
            }
        }
    }

    private var askOptiyouCard: some View {
        ResultDisclosureCard(title: "Ask Optiyou", systemImage: "sparkles") {
            Text(explanation.summary)
                .font(.subheadline.weight(.bold))
            ForEach(explanation.bullets, id: \.self) { bullet in
                Label(bullet, systemImage: "checkmark")
                    .font(.footnote)
                    .foregroundStyle(Color.optiMuted)
            }
            Button {
            } label: {
                Label(explanation.suggestedQuestion, systemImage: "bubble.left.and.text.bubble.right")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(Color.optiGreen)
        }
    }

    private var processingExplanation: String {
        switch product.processingLevel {
        case .minimal:
            "Shorter ingredient list and fewer processing markers."
        case .moderate:
            "Some processing is expected for packaged food, with no automatic penalty unless markers stack up."
        case .high:
            "Multiple markers suggest heavier processing, which lowers the general score."
        }
    }

    private func swapReason(from current: Product, to swap: Product) -> String {
        if swap.nutrition.addedSugarGrams < current.nutrition.addedSugarGrams {
            return "Better because it has less added sugar in the same category."
        }

        if swap.nutrition.fiberGrams > current.nutrition.fiberGrams {
            return "Better because it has more fiber for a similar use."
        }

        if swap.nutrition.proteinGrams > current.nutrition.proteinGrams {
            return "Better because it has more protein for your profile."
        }

        return "Better because its same-category OptiFit is higher for your profile."
    }

    private func formatted(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...1)))
    }
}

private struct ResultDisclosureCard<Content: View>: View {
    var title: String
    var systemImage: String
    var content: Content

    init(title: String, systemImage: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.systemImage = systemImage
        self.content = content()
    }

    var body: some View {
        SectionCard {
            DisclosureGroup {
                VStack(alignment: .leading, spacing: 12) {
                    content
                }
                .padding(.top, 12)
            } label: {
                Label(title, systemImage: systemImage)
                    .font(.headline.weight(.black))
                    .foregroundStyle(Color.optiInk)
            }
            .tint(Color.optiGreen)
        }
    }
}

private struct NutritionMetric: View {
    var label: String
    var value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.title3.weight(.black))
                .foregroundStyle(Color.optiInk)
            Text(label)
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.optiMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.optiBackground)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct IngredientExplanationRow: View {
    var ingredient: Ingredient

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(ingredient.name.capitalized)
                    .font(.subheadline.weight(.black))
                Spacer()
                if ingredient.flags.isEmpty == false {
                    StatusBadge(title: "\(ingredient.flags.count) flag", systemImage: "flag", color: .optiAmber)
                }
            }
            Text(explanation)
                .font(.footnote)
                .foregroundStyle(Color.optiMuted)
            if ingredient.flags.isEmpty == false {
                Text(ingredient.flags.map(\.title).sorted().joined(separator: ", "))
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.optiAmber)
            }
        }
    }

    private var explanation: String {
        if ingredient.flags.contains(.artificialSweetener) {
            return "Used for sweetness with fewer calories. Some users avoid it for taste, tolerance, or preference reasons. Evidence strength: preference-sensitive."
        }

        if ingredient.flags.contains(.syntheticDye) {
            return "Used for color. Some households avoid synthetic dyes, especially for kids mode. Evidence strength: moderate for preference screening."
        }

        if ingredient.flags.contains(.preservative) {
            return "Used to extend shelf life. Usually permitted in food, but some users prefer fewer preservatives. Evidence strength: low to moderate."
        }

        if ingredient.flags.contains(.addedSugar) {
            return "Contributes sweetness and added sugar. It can conflict with low-sugar goals when total added sugar is high. Evidence strength: strong for nutrition context."
        }

        return "Recognized ingredient with no current Optiyou flag for this profile."
    }
}
