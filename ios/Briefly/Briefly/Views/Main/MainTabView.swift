import SwiftUI

struct MainTabView: View {
    @StateObject private var homeViewModel: HomeViewModel
    @StateObject private var episodesViewModel: EpisodesViewModel
    @StateObject private var topicsViewModel: TopicsViewModel
    @StateObject private var settingsViewModel: SettingsViewModel
    private let appViewModel: AppViewModel

    init(appViewModel: AppViewModel) {
        self.appViewModel = appViewModel
        _homeViewModel = StateObject(wrappedValue: HomeViewModel(episodeService: appViewModel.episodeService,
                                                                 audioManager: appViewModel.audioPlayer))
        _episodesViewModel = StateObject(wrappedValue: EpisodesViewModel(episodeService: appViewModel.episodeService))
        _topicsViewModel = StateObject(wrappedValue: TopicsViewModel(topicService: appViewModel.topicService))
        _settingsViewModel = StateObject(wrappedValue: SettingsViewModel(appViewModel: appViewModel))
    }

    var body: some View {
        TabView {
            NavigationStack {
                HomeView(viewModel: homeViewModel)
            }
            .tabItem {
                Label("Home", systemImage: "house.fill")
            }

            NavigationStack {
                EpisodesView(viewModel: episodesViewModel)
            }
            .tabItem {
                Label("Episodes", systemImage: "list.bullet.rectangle")
            }

            NavigationStack {
                TopicsView(viewModel: topicsViewModel)
            }
            .tabItem {
                Label("Topics", systemImage: "text.bubble")
            }

            NavigationStack {
                SettingsView(viewModel: settingsViewModel, email: appViewModel.currentUserEmail)
            }
            .tabItem {
                Label("Settings", systemImage: "gear")
            }
        }
    }
}
