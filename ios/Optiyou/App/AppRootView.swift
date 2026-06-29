import SwiftUI

struct AppRootView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("hasCompletedOptiyouOnboarding") private var hasCompletedOnboarding = false

    var body: some View {
        Group {
            if hasCompletedOnboarding || Self.launchOverrideSkipsOnboarding {
                MainTabView()
            } else {
                OnboardingView(profile: store.profile) { profile in
                    store.profile = profile
                    hasCompletedOnboarding = true
                }
            }
        }
    }

    // Launch-environment hooks for screenshot automation and UI tests (no effect in release builds).
    static var launchOverrideSkipsOnboarding: Bool {
        #if DEBUG
        ProcessInfo.processInfo.environment["OPTIYOU_SKIP_ONBOARDING"] == "1"
        #else
        false
        #endif
    }
}

private struct MainTabView: View {
    @EnvironmentObject private var store: AppStore
    @State private var selectedTab: AppTab = MainTabView.initialTab
    @State private var activeSheet: AppSheet?

    private static var initialTab: AppTab {
        #if DEBUG
        switch ProcessInfo.processInfo.environment["OPTIYOU_TAB"] {
        case "history": .history
        case "recs": .recommendations
        case "overview": .overview
        case "search": .search
        default: .scan
        }
        #else
        .scan
        #endif
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            HistoryTab(openSheet: showSheet)
                .tabItem { Label("History", systemImage: "clock.arrow.circlepath") }
                .tag(AppTab.history)

            RecommendationsTab(openSheet: showSheet)
                .tabItem { Label("Swaps", systemImage: "arrow.left.arrow.right.circle") }
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
        .tint(Color.optiInk)
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
    @State private var path: [Product] = {
        #if DEBUG
        if ProcessInfo.processInfo.environment["OPTIYOU_DEMO_PRODUCT"] == "1" {
            return [SampleCatalog.products[0]]
        }
        #endif
        return []
    }()

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
