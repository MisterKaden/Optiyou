import SwiftUI

// Brand tokens - canonical reference: docs/brand-identity.md.
// The app wears the "gallery white" theme: white elegance, near-black ink,
// champagne gold details, emerald reserved for verdicts.
extension Color {
    /// Gallery white page background (#FCFCFA)
    static let optiBackground = Color(red: 0.988, green: 0.988, blue: 0.98)
    /// Pure white raised surface (#FFFFFF)
    static let optiCard = Color.white
    /// Primary text and interactive accent - near-black (#101413)
    static let optiInk = Color(red: 0.063, green: 0.078, blue: 0.075)
    /// Secondary text (#6F746E)
    static let optiMuted = Color(red: 0.435, green: 0.455, blue: 0.431)
    /// Warm hairlines and borders (#E7E4DA)
    static let optiLine = Color(red: 0.906, green: 0.894, blue: 0.855)
    /// Emerald - good verdicts (#2F7D5F)
    static let optiGreen = Color(red: 0.184, green: 0.49, blue: 0.373)
    /// Deep evergreen for rich fills (#1E5743)
    static let optiGreenDeep = Color(red: 0.118, green: 0.341, blue: 0.263)
    /// Terracotta - poor/critical verdicts, composed not alarming (#B0563F)
    static let optiRed = Color(red: 0.69, green: 0.337, blue: 0.247)
    /// Champagne gold - watch states and accents (#A88A4F)
    static let optiAmber = Color(red: 0.659, green: 0.541, blue: 0.31)
    /// Soft champagne for decorative accents (#CDBC8B)
    static let optiGoldSoft = Color(red: 0.804, green: 0.737, blue: 0.545)
    /// Slate - informational (#51707F)
    static let optiBlue = Color(red: 0.318, green: 0.439, blue: 0.498)
}

extension Font {
    /// Serif display for screen titles (New York - the native cousin of the web's Cormorant).
    static let optiTitle = Font.system(.largeTitle, design: .serif).weight(.semibold)
    /// Serif heading for in-card section titles.
    static let optiHeading = Font.system(.title2, design: .serif).weight(.semibold)
    /// Serif numerals for scores and metrics.
    static func optiNumeral(_ size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: .serif)
    }
}

extension ScoreStatus {
    var color: Color {
        switch self {
        case .poor: .optiRed
        case .watch: .optiAmber
        case .good, .excellent: .optiGreen
        }
    }

    var systemImage: String {
        switch self {
        case .poor: "xmark"
        case .watch: "exclamationmark"
        case .good: "checkmark"
        case .excellent: "checkmark.seal.fill"
        }
    }
}

extension WarningSeverity {
    var color: Color {
        switch self {
        case .info: .optiBlue
        case .caution: .optiAmber
        case .critical: .optiRed
        }
    }

    var systemImage: String {
        switch self {
        case .info: "info.circle"
        case .caution: "exclamationmark.triangle"
        case .critical: "xmark.octagon"
        }
    }
}

extension ScoreImpact {
    var color: Color {
        switch self {
        case .positive: .optiGreen
        case .neutral: .optiBlue
        case .negative: .optiRed
        }
    }

    var systemImage: String {
        switch self {
        case .positive: "plus.circle"
        case .neutral: "circle"
        case .negative: "minus.circle"
        }
    }
}

/// Gallery panel - pure white, warm hairline, barely-there floating shadow.
struct SectionCard<Content: View>: View {
    var content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color.optiCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(Color.optiLine, lineWidth: 1)
            )
            .shadow(color: Color.optiInk.opacity(0.06), radius: 22, x: 0, y: 12)
    }
}

struct StatusBadge: View {
    var title: String
    var systemImage: String
    var color: Color

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .tracking(0.5)
            .foregroundStyle(color)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(color.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(color.opacity(0.3), lineWidth: 1)
            )
    }
}

struct OptiPrimaryButtonStyle: ButtonStyle {
    var expands = true
    var minHeight: CGFloat = 52

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .tracking(1.4)
            .textCase(.uppercase)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(Color.white)
            .padding(.horizontal, 16)
            .frame(maxWidth: expands ? .infinity : nil)
            .frame(minHeight: minHeight)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.optiInk.opacity(configuration.isPressed ? 0.82 : 1))
            )
    }
}

struct OptiSecondaryButtonStyle: ButtonStyle {
    var expands = true
    var minHeight: CGFloat = 48

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .tracking(1.2)
            .textCase(.uppercase)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(Color.optiInk)
            .padding(.horizontal, 16)
            .frame(maxWidth: expands ? .infinity : nil)
            .frame(minHeight: minHeight)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.optiCard.opacity(configuration.isPressed ? 0.7 : 1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.optiInk.opacity(0.85), lineWidth: 1)
            )
    }
}

struct OptiNoirButtonStyle: ButtonStyle {
    var expands = true
    var minHeight: CGFloat = 48

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .tracking(1.2)
            .textCase(.uppercase)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(Color.white)
            .padding(.horizontal, 14)
            .frame(maxWidth: expands ? .infinity : nil)
            .frame(minHeight: minHeight)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.white.opacity(configuration.isPressed ? 0.2 : 0.12))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.white.opacity(0.24), lineWidth: 1)
            )
    }
}

/// Score dial - gradient arc into champagne, serif numeral. Quietly luxurious.
struct ScoreDial: View {
    var label: String
    var score: Score

    var body: some View {
        VStack(spacing: 9) {
            ZStack {
                Circle()
                    .stroke(Color.optiLine, lineWidth: 1)
                    .padding(2)
                Circle()
                    .stroke(score.status.color.opacity(0.12), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: CGFloat(score.value) / 100)
                    .stroke(
                        AngularGradient(
                            colors: [score.status.color, Color.optiGoldSoft, score.status.color],
                            center: .center,
                            startAngle: .degrees(-90),
                            endAngle: .degrees(270)
                        ),
                        style: StrokeStyle(lineWidth: 6, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .shadow(color: score.status.color.opacity(0.3), radius: 5)
                VStack(spacing: 1) {
                    Text("\(score.value)")
                        .font(.optiNumeral(31))
                        .foregroundStyle(Color.optiInk)
                    Text(score.status.title)
                        .font(.caption2.weight(.semibold))
                        .tracking(1)
                        .textCase(.uppercase)
                        .foregroundStyle(score.status.color)
                }
            }
            .frame(width: 96, height: 96)

            Text(label)
                .font(.caption2.weight(.semibold))
                .tracking(1.6)
                .textCase(.uppercase)
                .foregroundStyle(Color.optiMuted)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(score.value), \(score.status.title)")
    }
}

struct ProductThumbnail: View {
    var product: Product
    var size: CGFloat = 74

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.optiBackground)
            if let imageURL = product.imageURL {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case let .success(image):
                        image
                            .resizable()
                            .scaledToFit()
                            .padding(6)
                    default:
                        Image(systemName: product.imageSystemName)
                            .font(.system(size: size * 0.38, weight: .light))
                            .foregroundStyle(Color.optiInk.opacity(0.74))
                    }
                }
            } else {
                Image(systemName: product.imageSystemName)
                    .font(.system(size: size * 0.38, weight: .light))
                    .foregroundStyle(Color.optiInk.opacity(0.74))
            }
        }
        .frame(width: size, height: size)
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.optiLine, lineWidth: 1)
        )
    }
}

struct RatingDot: View {
    var status: ScoreStatus
    var size: CGFloat = 12

    var body: some View {
        Circle()
            .fill(status.color)
            .frame(width: size, height: size)
            .accessibilityLabel(status.title)
    }
}

struct ProductListRow: View {
    var product: Product
    var score: ScoreResult
    var subtitle: String?
    var showsChevron = true

    var body: some View {
        HStack(spacing: 14) {
            ProductThumbnail(product: product, size: 74)

            VStack(alignment: .leading, spacing: 5) {
                Text(product.name)
                    .font(.headline.weight(.medium))
                    .fontDesign(.serif)
                    .foregroundStyle(Color.optiInk)
                    .lineLimit(2)
                Text(product.brand)
                    .font(.subheadline)
                    .foregroundStyle(Color.optiMuted)
                HStack(spacing: 7) {
                    RatingDot(status: score.optiFit.status, size: 9)
                    Text(score.optiFit.status.title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.optiMuted)
                }
                if let subtitle {
                    Label(subtitle, systemImage: "clock")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Color.optiMuted)
                }
            }

            Spacer(minLength: 8)

            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.optiMuted.opacity(0.42))
            }
        }
        .contentShape(Rectangle())
    }
}

struct ProductRow: View {
    var product: Product
    var score: ScoreResult

    var body: some View {
        HStack(spacing: 12) {
            ProductThumbnail(product: product, size: 58)

            VStack(alignment: .leading, spacing: 4) {
                Text(product.name)
                    .font(.headline.weight(.medium))
                    .fontDesign(.serif)
                    .foregroundStyle(Color.optiInk)
                Text("\(product.brand) · \(product.category.title)")
                    .font(.subheadline)
                    .foregroundStyle(Color.optiMuted)
                Text(score.verdict)
                    .font(.caption)
                    .foregroundStyle(Color.optiMuted)
                    .lineLimit(2)
            }

            Spacer()

            VStack(spacing: 2) {
                Text("\(score.optiFit.value)")
                    .font(.optiNumeral(22))
                    .foregroundStyle(score.optiFit.status.color)
                Text("FIT")
                    .font(.caption2.weight(.semibold))
                    .tracking(1.4)
                    .foregroundStyle(Color.optiMuted)
            }
        }
        .contentShape(Rectangle())
    }
}

struct AppInfoToolbar: ToolbarContent {
    var openSheet: (AppSheet) -> Void

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button {
                    openSheet(.profile)
                } label: {
                    Label("Profile", systemImage: "person.crop.circle")
                }
                Button {
                    openSheet(.account)
                } label: {
                    Label("Account", systemImage: "person.text.rectangle")
                }
                Button {
                    openSheet(.help)
                } label: {
                    Label("Help", systemImage: "questionmark.circle")
                }
                Button {
                    openSheet(.premium)
                } label: {
                    Label("Premium", systemImage: "sparkles")
                }
            } label: {
                Image(systemName: "info.circle")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(Color.optiInk)
                    .accessibilityLabel("Account and help")
            }
        }
    }
}

struct EmptyStateView: View {
    var systemImage: String
    var title: String
    var message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(Color.optiAmber)
            Text(title)
                .font(.system(.title3, design: .serif).weight(.semibold))
                .foregroundStyle(Color.optiInk)
            Text(message)
                .font(.callout)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.optiMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
    }
}
