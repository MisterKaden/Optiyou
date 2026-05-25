import SwiftUI

extension Color {
    static let optiBackground = Color(red: 0.965, green: 0.976, blue: 0.957)
    static let optiInk = Color(red: 0.086, green: 0.118, blue: 0.11)
    static let optiMuted = Color(red: 0.373, green: 0.439, blue: 0.416)
    static let optiLine = Color(red: 0.847, green: 0.886, blue: 0.875)
    static let optiGreen = Color(red: 0.055, green: 0.459, blue: 0.408)
    static let optiRed = Color(red: 0.765, green: 0.231, blue: 0.255)
    static let optiAmber = Color(red: 0.835, green: 0.545, blue: 0.106)
    static let optiBlue = Color(red: 0.149, green: 0.337, blue: 0.596)
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

struct SectionCard<Content: View>: View {
    var content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.optiLine, lineWidth: 1)
            )
    }
}

struct StatusBadge: View {
    var title: String
    var systemImage: String
    var color: Color

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.bold))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(color.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct ScoreDial: View {
    var label: String
    var score: Score

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(score.status.color.opacity(0.16), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: CGFloat(score.value) / 100)
                    .stroke(score.status.color, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 1) {
                    Text("\(score.value)")
                        .font(.system(size: 28, weight: .black, design: .rounded))
                    Text(score.status.title)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(score.status.color)
                }
            }
            .frame(width: 94, height: 94)

            Text(label)
                .font(.caption.weight(.bold))
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
                .fill(Color.optiGreen.opacity(0.1))
            Image(systemName: product.imageSystemName)
                .font(.system(size: size * 0.38, weight: .semibold))
                .foregroundStyle(Color.optiGreen)
        }
        .frame(width: size, height: size)
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.optiLine, lineWidth: 1)
        )
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
                    .font(.headline)
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
                    .font(.title3.weight(.black))
                    .foregroundStyle(score.optiFit.status.color)
                Text("Fit")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(Color.optiMuted)
            }
        }
        .contentShape(Rectangle())
    }
}

struct EmptyStateView: View {
    var systemImage: String
    var title: String
    var message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 38, weight: .semibold))
                .foregroundStyle(Color.optiGreen)
            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(Color.optiInk)
            Text(message)
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.optiMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
    }
}
