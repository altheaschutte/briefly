import SwiftUI
import Combine

struct BrieflyTrayChromePreferences: Equatable {
    var hideMiniPlayer: Bool = false
}

struct BrieflyTrayChromePreferencesKey: PreferenceKey {
    static var defaultValue = BrieflyTrayChromePreferences()

    static func reduce(value: inout BrieflyTrayChromePreferences, nextValue: () -> BrieflyTrayChromePreferences) {
        let next = nextValue()
        value.hideMiniPlayer = value.hideMiniPlayer || next.hideMiniPlayer
    }
}

extension View {
    func brieflyHideTrayMiniPlayer(_ hidden: Bool) -> some View {
        preference(key: BrieflyTrayChromePreferencesKey.self, value: .init(hideMiniPlayer: hidden))
    }
}

struct MainTabView: View {
    fileprivate enum Tab {
        case feed, create, settings
    }

    @EnvironmentObject private var audioManager: AudioPlayerManager
    @StateObject private var feedViewModel: EpisodesViewModel
    @StateObject private var topicsViewModel: TopicsViewModel
    @StateObject private var settingsViewModel: SettingsViewModel
    @State private var selection: Tab
    @State private var hasEvaluatedInitialLanding: Bool
    @State private var trayHeight: CGFloat = 0
    @State private var trayPreferences = BrieflyTrayChromePreferences()
    private let appViewModel: AppViewModel

    init(appViewModel: AppViewModel) {
        self.appViewModel = appViewModel
        let fatalAuthHandler: (String) -> Void = { [weak appViewModel] message in
            Task { @MainActor in
                await appViewModel?.forceLogoutWithSnackbar(message)
            }
        }
        _feedViewModel = StateObject(
            wrappedValue: EpisodesViewModel(
                episodeService: appViewModel.episodeService,
                initialEpisodes: appViewModel.prefetchedEpisodes,
                onFatalAuthError: fatalAuthHandler
            )
        )
        _topicsViewModel = StateObject(
            wrappedValue: TopicsViewModel(
                topicService: appViewModel.topicService,
                entitlementsService: appViewModel.entitlementsService,
                initialTopics: appViewModel.prefetchedTopics ?? [],
                onFatalAuthError: fatalAuthHandler
            )
        )
        _settingsViewModel = StateObject(
            wrappedValue: SettingsViewModel(
                appViewModel: appViewModel,
                audioManager: appViewModel.audioPlayer,
                initialEntitlements: appViewModel.prefetchedEntitlements,
                initialSchedules: appViewModel.prefetchedSchedules ?? []
            )
        )
        _selection = State(initialValue: MainTabView.defaultTab(prefetchedEpisodes: appViewModel.prefetchedEpisodes))
        _hasEvaluatedInitialLanding = State(initialValue: appViewModel.prefetchedEpisodes != nil)
    }

    var body: some View {
        GeometryReader { proxy in
            let bottomSafeAreaInset = proxy.safeAreaInsets.bottom
            let bottomTrayInset = max(0, trayHeight - bottomSafeAreaInset)
            let contentBottomPadding = selection == .create ? 0 : bottomTrayInset

            ZStack(alignment: .bottom) {
                TabView(selection: $selection) {
                    NavigationStack {
                        FeedView(viewModel: feedViewModel) {
                            selection = .create
                        }
                    }
                    .tabItem { Label("Library", systemImage: "list.bullet") }
                    .tag(Tab.feed)

                    NavigationStack {
                        SetupView(
                            topicsViewModel: topicsViewModel,
                            appViewModel: appViewModel,
                            bottomTrayInset: bottomTrayInset
                        )
                    }
                    .tabItem { Label("Briefs", systemImage: "sparkles") }
                    .tag(Tab.create)

                    NavigationStack {
                        SettingsView(viewModel: settingsViewModel, email: appViewModel.currentUserEmail)
                    }
                    .tabItem { Label("Settings", systemImage: "gear") }
                    .tag(Tab.settings)
                }
                .toolbar(.hidden, for: .tabBar)
                .toolbarBackground(.hidden, for: .tabBar)
                .scrollContentBackground(.hidden)
                .safeAreaPadding(.bottom, contentBottomPadding)
                .onPreferenceChange(BrieflyTrayChromePreferencesKey.self) { trayPreferences = $0 }

                BottomTrayChrome(
                    selection: $selection,
                    bottomSafeAreaInset: bottomSafeAreaInset,
                    showsMiniPlayer: audioManager.currentEpisode != nil && trayPreferences.hideMiniPlayer == false,
                    onMiniPlayerTap: {
                        if let episode = audioManager.currentEpisode {
                            appViewModel.presentEpisodeDetail(episode)
                        }
                    }
                )
                .onSizeChange { trayHeight = $0.height }
                .animation(.spring(response: 0.35, dampingFraction: 0.86), value: trayHeight)
                .ignoresSafeArea(.container, edges: .bottom)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.brieflyTabBarBackground.ignoresSafeArea())
        }
        .onChange(of: appViewModel.hasCompletedOnboarding) { completed in
            if completed {
                selection = .feed
            }
        }
        .onReceive(appViewModel.$prefetchedEpisodes.compactMap { $0 }) { episodes in
            feedViewModel.applyPrefetchedEpisodes(episodes)
            evaluateInitialLanding(with: episodes)
        }
        .onAppear {
            evaluateInitialLanding(with: appViewModel.prefetchedEpisodes)
        }
    }

    private func evaluateInitialLanding(with episodes: [Episode]?) {
        guard hasEvaluatedInitialLanding == false, let episodes else { return }
        if episodes.isEmpty {
            selection = .create
        }
        hasEvaluatedInitialLanding = true
    }

    private static func defaultTab(prefetchedEpisodes: [Episode]?) -> Tab {
        guard let episodes = prefetchedEpisodes else { return .feed }
        return episodes.isEmpty ? .create : .feed
    }
}

private extension MainTabView {
    fileprivate struct BottomTrayChrome: View {
        struct Style {
            var horizontalInset: CGFloat = 0
            var cornerRadius: CGFloat = 28
            var shadowOpacity: Double = 0
            var bottomContentInset: CGFloat = 0
            var bottomContentInsetWithHomeIndicator: CGFloat = 0
        }

        @Binding fileprivate var selection: Tab
        let bottomSafeAreaInset: CGFloat
        let showsMiniPlayer: Bool
        let onMiniPlayerTap: () -> Void

        @EnvironmentObject private var audioManager: AudioPlayerManager

        private let style = Style()

        var body: some View {
            let bottomInset = bottomSafeAreaInset > 0 ? style.bottomContentInsetWithHomeIndicator : style.bottomContentInset
            VStack(spacing: 0) {
                if showsMiniPlayer {
                    miniPlayer
                        .padding(.top, 6)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 6)

                    Divider()
                        .overlay(Color.white.opacity(0.10))
                }

                tabBar
                    .padding(.top, showsMiniPlayer ? 10 : 12)
                    .padding(.horizontal, 20)
                    .padding(.bottom, bottomInset)
            }
            .frame(maxWidth: .infinity)
            .background(trayBackground)
            .padding(.horizontal, style.horizontalInset)
            .accessibilityElement(children: .contain)
        }

        private var trayBackground: some View {
            let shape = UnevenRoundedRectangle(
                topLeadingRadius: style.cornerRadius,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: style.cornerRadius,
                style: .continuous
            )
            return Color.brieflyTabBarBackground
                .clipShape(shape)
                .shadow(color: Color.black.opacity(style.shadowOpacity), radius: 24, x: 0, y: 12)
        }

        private var miniPlayer: some View {
            Group {
                if let episode = audioManager.currentEpisode {
                    VStack(spacing: 6) {
                        HStack(spacing: 10) {
                            Text(episode.displayTitle)
                                .font(.system(size: 11, weight: .regular))
                                .foregroundColor(.brieflyTabBarInactive)
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)

                            Button(action: togglePlay) {
                                Image(systemName: audioManager.isPlaying ? "pause.fill" : "play.fill")
                                    .font(.system(size: 14, weight: .regular))
                                    .foregroundColor(.white)
                                    .frame(width: 28, height: 28)
                            }
                            .contentShape(Rectangle().inset(by: -8))
                            .buttonStyle(.plain)
                            .accessibilityLabel(audioManager.isPlaying ? "Pause" : "Play")
                        }

                        progressBar
                    }
                    .contentShape(Rectangle())
                    .onTapGesture(perform: onMiniPlayerTap)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isButton)
                }
            }
        }

        private var progressBar: some View {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.white.opacity(0.14))
                    Capsule()
                        .fill(Color.brieflyPrimary)
                        .frame(width: max(0, min(audioManager.progress, 1)) * geo.size.width)
                }
            }
            .frame(height: 4)
        }

        private var tabBar: some View {
            HStack {
                tabButton(
                    tab: .feed,
                    title: "Library",
                    systemImage: "list.bullet"
                )
                Spacer(minLength: 0)
                tabButton(
                    tab: .create,
                    title: "Briefs",
                    systemImage: "sparkles"
                )
                Spacer(minLength: 0)
                tabButton(
                    tab: .settings,
                    title: "Settings",
                    systemImage: "gear"
                )
            }
        }

        private func tabButton(tab: Tab, title: String, systemImage: String) -> some View {
            let isSelected = selection == tab
            return Button {
                selection = tab
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: systemImage)
                        .font(.system(size: 20, weight: .semibold))
                        .frame(height: 22)
                    Text(title)
                        .font(.caption2.weight(.semibold))
                }
                .foregroundColor(isSelected ? .white : .brieflyTabBarInactive)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(title)
            .accessibilityAddTraits(isSelected ? .isSelected : [])
        }

        private func togglePlay() {
            guard audioManager.currentEpisode != nil else { return }
            audioManager.isPlaying ? audioManager.pause() : audioManager.resume()
        }
    }

    struct SizeChangeKey: PreferenceKey {
        static var defaultValue: CGSize = .zero
        static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
            value = nextValue()
        }
    }
}

private extension View {
    func onSizeChange(_ action: @escaping (CGSize) -> Void) -> some View {
        background(
            GeometryReader { proxy in
                Color.clear.preference(key: MainTabView.SizeChangeKey.self, value: proxy.size)
            }
        )
        .onPreferenceChange(MainTabView.SizeChangeKey.self, perform: action)
    }
}
