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
    var body: some View {
        TabView {
            ScannerTab()
                .tabItem { Label("Scan", systemImage: "barcode.viewfinder") }

            HistoryTab()
                .tabItem { Label("History", systemImage: "clock") }

            SavedTab()
                .tabItem { Label("Saved", systemImage: "bookmark") }

            CompareTab()
                .tabItem { Label("Compare", systemImage: "square.split.2x1") }

            ProfileTab()
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        }
        .tint(Color.optiGreen)
    }
}

private struct ScannerTab: View {
    @EnvironmentObject private var store: AppStore
    @State private var path: [Product] = []

    var body: some View {
        NavigationStack(path: $path) {
            ScannerView { product, source in
                store.recordScan(product, source: source)
                path.append(product)
            }
            .withProductDestinations()
        }
    }
}

private struct HistoryTab: View {
    @State private var path: [Product] = []

    var body: some View {
        NavigationStack(path: $path) {
            HistoryView { product in
                path.append(product)
            }
            .withProductDestinations()
        }
    }
}

private struct SavedTab: View {
    @State private var path: [Product] = []

    var body: some View {
        NavigationStack(path: $path) {
            SavedProductsView { product in
                path.append(product)
            }
            .withProductDestinations()
        }
    }
}

private struct CompareTab: View {
    @State private var path: [Product] = []

    var body: some View {
        NavigationStack(path: $path) {
            CompareView { product in
                path.append(product)
            }
            .withProductDestinations()
        }
    }
}

private struct ProfileTab: View {
    var body: some View {
        NavigationStack {
            ProfileView()
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
