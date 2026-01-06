import SwiftUI

struct RootView: View {
    @EnvironmentObject private var appViewModel: AppViewModel

    var body: some View {
        Group {
            if appViewModel.isBootstrapping {
                ProgressView("Loading...")
                    .tint(.brieflyPrimary)
            } else if appViewModel.isAuthenticated {
                ContentView()
            } else {
                AuthFlowView(appViewModel: appViewModel)
            }
        }
        .onAppear {
            if appViewModel.isBootstrapping {
                appViewModel.bootstrap()
            }
        }
        .onOpenURL { url in
            guard url.scheme == "io.supabase.gotrue" else { return }
            Task { await appViewModel.handleAuthRedirect(url) }
        }
    }
}
