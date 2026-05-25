import SwiftUI

@main
struct OptiyouApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(store)
        }
    }
}
