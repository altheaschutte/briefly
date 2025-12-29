import SwiftUI
#if os(iOS)
import UIKit
#endif

@main
struct BrieflyApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    #endif
    @StateObject private var appViewModel: AppViewModel
    @StateObject private var pushManager: PushNotificationManager

    init() {
        let viewModel = AppViewModel()
        let notificationService = NotificationService(apiClient: viewModel.apiClient)
        let pushManager = PushNotificationManager(notificationService: notificationService)
        _appViewModel = StateObject(wrappedValue: viewModel)
        _pushManager = StateObject(wrappedValue: pushManager)
        #if os(iOS)
        AppDelegate.pushManager = pushManager
        #endif
        Self.configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(appViewModel)
                .environmentObject(appViewModel.audioPlayer)
                .environmentObject(pushManager)
                .tint(.brieflyPrimary)
                .preferredColorScheme(.dark)
        }
    }

    private static func configureAppearance() {
        #if os(iOS)
        let background = UIColor(Color.brieflyBackground)
        UITableView.appearance().backgroundColor = background
        UITableViewCell.appearance().backgroundColor = background
        UITableViewHeaderFooterView.appearance().tintColor = .clear
        // UITableViewHeaderFooterView.appearance().backgroundColor = background

        // SwiftUI Lists/Forms use UICollectionView under the hood on modern iOS; mirror the appearance there.
        UICollectionView.appearance().backgroundColor = background
        UICollectionViewCell.appearance().backgroundColor = background
        UICollectionReusableView.appearance().backgroundColor = background
        #endif
    }
}

struct AppRootView: View {
    @EnvironmentObject private var appViewModel: AppViewModel
    @EnvironmentObject private var pushManager: PushNotificationManager
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            Color.brieflyBackground
                .ignoresSafeArea()

            Group {
                if appViewModel.isAuthenticated == false {
                    AuthFlowView(appViewModel: appViewModel)
                } else if appViewModel.isSeedingTopics {
                    PersonalizationLoadingView()
                } else if appViewModel.hasCompletedOnboarding == false {
                    OnboardingProfileView(appViewModel: appViewModel)
                } else {
                    MainTabView(appViewModel: appViewModel)
                }
            }
            .overlay(alignment: .bottom) {
                if let message = appViewModel.snackbarMessage {
                    SnackbarView(message: message) {
                        appViewModel.snackbarMessage = nil
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .animation(.easeInOut(duration: 0.2), value: appViewModel.snackbarMessage)
                    .padding(.bottom, 20)
                }
            }
        }
        .onAppear {
            appViewModel.bootstrap()
            if appViewModel.isAuthenticated {
                Task { await pushManager.registerForPushNotifications() }
            }
        }
        .onChange(of: appViewModel.isAuthenticated) { isAuthenticated in
            if isAuthenticated {
                Task { await pushManager.registerForPushNotifications() }
            } else {
                Task { await pushManager.unregisterCurrentDevice() }
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                Task { await appViewModel.authManager.refreshSessionIfNeeded(force: true) }
            }
        }
        .onOpenURL { url in
            guard url.scheme == "io.supabase.gotrue" else { return }
            Task { await appViewModel.handleAuthRedirect(url) }
        }
    }
}
