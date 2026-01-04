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

private struct BrieflyFloatingChromeHeightKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    var brieflyFloatingChromeHeight: CGFloat {
        get { self[BrieflyFloatingChromeHeightKey.self] }
        set { self[BrieflyFloatingChromeHeightKey.self] = newValue }
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
    @State private var isShowingCreateBrief: Bool = false
    @State private var searchText: String = ""
    @State private var isSearching: Bool = false
    @FocusState private var isSearchFieldFocused: Bool
    private let appViewModel: AppViewModel
    private let tabBarAppearance = UITabBar.appearance()
    private let miniPlayerNamespace: Namespace.ID
    private let chromeHorizontalPadding: CGFloat = 16

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

                trayFadeOverlay(height: chromeHeight + bottomSafeAreaInset + 140)

                floatingChrome
                    .padding(.horizontal, chromeHorizontalPadding)
                    .padding(.bottom, isSearchFieldFocused ? 12 : 0)
                    .padding(.top, 0)
                    .onSizeChange { chromeHeight = $0.height }
                    .animation(.spring(response: 0.4, dampingFraction: 0.85), value: audioManager.currentEpisode?.id)
                    .animation(.spring(response: 0.35, dampingFraction: 0.9), value: selection)
            }
            .environment(\.brieflyFloatingChromeHeight, chromeHeight + bottomSafeAreaInset)
        }
        .onChange(of: appViewModel.hasCompletedOnboarding) { completed in
            if completed {
                selection = .feed
            }
        }
        .onChange(of: isSearching) { active in
            isSearchFieldFocused = active
        }
        .onChange(of: isSearchFieldFocused) { focused in
            guard focused == false else { return }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
                isSearching = false
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
        .ignoreKeyboardSafeArea(isSearching == false)
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
                    appViewModel: appViewModel,
                    isShowingCreateBrief: $isShowingCreateBrief
                )
            }
            .ignoresSafeArea(.container, edges: .bottom)
            .tabItem { Label("Create", systemImage: "sparkles") }
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
                        dismissSearchFocus()
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
        .simultaneousGesture(
            TapGesture()
                .onEnded { dismissSearchFocus() }
        )
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
    var floatingChrome: some View {
        VStack(spacing: 8) {
            if let episode = audioManager.currentEpisode, trayPreferences.hideMiniPlayer == false {
                miniPlayer(for: episode)
                    .background(floatingBackground(cornerRadius: 30))
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            Group {
                if isSearching {
                    searchBar
                } else {
                    HStack(alignment: .center, spacing: 10) {
                        tabStrip
                        trailingButton
                    }
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.9), value: isSearching)
        }
    }

    private var tabStrip: some View {
        let tabStripHeight = 48 + (2 / UIScreen.main.scale)

        return HStack(spacing: 14) {
            tabButton(tab: .feed, title: "Library", systemImage: "house.fill")
            tabButton(tab: .create, title: "Briefs", systemImage: "sparkles")
            tabButton(tab: .settings, title: "Settings", systemImage: "gearshape.fill")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(height: tabStripHeight)
        .background(floatingBackground(cornerRadius: 30))
    }

    @ViewBuilder
    private var trailingButton: some View {
        if selection == .create {
            createBriefButton
        } else {
            searchButton
        }
    }

    private var searchButton: some View {
        let isSelected = selection == .search
        return Button {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.82, blendDuration: 0.2)) {
                selection = .search
                isSearching = true
            }
            isSearchFieldFocused = true
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

    private var createBriefButton: some View {
        Button {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.82, blendDuration: 0.2)) {
                selection = .create
            }
            dismissSearchFocus()
            isShowingCreateBrief = true
        } label: {
            Image(systemName: "plus")
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
                        .stroke(Color.white.opacity(0.22), lineWidth: 1.5)
                )
        }
        .buttonStyle(.plain)
        .shadow(color: Color.black.opacity(0.22), radius: 18, x: 0, y: 10)
        .accessibilityLabel("Create Brief")
        .accessibilityAddTraits(.isSelected)
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
                .focused($isSearchFieldFocused)
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
                dismissSearchFocus()
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.white.opacity(0.8))
            }
            .buttonStyle(.plain)
            .padding(.trailing, 4)
        }
        .padding(.horizontal, 14)
        .frame(height: 48)
        .background(floatingBackground(cornerRadius: 24))
    }

    private func miniPlayer(for episode: Episode) -> some View {
        let miniPlayerShape = Capsule(style: .continuous)

        return VStack(spacing: 8) {
            HStack(spacing: 10) {
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
        .clipShape(miniPlayerShape) // mask inner content so shadows from children don't show sharp corners
        .matchedTransitionSource(id: "MINIPLAYER", in: miniPlayerNamespace)
        .contentShape(miniPlayerShape)
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

    private func trayFadeOverlay(height: CGFloat) -> some View {
        let gradient = LinearGradient(
            colors: [
                Color.brieflyBackground,
                Color.brieflyBackground.opacity(0.9),
                Color.brieflyBackground.opacity(0.0)
            ],
            startPoint: .bottom,
            endPoint: .top
        )
        let showDebugGradient = false

        return ZStack {
            // Blur the content beneath while preserving the fade shape.
            Rectangle()
                .fill(.regularMaterial)
                .mask(gradient)
                .frame(maxWidth: .infinity)

            // Subtle tint to keep the fade aligned with the background color.
            gradient.opacity(0.15)

            if showDebugGradient {
                LinearGradient(
                    colors: [
                        Color.red.opacity(0.35),
                        Color.red.opacity(0.15),
                        Color.red.opacity(0.0)
                    ],
                    startPoint: .bottom,
                    endPoint: .top
                )
            }
        }
        .frame(height: max(height, 120))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }

    private func dismissSearchFocus() {
        isSearchFieldFocused = false
        withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
            isSearching = false
        }
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
            let coverSize: CGFloat = 56
            let maxPixelSize = Int(ceil(coverSize * UIScreen.main.scale))

            HStack(alignment: .center, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(episode.displayTitle)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.brieflyTextPrimary)
                        .lineLimit(2)

                    Text(episode.subtitle)
                        .font(.footnote)
                        .foregroundStyle(Color.brieflyTextMuted)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if isPlaying {
                    Image(systemName: "waveform")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.brieflyTextPrimary)
                }

                coverImage(for: episode, maxPixelSize: maxPixelSize)
                    .frame(width: coverSize, height: coverSize)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .padding(.vertical, 10)
        }

        private func coverImage(for episode: Episode, maxPixelSize: Int?) -> some View {
            ZStack {
                Color.brieflySurface

                if let url = episode.coverImageURL {
                    CachedAsyncImage(url: url, maxPixelSize: maxPixelSize) { image in
                        image
                            .resizable()
                            .scaledToFill()
                    } placeholder: {
                        SkeletonBlock()
                    } failure: {
                        fallbackArtwork
                    }
                } else {
                    fallbackArtwork
                }
            }
        }

        private var fallbackArtwork: some View {
            Image(systemName: "waveform.circle.fill")
                .font(.system(size: 28, weight: .semibold))
                .foregroundColor(Color.brieflySecondary)
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

    @ViewBuilder
    func ignoreKeyboardSafeArea(_ ignore: Bool) -> some View {
        if ignore {
            self.ignoresSafeArea(.keyboard, edges: .bottom)
        } else {
            self
        }
    }
}
