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
    }

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(appViewModel)
                .environmentObject(appViewModel.audioPlayer)
                .environmentObject(appViewModel.playbackHistory)
                .environmentObject(pushManager)
                .tint(.brieflyPrimary)
                .preferredColorScheme(.dark)
        }
    }

    static func configureAppearance() {
        #if os(iOS)
        configureAppearanceOnMain()
        #endif
    }

    #if os(iOS)
    private static func configureAppearanceOnMain() {
        let background = UIColor(Color.brieflyBackground)
        UITableView.appearance().backgroundColor = background
        UITableViewCell.appearance().backgroundColor = background
        UITableViewHeaderFooterView.appearance().tintColor = .clear
        // UITableViewHeaderFooterView.appearance().backgroundColor = background

        // SwiftUI Lists/Forms use UICollectionView under the hood on modern iOS; mirror the appearance there.
        UICollectionView.appearance().backgroundColor = background
        UICollectionViewCell.appearance().backgroundColor = background
        UICollectionReusableView.appearance().backgroundColor = background

        let chromeBackgroundColor = background.withAlphaComponent(0.65)
        let chromeBlurEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)

        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithTransparentBackground()
        tabBarAppearance.backgroundEffect = chromeBlurEffect
        tabBarAppearance.backgroundColor = chromeBackgroundColor

        let tabBarProxy = UITabBar.appearance()
        tabBarProxy.standardAppearance = tabBarAppearance
        tabBarProxy.isTranslucent = true
        if #available(iOS 15.0, *) {
            tabBarProxy.scrollEdgeAppearance = tabBarAppearance
        }

        let navigationBarAppearance = UINavigationBarAppearance()
        navigationBarAppearance.configureWithTransparentBackground()
        navigationBarAppearance.backgroundEffect = chromeBlurEffect
        navigationBarAppearance.backgroundColor = chromeBackgroundColor
        navigationBarAppearance.titleTextAttributes = [.foregroundColor: UIColor.white]
        navigationBarAppearance.largeTitleTextAttributes = [.foregroundColor: UIColor.white]

        let navigationBarProxy = UINavigationBar.appearance()
        navigationBarProxy.standardAppearance = navigationBarAppearance
        navigationBarProxy.compactAppearance = navigationBarAppearance
        if #available(iOS 15.0, *) {
            navigationBarProxy.scrollEdgeAppearance = navigationBarAppearance
            navigationBarProxy.compactScrollEdgeAppearance = navigationBarAppearance
        }

    }
    #endif
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
