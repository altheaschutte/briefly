import SwiftUI

struct MainTabView: View {
    private enum Tab {
        case feed, create, settings
    }

    @StateObject private var feedViewModel: EpisodesViewModel
    @StateObject private var topicsViewModel: TopicsViewModel
    @StateObject private var settingsViewModel: SettingsViewModel
    @State private var selection: Tab
    private let appViewModel: AppViewModel

    init(appViewModel: AppViewModel) {
        self.appViewModel = appViewModel
        _feedViewModel = StateObject(wrappedValue: EpisodesViewModel(episodeService: appViewModel.episodeService))
        _topicsViewModel = StateObject(wrappedValue: TopicsViewModel(topicService: appViewModel.topicService))
        _settingsViewModel = StateObject(wrappedValue: SettingsViewModel(appViewModel: appViewModel,
                                                                         audioManager: appViewModel.audioPlayer))
        _selection = State(initialValue: appViewModel.hasCompletedOnboarding ? .feed : .create)
    }

    var body: some View {
        TabView(selection: $selection) {
            NavigationStack {
                FeedView(viewModel: feedViewModel) {
                    selection = .create
                }
            }
            .tabItem { Label("Your Library", systemImage: "play.square.stack") }
            .tag(Tab.feed)

            NavigationStack {
                SetupView(topicsViewModel: topicsViewModel, appViewModel: appViewModel)
            }
            .tabItem { Label("Create", systemImage: "sparkles") }
            .tag(Tab.create)

            NavigationStack {
                SettingsView(viewModel: settingsViewModel, email: appViewModel.currentUserEmail)
            }
            .tabItem { Label("Settings", systemImage: "gear") }
            .tag(Tab.settings)
        }
        .onChange(of: appViewModel.hasCompletedOnboarding) { completed in
            if completed {
                selection = .feed
            }
        }
    }
}
