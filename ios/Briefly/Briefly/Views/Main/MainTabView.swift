import SwiftUI
import Combine
import UIKit

struct BrieflyTrayChromePreferences: Equatable {
    enum TrailingButton: Equatable {
        case tabDefault
        case search
    }

    enum SearchContext: Equatable {
        case episodes
        case briefs
    }

    var hideMiniPlayer: Bool = false
    var trailingButton: TrailingButton = .tabDefault
    var searchContext: SearchContext = .episodes
}

struct BrieflyTrayChromePreferencesKey: PreferenceKey {
    static var defaultValue = BrieflyTrayChromePreferences()

    static func reduce(value: inout BrieflyTrayChromePreferences, nextValue: () -> BrieflyTrayChromePreferences) {
        let next = nextValue()
        value.hideMiniPlayer = value.hideMiniPlayer || next.hideMiniPlayer

        if next.trailingButton != .tabDefault {
            value.trailingButton = next.trailingButton
        }

        if next.searchContext != .episodes {
            value.searchContext = next.searchContext
        }
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

    func brieflyTraySearch(context: BrieflyTrayChromePreferences.SearchContext) -> some View {
        preference(key: BrieflyTrayChromePreferencesKey.self, value: .init(trailingButton: .search, searchContext: context))
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
    @State private var episodeSearchText: String = ""
    @State private var briefsSearchText: String = ""
    @State private var searchContext: BrieflyTrayChromePreferences.SearchContext = .episodes
    @State private var isSearching: Bool = false
    @State private var searchEditingTopic: Topic?
    @State private var showSearchActiveLimitAlert: Bool = false
    @FocusState private var isSearchFieldFocused: Bool
    private let appViewModel: AppViewModel
    private let tabBarAppearance = UITabBar.appearance()
    private let miniPlayerNamespace: Namespace.ID
    private let chromeHorizontalPadding: CGFloat = 16
    private let contentBottomPaddingOffset: CGFloat = 16

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
            let contentBottomPadding = chromeHeight + contentBottomPaddingOffset

            ZStack(alignment: .bottom) {
                Color.brieflyBackground.ignoresSafeArea()

                tabContainer(bottomPadding: contentBottomPadding)

                if isSearching {
                    searchOverlay(bottomSafeAreaInset: bottomSafeAreaInset, contentBottomPadding: contentBottomPadding)
                        .transition(.opacity)
                }

                trayFadeOverlay(height: chromeHeight + bottomSafeAreaInset + trayGradientPadding)

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
        .onChange(of: selection) { _ in
            if isSearching {
                searchContext = effectiveSearchContext
            }
        }
        .onChange(of: isSearching) { active in
            isSearchFieldFocused = active
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
                    isShowingCreateBrief: $isShowingCreateBrief,
                    briefsSearchText: $briefsSearchText
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
        episodesSearchList(contentBottomPadding: chromeHeight + contentBottomPaddingOffset, bottomSafeAreaInset: 0)
        .task {
            await feedViewModel.load(force: false)
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

    private var trayGradientPadding: CGFloat {
        isMiniPlayerVisible ? 140 : 60
    }

    private var isMiniPlayerVisible: Bool {
        audioManager.currentEpisode != nil && trayPreferences.hideMiniPlayer == false
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
        searchButton(context: effectiveSearchContext)
    }

    private var effectiveSearchContext: BrieflyTrayChromePreferences.SearchContext {
        if trayPreferences.trailingButton == .search {
            return trayPreferences.searchContext
        }
        return selection == .create ? .briefs : .episodes
    }

    private func searchButton(context: BrieflyTrayChromePreferences.SearchContext = .episodes) -> some View {
        let isSelected = isSearching && searchContext == context

        return Button {
            startSearch(with: context)
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

    private func startSearch(with context: BrieflyTrayChromePreferences.SearchContext) {
        searchContext = context
        withAnimation(.spring(response: 0.32, dampingFraction: 0.82, blendDuration: 0.2)) {
            isSearching = true
        }
        DispatchQueue.main.async {
            isSearchFieldFocused = true
        }
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
        let binding = searchFieldBinding
        let currentText = binding.wrappedValue

        return HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.8))

            TextField(searchPlaceholder, text: binding)
                .focused($isSearchFieldFocused)
                .textFieldStyle(.plain)
                .foregroundStyle(Color.white.opacity(0.9))
                .font(.system(size: 15))
                .submitLabel(.search)
                .onSubmit {
                    if searchContext == .episodes {
                        selection = .search
                    }
                }

            if currentText.isEmpty == false {
                Button {
                    binding.wrappedValue = ""
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
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private var searchFieldBinding: Binding<String> {
        switch searchContext {
        case .briefs:
            return $briefsSearchText
        case .episodes:
            return $episodeSearchText
        }
    }

    private var searchPlaceholder: String {
        switch searchContext {
        case .briefs:
            return "Search your Briefs"
        case .episodes:
            return "Search your episodes"
        }
    }

    @ViewBuilder
    private func searchOverlay(bottomSafeAreaInset: CGFloat, contentBottomPadding: CGFloat) -> some View {
        Group {
            switch searchContext {
            case .episodes:
                episodesSearchList(
                    contentBottomPadding: contentBottomPadding,
                    bottomSafeAreaInset: bottomSafeAreaInset
                )
            case .briefs:
                briefsSearchList(
                    contentBottomPadding: contentBottomPadding,
                    bottomSafeAreaInset: bottomSafeAreaInset
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.brieflyBackground)
        .animation(.easeInOut(duration: 0.2), value: isSearching)
    }

    @ViewBuilder
    private func episodesSearchList(contentBottomPadding: CGFloat, bottomSafeAreaInset: CGFloat) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(filteredEpisodeSections) { section in
                    if section.title.isEmpty == false {
                        Text(section.title)
                            .font(.headline)
                            .foregroundStyle(Color.brieflyTextPrimary)
                            .padding(.horizontal, 20)
                            .padding(.top, 12)
                            .padding(.bottom, 6)
                    }

                    ForEach(section.episodes) { episode in
                        Button {
                            appViewModel.presentEpisodeDetail(episode)
                        } label: {
                            SearchEpisodeRow(episode: episode)
                                .padding(.horizontal, 20)
                        }
                        .buttonStyle(.plain)
                    }
                }
                Spacer(minLength: contentBottomPadding + bottomSafeAreaInset)
            }
        }
        .background(Color.brieflyBackground)
    }

    private var filteredEpisodeSections: [EpisodeSection] {
        let ready = feedViewModel.episodes.filter { $0.isReady }
        let trimmed = episodeSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let filtered: [Episode] = {
            guard trimmed.isEmpty == false else { return ready }
            let term = trimmed.lowercased()
            return ready.filter {
                $0.displayTitle.lowercased().contains(term) ||
                $0.subtitle.lowercased().contains(term)
            }
        }()

        let calendar = Calendar.current
        let now = Date()
        var today: [Episode] = []
        var thisWeek: [Episode] = []
        var older: [Episode] = []

        for episode in filtered {
            guard let date = episode.displayDate else { continue }
            if calendar.isDateInToday(date) {
                today.append(episode)
            } else if let weekAgo = calendar.date(byAdding: .day, value: -7, to: now),
                      date >= weekAgo {
                thisWeek.append(episode)
            } else {
                older.append(episode)
            }
        }

        var sections: [EpisodeSection] = []
        if today.isEmpty == false { sections.append(EpisodeSection(title: "Today", episodes: today)) }
        if thisWeek.isEmpty == false { sections.append(EpisodeSection(title: "This Week", episodes: thisWeek)) }
        if older.isEmpty == false { sections.append(EpisodeSection(title: "Earlier", episodes: older)) }
        return sections
    }

    private var filteredBriefTopics: [Topic] {
        let ordered = topicsViewModel.topics.sorted { $0.orderIndex < $1.orderIndex }
        let trimmed = briefsSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return ordered }
        let term = trimmed.lowercased()
        return ordered.filter { topic in
            topic.displayTitle.lowercased().contains(term) ||
            topic.originalText.lowercased().contains(term) ||
            (topic.classificationShortLabel?.lowercased().contains(term) ?? false)
        }
    }

    struct SearchEpisodeRow: View {
        let episode: Episode
        @EnvironmentObject private var playbackHistory: PlaybackHistory
        @EnvironmentObject private var audioManager: AudioPlayerManager

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .center, spacing: 10) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(episode.displayDateLabel)
                            .font(.caption.weight(.medium))
                            .foregroundColor(.brieflyTextMuted)
                        Text(episode.displayTitle)
                            .font(.callout.weight(.semibold))
                            .foregroundColor(.primary)
                            .lineLimit(2)
                        Text(episode.subtitle)
                            .font(.footnote)
                            .foregroundColor(.brieflyTextMuted)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 8)
                    coverImageView
                }

                pillRow
            }
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
        }

        private var coverImageView: some View {
            let maxPixelSize = Int(ceil(72 * UIScreen.main.scale))
            return ZStack {
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
            .frame(width: 72, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }

        private var fallbackArtwork: some View {
            Image(systemName: "waveform.circle.fill")
                .font(.system(size: 28, weight: .semibold))
                .foregroundColor(Color.brieflySecondary)
        }

        private var pillRow: some View {
            let isCurrentlyPlaying = audioManager.isPlaying && audioManager.currentEpisode?.id == episode.id
            return HStack(spacing: 8) {
                durationPill
                partialPlaybackStatus(isCurrentlyPlaying: isCurrentlyPlaying)
                if isCurrentlyPlaying == false, playbackHistory.isListened(episode.id) {
                    listenedPill
                }
            }
        }

        private var durationPill: some View {
            let label = durationLabel(episode.durationDisplaySeconds)
            return HStack(spacing: 4) {
                Image(systemName: "play.fill")
                    .font(.caption2.weight(.semibold))
                Text(label)
                    .font(.caption.weight(.semibold))
            }
            .padding(.vertical, 4)
            .padding(.horizontal, 8)
            .background(Color.warmGrey)
            .foregroundColor(Color.gold)
            .clipShape(Capsule())
        }

        @ViewBuilder
        private func partialPlaybackStatus(isCurrentlyPlaying: Bool) -> some View {
            if let remainingSeconds = playbackHistory.remainingSeconds(episodeID: episode.id, fallbackDurationSeconds: episode.durationDisplaySeconds),
               let fraction = playbackHistory.partialPlaybackFraction(episodeID: episode.id, fallbackDurationSeconds: episode.durationDisplaySeconds) {
                HStack(spacing: 8) {
                    if isCurrentlyPlaying {
                        EqualizerWaveform(isAnimating: true, color: Color.gold, barCount: 4, minHeight: 4, maxHeight: 14, barWidth: 2, spacing: 2)
                            .accessibilityLabel("Playing")
                   } else {
                       Text(remainingLabel(seconds: remainingSeconds))
                           .font(.caption.weight(.medium))
                           .foregroundColor(Color.gold)
                   }

                    progressBar(fraction: fraction, width: 64, height: 2)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(isCurrentlyPlaying ? "Playing. \(remainingLabel(seconds: remainingSeconds)) remaining" : "\(remainingLabel(seconds: remainingSeconds)) remaining")
            }
        }

        private func progressBar(fraction: Double, width: CGFloat, height: CGFloat) -> some View {
            let clamped = max(0, min(fraction, 1))
            return ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.brieflyListenedBackground.opacity(0.6))
                Capsule()
                    .fill(Color.gold)
                    .frame(width: width * clamped)
            }
            .frame(width: width, height: height)
        }

        private var listenedPill: some View {
            HStack(spacing: 4) {
                Image(systemName: "checkmark")
                    .font(.caption2.weight(.semibold))
                Text("Listened")
                    .font(.caption.weight(.semibold))
            }
            .padding(.vertical, 4)
            .padding(.horizontal, 8)
            .background(Color.brieflyListenedBackground)
            .foregroundColor(Color.brieflyPrimary)
            .clipShape(Capsule())
        }

        private func durationLabel(_ seconds: Double?) -> String {
            guard let seconds, seconds.isFinite, seconds > 0 else { return "—" }
            let minutes = max(Int(round(seconds / 60)), 1)
            return "\(minutes)m"
        }

        private func remainingLabel(seconds: Double) -> String {
            guard seconds.isFinite, seconds > 0 else { return "— min left" }
            let minutes = max(Int(ceil(seconds / 60)), 1)
            return minutes == 1 ? "1 min left" : "\(minutes) min left"
        }
    }

    struct SearchBriefRow: View {
        let topic: Topic
        let classificationLabels: [String]
        let isInactiveAtLimit: Bool
        let onEdit: () -> Void
        let onToggleActive: () -> Void

        var body: some View {
            HStack(alignment: .center, spacing: 14) {
                Button {
                    onEdit()
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(topic.displayTitle)
                            .font(.callout.weight(.semibold))
                            .foregroundColor(.primary)
                            .lineLimit(2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(topic.originalText)
                            .font(.footnote)
                            .foregroundColor(.brieflyTextMuted)
                            .lineLimit(2)
                            .truncationMode(.tail)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if classificationLabels.isEmpty == false {
                            HStack(spacing: 8) {
                                ForEach(classificationLabels, id: \.self) { label in
                                    Text(label)
                                        .font(.system(size: 13, weight: .semibold))
                                        .italic()
                                        .foregroundColor(.brieflyClassificationPillText)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(Color.warmGrey)
                                        .clipShape(Capsule())
                                }
                            }
                            .padding(.top, 2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)

                Spacer(minLength: 12)

                Button {
                    onToggleActive()
                } label: {
                    Image(systemName: topic.isActive ? "minus.circle.fill" : "plus.circle.fill")
                        .foregroundStyle(
                            topic.isActive
                            ? Color.offBlack
                            : (isInactiveAtLimit ? Color.brieflyTextMuted : Color.offBlack)
                        )
                        .font(.system(size: 22, weight: .semibold))
                }
                .buttonStyle(.borderless)
                .opacity(isInactiveAtLimit ? 0.5 : 1)
            }
            .contentShape(Rectangle())
            .padding(.vertical, 8)
        }
    }


    private func classificationLabels(from rawLabel: String?) -> [String] {
        guard let rawLabel = rawLabel?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              rawLabel.isEmpty == false else { return [] }

        let normalized = rawLabel.replacingOccurrences(of: "/", with: ",")
        let components = normalized
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.isEmpty == false }

        if components.isEmpty {
            return [rawLabel]
        }
        return components
    }

    @ViewBuilder
    private func briefsSearchList(contentBottomPadding: CGFloat, bottomSafeAreaInset: CGFloat) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(filteredBriefTopics) { topic in
                    SearchBriefRow(
                        topic: topic,
                        classificationLabels: classificationLabels(from: topic.classificationShortLabel),
                        isInactiveAtLimit: !topic.isActive && !topicsViewModel.canAddActiveTopic,
                        onEdit: { searchEditingTopic = topic },
                        onToggleActive: {
                            if topic.isActive {
                                Task { await topicsViewModel.deactivateTopic(topic) }
                            } else if topicsViewModel.canAddActiveTopic {
                                Task { await topicsViewModel.activateTopic(topic) }
                            } else {
                                showSearchActiveLimitAlert = true
                            }
                        }
                    )
                    .padding(.horizontal, 20)
                }
                Spacer(minLength: contentBottomPadding + bottomSafeAreaInset)
            }
        }
        .background(Color.brieflyBackground)
        .sheet(item: $searchEditingTopic) { topic in
            NavigationStack {
                TopicEditView(viewModel: topicsViewModel, topic: topic)
            }
        }
        .alert("Active Brief limit reached", isPresented: $showSearchActiveLimitAlert) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("You can have up to \(topicsViewModel.maxActiveTopics) active Briefs on your plan.")
        }
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
