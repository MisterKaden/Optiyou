import SwiftUI

struct AppRootView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("hasCompletedOptiyouOnboarding") private var hasCompletedOnboarding = false

    var body: some View {
        Group {
            if hasCompletedOnboarding {
                MainTabView()
            } else {
                OnboardingView(profile: store.profile) { profile in
                    store.profile = profile
                    hasCompletedOnboarding = true
                }
            }
        }
    }
}

private struct MainTabView: View {
    @EnvironmentObject private var store: AppStore
    @State private var selectedTab: AppTab = .scan
    @State private var activeSheet: AppSheet?

    var body: some View {
        TabView(selection: $selectedTab) {
            HistoryTab(openSheet: showSheet)
                .tabItem { Label("History", systemImage: "carrot") }
                .tag(AppTab.history)

            RecommendationsTab(openSheet: showSheet)
                .tabItem { Label("Recs", systemImage: "arrow.left.arrow.right.circle") }
                .tag(AppTab.recommendations)

            ScannerTab(openSheet: showSheet)
                .tabItem { Label("Scan", systemImage: "barcode.viewfinder") }
                .tag(AppTab.scan)

            OverviewTab(openSheet: showSheet)
                .tabItem { Label("Overview", systemImage: "chart.pie") }
                .tag(AppTab.overview)

            SearchTab(openSheet: showSheet)
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
                .tag(AppTab.search)
        }
        .tint(Color.optiGreen)
        .sheet(item: $activeSheet) { sheet in
            NavigationStack {
                sheet.destination
            }
        }
        .task {
            await store.loadHistoryIfNeeded()
        }
    }

    private func showSheet(_ sheet: AppSheet) {
        activeSheet = sheet
    }
}

private struct ScannerTab: View {
    var openSheet: (AppSheet) -> Void
    @State private var path: [Product] = []

    var body: some View {
        NavigationStack(path: $path) {
            ScannerView(openSheet: openSheet) { product, _ in
                path.append(product)
            }
            .withProductDestinations()
        }
    }
}

private struct HistoryTab: View {
    var openSheet: (AppSheet) -> Void
    @State private var path: [Product] = []

    var body: some View {
        NavigationStack(path: $path) {
            HistoryView(openSheet: openSheet) { product in
                path.append(product)
            }
            .withProductDestinations()
        }
    }
}

private struct RecommendationsTab: View {
    var openSheet: (AppSheet) -> Void
    @State private var path: [Product] = []

    var body: some View {
        NavigationStack(path: $path) {
            RecommendationsView(openSheet: openSheet) { product in
                path.append(product)
            }
            .withProductDestinations()
        }
    }
}

private struct OverviewTab: View {
    var openSheet: (AppSheet) -> Void
    @State private var path: [Product] = []

    var body: some View {
        NavigationStack(path: $path) {
            OverviewView(openSheet: openSheet) { product in
                path.append(product)
            }
            .withProductDestinations()
        }
    }
}

private struct SearchTab: View {
    var openSheet: (AppSheet) -> Void
    @State private var path: [Product] = []

    var body: some View {
        NavigationStack(path: $path) {
            SearchView(openSheet: openSheet) { product in
                path.append(product)
            }
            .withProductDestinations()
        }
    }
}

private extension View {
    func withProductDestinations() -> some View {
        navigationDestination(for: Product.self) { product in
            ProductResultView(product: product)
        }
    }
}

enum AppTab: Hashable {
    case history
    case recommendations
    case scan
    case overview
    case search
}

enum AppSheet: Identifiable {
    case account
    case help
    case premium
    case contribute
    case profile

    var id: String {
        switch self {
        case .account: "account"
        case .help: "help"
        case .premium: "premium"
        case .contribute: "contribute"
        case .profile: "profile"
        }
    }

    @MainActor
    @ViewBuilder
    var destination: some View {
        switch self {
        case .account:
            AccountView()
        case .help:
            HelpView()
        case .premium:
            PremiumView()
        case .contribute:
            ContributeView()
        case .profile:
            ProfileView()
        }
    }

}
