import SwiftUI
import UIKit

@main
struct OptiyouApp: App {
    @StateObject private var store = AppStore()

    init() {
        Self.configureBarAppearances()
    }

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(store)
                .preferredColorScheme(.light)
        }
    }

    // The app wears the brand's gallery-white theme (docs/brand-identity.md):
    // translucent white bars with near-black serif titles, matching the website's nav.
    private static func configureBarAppearances() {
        let gallery = UIColor(red: 0.988, green: 0.988, blue: 0.98, alpha: 0.92)
        let ink = UIColor(red: 0.063, green: 0.078, blue: 0.075, alpha: 1)

        func serifFont(size: CGFloat, weight: UIFont.Weight) -> UIFont {
            let base = UIFont.systemFont(ofSize: size, weight: weight)
            guard let descriptor = base.fontDescriptor.withDesign(.serif) else { return base }
            return UIFont(descriptor: descriptor, size: size)
        }

        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithTransparentBackground()
        navAppearance.backgroundColor = gallery
        navAppearance.titleTextAttributes = [
            .foregroundColor: ink,
            .font: serifFont(size: 18, weight: .semibold),
        ]
        navAppearance.largeTitleTextAttributes = [
            .foregroundColor: ink,
            .font: serifFont(size: 34, weight: .semibold),
        ]
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
        UINavigationBar.appearance().compactAppearance = navAppearance

        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithTransparentBackground()
        tabAppearance.backgroundColor = gallery
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance
    }
}
