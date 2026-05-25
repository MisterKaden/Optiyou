import Foundation

struct ScoringEngine {
    let version = "OptiScoreEngine/1.0"

    func score(product: Product, profile: UserNutritionProfile) -> ScoreResult {
        let optiScoreValue = scoreOverall(product)
        var fitValue = optiScoreValue
        var warnings = productWarnings(product: product, profile: profile)
        var reasons = overallReasons(for: product)

        if profile.preferences.contains(.lowSugar) {
            if product.nutrition.addedSugarGrams > 8 {
                fitValue -= 18
                warnings.append(ProductWarning(
                    severity: .caution,
                    title: "High for your low-sugar profile",
                    detail: "\(formatted(product.nutrition.addedSugarGrams))g added sugar per serving."
                ))
            } else {
                fitValue += 4
                reasons.append(ScoreReason(title: "Low added sugar", detail: "Fits your low-sugar setting.", impact: .positive))
            }
        }

        if profile.preferences.contains(.highProtein) {
            if product.nutrition.proteinGrams >= 8 {
                fitValue += 5
                reasons.append(ScoreReason(title: "Protein support", detail: "Provides \(formatted(product.nutrition.proteinGrams))g protein.", impact: .positive))
            } else {
                fitValue -= 8
            }
        }

        fitValue += preferencePenalty(product: product, profile: profile, warnings: &warnings)

        let confidence = confidence(for: product)
        let optiScore = Score(value: clamped(optiScoreValue), status: ScoreStatus(value: optiScoreValue))
        let optiFit = Score(value: clamped(fitValue), status: ScoreStatus(value: fitValue))
        let verdict = verdict(for: product, optiScore: optiScore, optiFit: optiFit, warnings: warnings, profile: profile)

        return ScoreResult(
            engineVersion: version,
            optiScore: optiScore,
            optiFit: optiFit,
            confidence: confidence,
            verdict: verdict,
            reasons: reasons,
            warnings: warnings
        )
    }

    private func scoreOverall(_ product: Product) -> Int {
        var score = 82
        let nutrition = product.nutrition

        switch nutrition.addedSugarGrams {
        case 20...:
            score -= 22
        case 10..<20:
            score -= 10
        case 5..<10:
            score -= 5
        default:
            score += 4
        }

        if nutrition.proteinGrams >= 12 {
            score += 7
        } else if nutrition.proteinGrams >= 8 {
            score += 4
        }

        if nutrition.fiberGrams >= 6 {
            score += 7
        } else if nutrition.fiberGrams >= 3 {
            score += 4
        }

        if nutrition.sodiumMilligrams > 700 {
            score -= 14
        } else if nutrition.sodiumMilligrams > 450 {
            score -= 7
        }

        switch product.processingLevel {
        case .minimal:
            score += 5
        case .moderate:
            break
        case .high:
            score -= 10
        }

        score -= product.ingredients.reduce(0) { partial, ingredient in
            partial + ingredient.flags.reduce(0) { flagTotal, flag in
                flagTotal + penalty(for: flag)
            }
        }

        return clamped(score)
    }

    private func overallReasons(for product: Product) -> [ScoreReason] {
        var reasons: [ScoreReason] = []

        if product.nutrition.fiberGrams >= 3 {
            reasons.append(ScoreReason(title: "Fiber context", detail: "\(formatted(product.nutrition.fiberGrams))g fiber supports a stronger overall score.", impact: .positive))
        }

        if product.nutrition.addedSugarGrams >= 10 {
            reasons.append(ScoreReason(title: "Added sugar", detail: "\(formatted(product.nutrition.addedSugarGrams))g added sugar lowers the product-quality score.", impact: .negative))
        }

        if product.processingLevel == .high {
            reasons.append(ScoreReason(title: "Processing", detail: "Several markers suggest a more processed product.", impact: .negative))
        }

        if reasons.isEmpty {
            reasons.append(ScoreReason(title: "Balanced baseline", detail: "No major nutrition or ingredient concerns were detected.", impact: .neutral))
        }

        return reasons
    }

    private func productWarnings(product: Product, profile: UserNutritionProfile) -> [ProductWarning] {
        var warnings: [ProductWarning] = []

        for allergen in profile.allergens where product.allergens.contains(allergen) {
            warnings.append(ProductWarning(
                severity: .critical,
                title: "Contains \(allergen.title.lowercased())",
                detail: "This conflicts with an allergen in your profile."
            ))
        }

        return warnings
    }

    private func preferencePenalty(product: Product, profile: UserNutritionProfile, warnings: inout [ProductWarning]) -> Int {
        var penalty = 0
        let flags = Set(product.ingredients.flatMap(\.flags))

        if profile.preferences.contains(.dairyFree), product.allergens.contains(.dairy) || flags.contains(.containsDairy) {
            penalty -= 55
            appendUniqueWarning(&warnings, ProductWarning(
                severity: .critical,
                title: "Contains dairy",
                detail: "This conflicts with your dairy-free setting."
            ))
        }

        if profile.preferences.contains(.glutenFree), product.allergens.contains(.gluten) || flags.contains(.containsGluten) {
            penalty -= 55
            appendUniqueWarning(&warnings, ProductWarning(
                severity: .critical,
                title: "Contains gluten",
                detail: "This conflicts with your gluten-free setting."
            ))
        }

        if profile.preferences.contains(.avoidArtificialSweeteners), flags.contains(.artificialSweetener) {
            penalty -= 25
            appendUniqueWarning(&warnings, ProductWarning(
                severity: .caution,
                title: "Artificial sweetener",
                detail: "Your profile says to avoid artificial sweeteners."
            ))
        }

        if profile.preferences.contains(.avoidDyes), flags.contains(.syntheticDye) {
            penalty -= 20
            appendUniqueWarning(&warnings, ProductWarning(
                severity: .caution,
                title: "Synthetic dye",
                detail: "Your profile says to avoid synthetic dyes."
            ))
        }

        if profile.preferences.contains(.avoidPreservatives), flags.contains(.preservative) {
            penalty -= 12
            appendUniqueWarning(&warnings, ProductWarning(
                severity: .info,
                title: "Preservative present",
                detail: "This may matter because of your preservative setting."
            ))
        }

        if profile.preferences.contains(.kidsMode), product.nutrition.addedSugarGrams > 8 {
            penalty -= 10
            appendUniqueWarning(&warnings, ProductWarning(
                severity: .caution,
                title: "Kids mode sugar check",
                detail: "Added sugar is higher than the household profile target."
            ))
        }

        for avoidedIngredient in profile.avoidedIngredients where product.ingredients.contains(where: { $0.name.localizedCaseInsensitiveContains(avoidedIngredient) }) {
            penalty -= 30
            appendUniqueWarning(&warnings, ProductWarning(
                severity: .caution,
                title: "Avoided ingredient match",
                detail: "\(avoidedIngredient) appears in the ingredient list."
            ))
        }

        return penalty
    }

    private func confidence(for product: Product) -> ConfidenceBadge {
        let value = clamped(product.dataQuality.confidenceBase)
        let label: String

        if value >= 85 {
            label = "High confidence"
        } else if value >= 70 {
            label = "Good confidence"
        } else {
            label = "Low confidence"
        }

        return ConfidenceBadge(value: value, label: label, detail: product.dataQuality.label)
    }

    private func verdict(
        for product: Product,
        optiScore: Score,
        optiFit: Score,
        warnings: [ProductWarning],
        profile: UserNutritionProfile
    ) -> String {
        if warnings.contains(where: { $0.severity == .critical }) {
            return "Avoid for your profile until the conflict is resolved."
        }

        if optiScore.value >= 70, optiFit.value + 10 < optiScore.value {
            if profile.preferences.contains(.lowSugar), product.nutrition.addedSugarGrams > 8 {
                return "Good overall, poor fit for your low-sugar profile."
            }
            return "Good overall, but not the best fit for your profile."
        }

        switch optiFit.status {
        case .excellent:
            return "Strong choice for your profile."
        case .good:
            return "Good choice with a few details to review."
        case .watch:
            return "Mixed choice. Check the reasons before buying."
        case .poor:
            return "Better option available for your goals."
        }
    }

    private func penalty(for flag: IngredientFlag) -> Int {
        switch flag {
        case .addedSugar: 0
        case .artificialSweetener: 6
        case .syntheticDye: 8
        case .preservative: 4
        case .ultraProcessedMarker: 8
        case .containsDairy, .containsGluten: 0
        }
    }

    private func appendUniqueWarning(_ warnings: inout [ProductWarning], _ warning: ProductWarning) {
        if warnings.contains(where: { $0.title == warning.title }) == false {
            warnings.append(warning)
        }
    }

    private func clamped(_ value: Int) -> Int {
        min(100, max(0, value))
    }

    private func formatted(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...1)))
    }
}

struct ScoreResult: Hashable {
    var engineVersion: String
    var optiScore: Score
    var optiFit: Score
    var confidence: ConfidenceBadge
    var verdict: String
    var reasons: [ScoreReason]
    var warnings: [ProductWarning]
}

struct Score: Hashable {
    var value: Int
    var status: ScoreStatus
}

enum ScoreStatus: Hashable {
    case poor
    case watch
    case good
    case excellent

    init(value: Int) {
        switch value {
        case 85...:
            self = .excellent
        case 70..<85:
            self = .good
        case 50..<70:
            self = .watch
        default:
            self = .poor
        }
    }

    var title: String {
        switch self {
        case .poor: "Poor"
        case .watch: "Watch"
        case .good: "Good"
        case .excellent: "Excellent"
        }
    }
}

struct ConfidenceBadge: Hashable {
    var value: Int
    var label: String
    var detail: String
}

struct ScoreReason: Hashable, Identifiable {
    let id = UUID()
    var title: String
    var detail: String
    var impact: ScoreImpact
}

enum ScoreImpact: Hashable {
    case positive
    case neutral
    case negative
}

struct ProductWarning: Hashable, Identifiable {
    let id = UUID()
    var severity: WarningSeverity
    var title: String
    var detail: String
}

enum WarningSeverity: Hashable {
    case info
    case caution
    case critical
}
