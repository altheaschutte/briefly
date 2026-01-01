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
    @StateObject private var episodeGenerationStatus: EpisodeGenerationStatusCenter

    init() {
        let viewModel = AppViewModel()
        let notificationService = NotificationService(apiClient: viewModel.apiClient)
        let pushManager = PushNotificationManager(notificationService: notificationService)
        let episodeGenerationStatus = EpisodeGenerationStatusCenter(episodeService: viewModel.episodeService)
        _appViewModel = StateObject(wrappedValue: viewModel)
        _pushManager = StateObject(wrappedValue: pushManager)
        _episodeGenerationStatus = StateObject(wrappedValue: episodeGenerationStatus)
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
                .environmentObject(episodeGenerationStatus)
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
    @EnvironmentObject private var episodeGenerationStatus: EpisodeGenerationStatusCenter
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
            .overlay {
                GeometryReader { proxy in
                    if appViewModel.isAuthenticated, episodeGenerationStatus.isVisible {
                        EpisodeGenerationToastView(text: episodeGenerationStatus.text)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                            .padding(.top, proxy.safeAreaInsets.top + 10)
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .animation(.easeInOut(duration: 0.2), value: episodeGenerationStatus.isVisible)
                    }
                }
                .allowsHitTesting(false)
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
                Task { await episodeGenerationStatus.refreshFromServer() }
                episodeGenerationStatus.resumePollingIfNeeded()
            } else {
                Task { await pushManager.unregisterCurrentDevice() }
                episodeGenerationStatus.clear()
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                Task { await appViewModel.authManager.refreshSessionIfNeeded(force: true) }
                if appViewModel.isAuthenticated {
                    Task { await episodeGenerationStatus.refreshFromServer() }
                    episodeGenerationStatus.resumePollingIfNeeded()
                }
            }
        }
        .onOpenURL { url in
            guard url.scheme == "io.supabase.gotrue" else { return }
            Task { await appViewModel.handleAuthRedirect(url) }
        }
    }
}
