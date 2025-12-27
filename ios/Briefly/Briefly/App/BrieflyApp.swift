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
                } else if appViewModel.hasCompletedOnboarding == false {
                    OnboardingProfileView(appViewModel: appViewModel)
                } else {
                    MainTabView(appViewModel: appViewModel)
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
    }
}
