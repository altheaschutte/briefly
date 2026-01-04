import SwiftUI
import Combine
import UIKit

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
        case feed, create, settings, search
    }

    @EnvironmentObject private var audioManager: AudioPlayerManager
    @StateObject private var feedViewModel: EpisodesViewModel
    @StateObject private var topicsViewModel: TopicsViewModel
    @StateObject private var settingsViewModel: SettingsViewModel
    @State private var selection: Tab
    @State private var hasEvaluatedInitialLanding: Bool
    @State private var chromeHeight: CGFloat = 120
    @State private var trayPreferences = BrieflyTrayChromePreferences()
    @State private var searchText: String = ""
    @State private var isSearching: Bool = false
    private let appViewModel: AppViewModel
    private let tabBarAppearance = UITabBar.appearance()
    private let miniPlayerNamespace: Namespace.ID

    init(appViewModel: AppViewModel, miniPlayerNamespace: Namespace.ID) {
        self.appViewModel = appViewModel
        self.miniPlayerNamespace = miniPlayerNamespace
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

            ZStack(alignment: .bottom) {
                Color.brieflyBackground.ignoresSafeArea()

                tabContainer(bottomPadding: chromeHeight)

                floatingChrome()
                    .padding(.horizontal, 6)
                    .padding(.bottom, 0)
                    .padding(.top, 0)
                    .onSizeChange { chromeHeight = $0.height }
                    .animation(.spring(response: 0.4, dampingFraction: 0.85), value: audioManager.currentEpisode?.id)
                    .animation(.spring(response: 0.35, dampingFraction: 0.9), value: selection)
            }
            .ignoresSafeArea(.keyboard, edges: .bottom)
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
            tabBarAppearance.isHidden = true
        }
        .onDisappear { tabBarAppearance.isHidden = false }
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
    @ViewBuilder
    func tabContainer(bottomPadding: CGFloat) -> some View {
        TabView(selection: $selection) {
            NavigationStack {
                FeedView(viewModel: feedViewModel) {
                    selection = .create
                }
            }
            .ignoresSafeArea(.container, edges: .bottom)
            .tabItem { Label("Library", systemImage: "music.note.list") }
            .tag(Tab.feed)

            NavigationStack {
                SetupView(
                    topicsViewModel: topicsViewModel,
                    appViewModel: appViewModel
                )
            }
            .ignoresSafeArea(.container, edges: .bottom)
            .tabItem { Label("Briefs", systemImage: "sparkles") }
            .tag(Tab.create)

            NavigationStack {
                SettingsView(viewModel: settingsViewModel, email: appViewModel.currentUserEmail)
            }
            .ignoresSafeArea(.container, edges: .bottom)
            .tabItem { Label("Settings", systemImage: "gear") }
            .tag(Tab.settings)

            NavigationStack {
                searchTab
            }
            .ignoresSafeArea(.container, edges: .bottom)
            .tabItem { Label("Search", systemImage: "magnifyingglass") }
            .tag(Tab.search)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Color.clear.frame(height: bottomPadding)
        }
        .tabViewStyle(.automatic)
        .toolbar(.hidden, for: .tabBar)
        .toolbarBackground(.hidden, for: .tabBar)
        .scrollContentBackground(.hidden)
        .onPreferenceChange(BrieflyTrayChromePreferencesKey.self) { trayPreferences = $0 }
    }

    private var searchTab: some View {
        List {
            if searchResults.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("No matches yet")
                        .font(.headline)
                        .foregroundStyle(Color.brieflyTextPrimary)
                    Text("Search your saved Briefly episodes by title or summary.")
                        .font(.footnote)
                        .foregroundStyle(Color.brieflyTextMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 12)
            } else {
                ForEach(searchResults) { episode in
                    Button {
                        appViewModel.presentEpisodeDetail(episode)
                        selection = .feed
                    } label: {
                        SearchResultRow(episode: episode, isPlaying: audioManager.currentEpisode?.id == episode.id)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.brieflyBackground)
        .navigationTitle("Search")
        .searchable(text: $searchText, placement: .toolbar, prompt: Text("Search your Briefs"))
        .task {
            await feedViewModel.load(force: false)
        }
    }

    private var searchResults: [Episode] {
        let ready = feedViewModel.episodes.filter { $0.isReady }
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return ready }
        let term = trimmed.lowercased()
        return ready.filter {
            $0.displayTitle.lowercased().contains(term) ||
            $0.subtitle.lowercased().contains(term)
        }
    }

    @ViewBuilder
    func floatingChrome() -> some View {
        VStack(spacing: 8) {
            if let episode = audioManager.currentEpisode, trayPreferences.hideMiniPlayer == false {
                miniPlayer(for: episode)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            Group {
                if isSearching {
                    searchBar
                } else {
                    HStack(alignment: .center, spacing: 10) {
                        tabStrip
                        searchButton
                    }
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.9), value: isSearching)
        }
    }

    private var tabStrip: some View {
        HStack(spacing: 0) {
            tabButton(tab: .feed, title: "Library", systemImage: "house.fill")
            Spacer(minLength: 0)
            tabButton(tab: .create, title: "Briefs", systemImage: "sparkles")
            Spacer(minLength: 0)
            tabButton(tab: .settings, title: "Settings", systemImage: "gearshape.fill")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(height: 48)
        .background(floatingBackground(cornerRadius: 30))
    }

    private var searchButton: some View {
        let isSelected = selection == .search
        return Button {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.82, blendDuration: 0.2)) {
                selection = .search
                isSearching = true
            }
        } label: {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 18, weight: .semibold))
                .frame(width: 24, height: 24)
                .padding(12)
                .foregroundStyle(Color.white)
                .background(
                    Circle()
                        .fill(Color.brieflyTabBarBackground)
                )
                .overlay(
                    Circle()
                        .stroke(isSelected ? Color.white.opacity(0.22) : Color.clear, lineWidth: 1.5)
                )
        }
        .buttonStyle(.plain)
        .shadow(color: Color.black.opacity(0.22), radius: 18, x: 0, y: 10)
        .accessibilityLabel("Search")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func tabButton(tab: Tab, title: String, systemImage: String) -> some View {
        let isSelected = selection == tab
        return Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.85, blendDuration: 0.2)) {
                selection = tab
            }
        } label: {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .semibold))
                .frame(width: 48, height: 48)
                .foregroundStyle(isSelected ? Color.white : Color.brieflyTabBarInactive)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.8))

            TextField("Search your Briefs", text: $searchText)
                .textFieldStyle(.plain)
                .foregroundStyle(Color.white.opacity(0.9))
                .font(.system(size: 15))
                .submitLabel(.search)
                .onSubmit {
                    selection = .search
                }

            if searchText.isEmpty == false {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.white.opacity(0.8))
                }
                .buttonStyle(.plain)
            }

            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
                    isSearching = false
                }
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.white.opacity(0.8))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .frame(height: 48)
        .background(floatingBackground(cornerRadius: 24))
    }

    private func miniPlayer(for episode: Episode) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [.brieflyPrimary.opacity(0.9), Color.brieflyTabBarBackground.opacity(0.8)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 20, height: 20)

                Text(episode.displayTitle)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(Color.white.opacity(0.6))
                    .lineLimit(1)

                Spacer(minLength: 0)

                Button(action: togglePlay) {
                    Image(systemName: audioManager.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .contentShape(Rectangle())
                        .padding(.horizontal, 6)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(audioManager.isPlaying ? "Pause" : "Play")
            }

            playerProgressBar
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(floatingBackground(cornerRadius: 30))
        .matchedTransitionSource(id: "MINIPLAYER", in: miniPlayerNamespace)
        .contentShape(Rectangle())
        .onTapGesture {
            appViewModel.presentEpisodeDetail(episode)
        }
    }

    private var playerProgressBar: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.white.opacity(0.2))

                Capsule()
                    .fill(Color.brieflyPrimary)
                    .frame(width: max(0, min(audioManager.progress, 1)) * proxy.size.width)
            }
        }
        .frame(height: 4)
    }

    private func floatingBackground(cornerRadius: CGFloat) -> some View {
        ZStack {
            Capsule(style: .continuous)
                .fill(Color.gray.opacity(0.22))

            Capsule(style: .continuous)
                .fill(Color.brieflyTabBarBackground)
                .padding(1)
        }
        .shadow(color: Color.black.opacity(0.22), radius: 16, x: 0, y: 10)
    }

    private func togglePlay() {
        guard audioManager.currentEpisode != nil else { return }
        audioManager.isPlaying ? audioManager.pause() : audioManager.resume()
    }

    struct SizeChangeKey: PreferenceKey {
        static var defaultValue: CGSize = .zero
        static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
            value = nextValue()
        }
    }

    struct SearchResultRow: View {
        let episode: Episode
        let isPlaying: Bool

        var body: some View {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.brieflyTabBarBackground.opacity(0.9))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Image(systemName: isPlaying ? "waveform" : "sparkles")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.white)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text(episode.displayTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.brieflyTextPrimary)
                        .lineLimit(2)

                    Text(episode.subtitle)
                        .font(.caption)
                        .foregroundStyle(Color.brieflyTextMuted)
                        .lineLimit(2)
                }

                Spacer()

                Image(systemName: "chevron.forward")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.brieflyTabBarInactive)
            }
            .padding(.vertical, 8)
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
