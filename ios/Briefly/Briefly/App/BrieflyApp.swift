import SwiftUI
#if os(iOS)
import UIKit
#endif

private struct EpisodeDetailOverlay: View {
    @Binding var episode: Episode?
    @State private var dragOffset: CGFloat = 0
    @State private var scrollOffset: CGFloat = 0
    @State private var isTrackingDrag: Bool = false
    @State private var dragBeganAtTop: Bool = false

    private var isAtTop: Bool { scrollOffset >= 0 }

    var body: some View {
        ZStack {
            if episode != nil {
                Color.black
                    .opacity(backgroundOpacity)
                    .ignoresSafeArea()
                    .transition(.opacity)

                content
                    .offset(y: dragOffset)
                    .transition(.move(edge: .bottom))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.9), value: episode?.id)
        .animation(.spring(response: 0.35, dampingFraction: 0.9), value: dragOffset)
        .onChange(of: episode?.id) { _ in
            resetState()
        }
    }

    private var backgroundOpacity: Double {
        let progress = min(max(dragOffset / 240, 0), 1)
        return 0.35 * (1 - progress)
    }

    @ViewBuilder
    private var content: some View {
        if let episode {
            NavigationStack {
                EpisodeDetailView(
                    episode: episode,
                    onCreateEpisode: nil,
                    usesCustomChrome: true,
                    onScrollOffsetChange: { scrollOffset = $0 }
                )
            }
            .ignoresSafeArea()
            .simultaneousGesture(dismissDragGesture)
        }
    }

    private var dismissDragGesture: some Gesture {
        DragGesture(minimumDistance: 12, coordinateSpace: .global)
            .onChanged { value in
                if isTrackingDrag == false {
                    isTrackingDrag = true
                    dragBeganAtTop = isAtTop
                }

                guard dragBeganAtTop else { return }
                guard value.translation.height > 0 else { return }
                dragOffset = value.translation.height
            }
            .onEnded { value in
                defer {
                    isTrackingDrag = false
                    dragBeganAtTop = false
                }

                guard dragBeganAtTop else {
                    dragOffset = 0
                    return
                }

                let shouldDismiss = value.predictedEndTranslation.height > 220 || value.translation.height > 140
                if shouldDismiss {
                    episode = nil
                } else {
                    dragOffset = 0
                }
            }
    }

    private func resetState() {
        dragOffset = 0
        scrollOffset = 0
        isTrackingDrag = false
        dragBeganAtTop = false
    }
}

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
                .preferredColorScheme(.light)
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

        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithOpaqueBackground()
        tabBarAppearance.backgroundColor = UIColor(Color.brieflyTabBarBackground)
        tabBarAppearance.shadowColor = UIColor(Color.brieflyBorder)

        let tabItemAppearance = UITabBarItemAppearance()
        tabItemAppearance.normal.iconColor = UIColor(Color.brieflyTabBarInactive)
        tabItemAppearance.normal.titleTextAttributes = [.foregroundColor: UIColor(Color.brieflyTabBarInactive)]
        tabItemAppearance.selected.iconColor = UIColor.white
        tabItemAppearance.selected.titleTextAttributes = [.foregroundColor: UIColor.white]

        tabBarAppearance.stackedLayoutAppearance = tabItemAppearance
        tabBarAppearance.inlineLayoutAppearance = tabItemAppearance
        tabBarAppearance.compactInlineLayoutAppearance = tabItemAppearance

        let tabBarProxy = UITabBar.appearance()
        tabBarProxy.standardAppearance = tabBarAppearance
        tabBarProxy.scrollEdgeAppearance = tabBarAppearance
        tabBarProxy.isTranslucent = false
        tabBarProxy.tintColor = .white
        tabBarProxy.unselectedItemTintColor = UIColor(Color.brieflyTabBarInactive)
        if #available(iOS 15.0, *) {
            tabBarProxy.scrollEdgeAppearance = tabBarAppearance
        }

        let blurredNavigationBarAppearance = UINavigationBarAppearance()
        blurredNavigationBarAppearance.configureWithTransparentBackground()
        blurredNavigationBarAppearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterialLight)
        blurredNavigationBarAppearance.backgroundColor = background.withAlphaComponent(0.60)
        blurredNavigationBarAppearance.shadowColor = .clear
        blurredNavigationBarAppearance.shadowImage = UIImage()
        blurredNavigationBarAppearance.titleTextAttributes = [.foregroundColor: UIColor(Color.brieflyTextPrimary)]
        blurredNavigationBarAppearance.largeTitleTextAttributes = [.foregroundColor: UIColor(Color.brieflyTextPrimary)]

        let scrollEdgeNavigationBarAppearance = UINavigationBarAppearance()
        scrollEdgeNavigationBarAppearance.configureWithTransparentBackground()
        scrollEdgeNavigationBarAppearance.backgroundColor = .clear
        scrollEdgeNavigationBarAppearance.backgroundEffect = nil
        scrollEdgeNavigationBarAppearance.shadowColor = .clear
        scrollEdgeNavigationBarAppearance.shadowImage = UIImage()
        scrollEdgeNavigationBarAppearance.titleTextAttributes = [.foregroundColor: UIColor(Color.brieflyTextPrimary)]
        scrollEdgeNavigationBarAppearance.largeTitleTextAttributes = [.foregroundColor: UIColor(Color.brieflyTextPrimary)]

        let navigationBarProxy = UINavigationBar.appearance()
        navigationBarProxy.standardAppearance = blurredNavigationBarAppearance
        navigationBarProxy.compactAppearance = blurredNavigationBarAppearance
        navigationBarProxy.tintColor = UIColor(Color.brieflyPrimary)
        if #available(iOS 15.0, *) {
            navigationBarProxy.scrollEdgeAppearance = scrollEdgeNavigationBarAppearance
            navigationBarProxy.compactScrollEdgeAppearance = scrollEdgeNavigationBarAppearance
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
        .overlay {
            EpisodeDetailOverlay(episode: $appViewModel.presentedEpisode)
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
