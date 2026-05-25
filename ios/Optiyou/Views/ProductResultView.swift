import SwiftUI

struct ProductResultView: View {
    @EnvironmentObject private var store: AppStore
    let product: Product
    @State private var showsScoringMethod = false
    @State private var showsIssueReport = false

    private var result: ScoreResult {
        product.score(profile: store.profile)
    }

    private var explanation: AIExplanation {
        product.serverExplanation ?? ExplanationComposer().compose(product: product, result: result, profile: store.profile)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                heroCard
                warningsCard
                driverSummaryCard
                nutritionCard
                ingredientsCard
                additivesCard
                processingCard
                allergensCard
                preferencesCard
                swapsCard
                optionsCard
                askOptiyouCard
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle(product.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showsScoringMethod) {
            NavigationStack {
                ScoringMethodView()
            }
        }
        .sheet(isPresented: $showsIssueReport) {
            NavigationStack {
                IssueReportView(product: product)
            }
        }
    }

    private var heroCard: some View {
        SectionCard {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 14) {
                    ProductThumbnail(product: product, size: 132)

                    VStack(alignment: .leading, spacing: 8) {
                        Text(product.name)
                            .font(.title.weight(.black))
                            .foregroundStyle(Color.optiInk)
                            .fixedSize(horizontal: false, vertical: true)
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
                }

                HStack(alignment: .center, spacing: 24) {
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

    private var driverSummaryCard: some View {
        SectionCard {
            VStack(alignment: .leading, spacing: 14) {
                if negativeDrivers.isEmpty == false {
                    Text("Negatives")
                        .font(.title2.weight(.black))
                    ForEach(negativeDrivers) { reason in
                        DriverRow(reason: reason, value: nutritionValue(for: reason))
                    }
                }

                if positiveDrivers.isEmpty == false {
                    Text("Positives")
                        .font(.title2.weight(.black))
                    ForEach(positiveDrivers) { reason in
                        DriverRow(reason: reason, value: nutritionValue(for: reason))
                    }
                }
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
            let swaps = product.serverAlternatives
            if swaps.isEmpty {
                Text("No higher-scoring same-category swap is available from the live catalog yet.")
                    .font(.footnote)
                    .foregroundStyle(Color.optiMuted)
            } else {
                ForEach(swaps) { swap in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 12) {
                            Image(systemName: "arrow.up.forward.circle")
                                .font(.title2.weight(.bold))
                                .foregroundStyle(Color.optiGreen)
                                .frame(width: 40, height: 40)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(swap.name)
                                    .font(.headline)
                                    .foregroundStyle(Color.optiInk)
                                Text(swap.brand)
                                    .font(.subheadline)
                                    .foregroundStyle(Color.optiMuted)
                            }
                            Spacer()
                            Text("\(swap.optiFit)")
                                .font(.title3.weight(.black))
                                .foregroundStyle(ScoreStatus(value: swap.optiFit).color)
                        }
                        ForEach(swap.whyBetter, id: \.self) { reason in
                            Label(reason, systemImage: "checkmark.circle")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Color.optiMuted)
                        }
                    }
                    if swap.id != swaps.last?.id {
                        Divider()
                    }
                }
            }
        }
    }

    private var optionsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Options")
                .font(.title2.weight(.black))
                .foregroundStyle(Color.optiInk)

            SectionCard {
                VStack(spacing: 0) {
                    optionButton(
                        title: store.isSaved(product) ? "Remove from favorites" : "Add to favorites",
                        systemImage: store.isSaved(product) ? "star.fill" : "star"
                    ) {
                        store.toggleSaved(product)
                    }
                    Divider()
                    NavigationLink {
                        ProfileView()
                    } label: {
                        optionLabel(title: "Food preferences", systemImage: "slider.horizontal.3")
                    }
                    Divider()
                    optionButton(title: "Delete from history", systemImage: "trash") {
                        store.removeProductFromHistory(product)
                    }
                }
            }

            SectionCard {
                VStack(spacing: 0) {
                    optionButton(title: "Scoring method", systemImage: "doc.text.magnifyingglass") {
                        showsScoringMethod = true
                    }
                    Divider()
                    optionButton(title: "An issue with this product?", systemImage: "exclamationmark.circle") {
                        showsIssueReport = true
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

    private func formatted(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...1)))
    }

    private var negativeDrivers: [ScoreReason] {
        result.reasons.filter { $0.impact == .negative }
    }

    private var positiveDrivers: [ScoreReason] {
        result.reasons.filter { $0.impact == .positive }
    }

    private func nutritionValue(for reason: ScoreReason) -> String {
        switch reason.title {
        case "Added sugar":
            "\(formatted(product.nutrition.addedSugarGrams))g"
        case "Fiber context":
            "\(formatted(product.nutrition.fiberGrams))g"
        case "Protein support":
            "\(formatted(product.nutrition.proteinGrams))g"
        default:
            ""
        }
    }

    private func optionButton(title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            optionLabel(title: title, systemImage: systemImage)
        }
        .buttonStyle(.plain)
    }

    private func optionLabel(title: String, systemImage: String) -> some View {
        HStack {
            Text(title)
                .font(.headline)
                .foregroundStyle(Color.optiInk)
            Spacer()
            Image(systemName: systemImage)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.optiInk)
        }
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }
}

private struct DriverRow: View {
    var reason: ScoreReason
    var value: String

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: reason.impact.systemImage)
                .font(.title2.weight(.semibold))
                .foregroundStyle(Color.optiMuted)
                .frame(width: 34)
            VStack(alignment: .leading, spacing: 4) {
                Text(reason.title)
                    .font(.headline)
                    .foregroundStyle(Color.optiInk)
                Text(reason.detail)
                    .font(.subheadline)
                    .foregroundStyle(Color.optiMuted)
            }
            Spacer()
            if value.isEmpty == false {
                Text(value)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.optiMuted)
            }
            RatingDot(status: reason.impact == .positive ? .good : .poor, size: 14)
        }
        .padding(.vertical, 8)
    }
}

private struct ScoringMethodView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Scoring method")
                    .font(.largeTitle.weight(.black))
                SectionCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Deterministic scoring engine", systemImage: "checkmark.shield")
                        Label("AI explains labels and reason codes", systemImage: "sparkles")
                        Label("No paid placements or score manipulation", systemImage: "hand.raised")
                        Label("U.S. and Canada packaged food only", systemImage: "map")
                    }
                    .font(.headline.weight(.semibold))
                }
                Text("OptiScore reflects general product quality. OptiFit adjusts the result for your profile. Low-confidence extracted data is labeled and should not be treated as verified fact.")
                    .font(.headline)
                    .foregroundStyle(Color.optiMuted)
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("Methodology")
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

private struct IssueReportView: View {
    @Environment(\.dismiss) private var dismiss
    var product: Product

    var body: some View {
        List {
            Section("Product") {
                LabeledContent("Name", value: product.name)
                LabeledContent("Brand", value: product.brand)
                LabeledContent("Barcode", value: product.barcode)
            }

            Section("What looks wrong?") {
                Button("Nutrition facts") {}
                Button("Ingredients or additives") {}
                Button("Allergens or preferences") {}
                Button("Product photo or name") {}
                Button("Other issue") {}
            }

            Section {
                Text("Corrections go to review before changing structured product truth.")
                    .font(.footnote)
                    .foregroundStyle(Color.optiMuted)
            }
        }
        .navigationTitle("Report issue")
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
