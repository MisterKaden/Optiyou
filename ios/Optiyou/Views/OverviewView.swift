import SwiftUI

struct OverviewView: View {
    @EnvironmentObject private var store: AppStore
    var openSheet: (AppSheet) -> Void
    var openProduct: (Product) -> Void

    private var buckets: [OverviewBucket] {
        store.overviewBuckets()
    }

    private var total: Int {
        buckets.reduce(0) { $0 + $1.count }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("My food")
                    .font(.largeTitle.weight(.black))
                    .foregroundStyle(Color.optiInk)

                VStack(spacing: 16) {
                    Text("Last 30 days")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(Color.optiMuted)

                    ZStack {
                        OverviewPieChart(buckets: buckets)
                            .frame(width: 248, height: 248)
                        VStack(spacing: 2) {
                            Text("\(total)")
                                .font(.system(size: 44, weight: .black, design: .rounded))
                                .foregroundStyle(Color.optiInk)
                            Text(total == 1 ? "scan" : "scans")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Color.optiMuted)
                        }
                    }
                    .frame(maxWidth: .infinity)

                    Picker("Scope", selection: .constant("food")) {
                        Text("Food").tag("food")
                        Text("Beauty later").tag("beauty")
                    }
                    .pickerStyle(.segmented)
                    .disabled(true)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Grading overview")
                        .font(.caption.weight(.bold))
                        .textCase(.uppercase)
                        .foregroundStyle(Color.optiMuted)

                    SectionCard {
                        VStack(spacing: 0) {
                            ForEach(buckets) { bucket in
                                Button {
                                    if let product = firstProduct(for: bucket.status) {
                                        openProduct(product)
                                    }
                                } label: {
                                    HStack(spacing: 14) {
                                        RatingDot(status: bucket.status, size: 18)
                                        Text(bucket.status.title)
                                            .font(.title3.weight(.semibold))
                                            .foregroundStyle(Color.optiInk)
                                        Spacer()
                                        Text("\(bucket.count)")
                                            .font(.title3.weight(.bold))
                                            .foregroundStyle(Color.optiMuted)
                                        Image(systemName: "chevron.right")
                                            .foregroundStyle(Color.optiMuted.opacity(0.4))
                                    }
                                    .padding(.vertical, 14)
                                }
                                .buttonStyle(.plain)

                                if bucket.id != buckets.last?.id {
                                    Divider()
                                }
                            }
                        }
                    }

                    Text("0 unknown products")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.optiMuted)
                        .padding(.leading, 4)
                }
            }
            .padding(16)
        }
        .background(Color.optiBackground.ignoresSafeArea())
        .navigationTitle("Overview")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            AppInfoToolbar(openSheet: openSheet)
        }
    }

    private func firstProduct(for status: ScoreStatus) -> Product? {
        store.history.first {
            ScoringEngine().score(product: $0.product, profile: store.profile).optiFit.status == status
        }?.product
    }
}

private struct OverviewPieChart: View {
    var buckets: [OverviewBucket]

    var body: some View {
        let total = max(1, buckets.reduce(0) { $0 + $1.count })
        ZStack {
            Circle()
                .fill(Color.optiLine.opacity(0.28))
            ForEach(segments(total: total), id: \.status) { segment in
                PieSegment(start: segment.start, end: segment.end)
                    .fill(segment.status.color)
            }
            Circle()
                .fill(Color.optiBackground.opacity(0.26))
                .frame(width: 152, height: 152)
        }
        .accessibilityLabel("Food scan distribution")
    }

    private func segments(total: Int) -> [(status: ScoreStatus, start: Double, end: Double)] {
        var cursor = 0.0
        return buckets.compactMap { bucket in
            guard bucket.count > 0 else { return nil }
            let start = cursor
            cursor += Double(bucket.count) / Double(total)
            return (bucket.status, start, cursor)
        }
    }
}

private struct PieSegment: Shape {
    var start: Double
    var end: Double

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2
        path.move(to: center)
        path.addArc(
            center: center,
            radius: radius,
            startAngle: .degrees(start * 360 - 90),
            endAngle: .degrees(end * 360 - 90),
            clockwise: false
        )
        path.closeSubpath()
        return path
    }
}
