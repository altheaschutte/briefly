import SwiftUI

@main
struct BrieflyApp: App {
    @StateObject private var appViewModel = AppViewModel()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(appViewModel)
                .environmentObject(appViewModel.audioPlayer)
        }
    }
}

struct AppRootView: View {
    @EnvironmentObject private var appViewModel: AppViewModel

    var body: some View {
        Group {
            if appViewModel.isAuthenticated == false {
                AuthFlowView(appViewModel: appViewModel)
            } else {
                MainTabView(appViewModel: appViewModel)
            }
        }
        .onAppear {
            appViewModel.bootstrap()
        }
    }
}
