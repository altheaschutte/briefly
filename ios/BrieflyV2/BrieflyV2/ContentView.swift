//
//  ContentView.swift
//  BrieflyV2
//
//  Created by Balaji Venkatesh on 20/06/25.
//

import SwiftUI

struct ContentView: View {
    @State private var searchText: String = ""
    @State private var selectedEpisode: Episode?
    @State private var episodeDetailSource: EpisodeDetailSource = .miniPlayer
    @Namespace private var animation
    @Namespace private var listAnimation
    @EnvironmentObject private var appViewModel: AppViewModel
    @EnvironmentObject private var audioPlayer: AudioPlayerManager
    var body: some View {
        Group {
            if #available(iOS 26, *) {
                NativeTabView()
                    .tabBarMinimizeBehavior(.onScrollDown)
                    .tabViewBottomAccessory {
                        if let episode = audioPlayer.currentEpisode {
                            MiniPlayerView(episode)
                                .matchedTransitionSource(id: "MINIPLAYER-\(episode.id)", in: animation)
                                .onTapGesture {
                                    presentEpisode(episode, source: .miniPlayer)
                                }
                        }
                    }
            } else {
                NativeTabView(60)
                    .overlay(alignment: .bottom) {
                        if let episode = audioPlayer.currentEpisode {
                            MiniPlayerView(episode)
                                .padding(.vertical, 8)
                                .background(content: {
                                    ZStack {
                                        RoundedRectangle(cornerRadius: 15, style: .continuous)
                                            .fill(.gray.opacity(0.3))
                                        
                                        RoundedRectangle(cornerRadius: 15, style: .continuous)
                                            .fill(.background)
                                            .padding(1.2)
                                    }
                                    .compositingGroup()
                                })
                                .matchedTransitionSource(id: "MINIPLAYER-\(episode.id)", in: animation)
                                .onTapGesture {
                                    presentEpisode(episode, source: .miniPlayer)
                                }
                                .offset(y: -52)
                                .padding(.horizontal, 15)
                        }
                    }
                    .ignoresSafeArea(.keyboard, edges: .all)
            }
        }
        .fullScreenCover(item: $selectedEpisode) { episode in
            NavigationStack {
                EpisodeDetailView(
                    episode: episode,
                    service: EpisodeService(baseURL: APIConfig.baseURL) { [weak appViewModel] in
                        appViewModel?.authManager.currentToken?.accessToken
                    },
                    usesCustomChrome: true
                )
            }
            .navigationTransition(.zoom(sourceID: transitionSourceID(for: episode), in: transitionNamespace))
        }
    }
    
    /// Let's First Start with TabView
    @ViewBuilder
    func NativeTabView(_ safeAreaBottomPadding: CGFloat = 0) -> some View {
        TabView {
            Tab.init("Library", systemImage: "square.stack.fill") {
                NavigationStack {
                    LibraryView(appViewModel: appViewModel,
                                safeAreaBottomPadding: safeAreaBottomPadding,
                                namespace: listAnimation) { episode in
                        presentEpisode(episode, source: .listItem)
                    }
                }
            }
            
            Tab.init("Create", systemImage: "mic.fill") {
                NavigationStack {
                    CreateChatView(
                        service: ProducerChatService(
                            baseURL: APIConfig.baseURL,
                            tokenProvider: { appViewModel.authManager.currentToken?.accessToken }
                        )
                    )
                        .safeAreaPadding(.bottom, safeAreaBottomPadding)
                }
            }
            
            Tab.init("Settings", systemImage: "gearshape.fill") {
                NavigationStack {
                    SettingsView(
                        appViewModel: appViewModel,
                        audioManager: audioPlayer,
                        email: appViewModel.currentUserEmail,
                        safeAreaBottomPadding: safeAreaBottomPadding
                    )
                }
            }
            
            Tab.init("Search", systemImage: "magnifyingglass", role: .search) {
                NavigationStack {
                    List {
                        
                    }
                    .navigationTitle("Search")
                    .searchable(text: $searchText, placement: .toolbar, prompt: Text("Search..."))
                    .safeAreaPadding(.bottom, safeAreaBottomPadding)
                }
            }
        }
    }
    
    /// Resuable Player Info
    @ViewBuilder
    func PlayerInfo(_ episode: Episode, size: CGSize) -> some View {
        HStack(spacing: 12) {
            coverImage(for: episode, size: size)
            
            VStack(alignment: .leading, spacing: 6) {
                Text(episode.displayTitle)
                    .font(.callout)
                    .foregroundStyle(Color.brieflyTabBarActive)
                
                Text(episode.subtitle)
                    .font(.caption2)
                    .foregroundStyle(Color.brieflyTabBarInactive)
            }
            .lineLimit(1)
        }
    }
    
    /// MiniPlayer View
    @ViewBuilder
    func MiniPlayerView(_ episode: Episode) -> some View {
        HStack(spacing: 15) {
            PlayerInfo(episode, size: .init(width: 42, height: 42))
            
            Spacer(minLength: 0)
            
            /// Action Buttons
            Button {
                audioPlayer.togglePlayPause()
            } label: {
                Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                    .contentShape(.rect)
            }
            .padding(.trailing, 4)
        }
        .foregroundStyle(Color.brieflyTabBarActive)
        .padding(.horizontal, 15)
    }

    private func coverImage(for episode: Episode, size: CGSize) -> some View {
        Group {
            if let url = episode.coverImageURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .empty, .failure:
                        coverPlaceholder
                    @unknown default:
                        coverPlaceholder
                    }
                }
            } else {
                coverPlaceholder
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: size.height / 4))
    }

    private var coverPlaceholder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.brieflySurface)
            Image(systemName: "waveform")
                .foregroundColor(.brieflyTextMuted)
                .font(.footnote.weight(.semibold))
        }
    }

    private enum EpisodeDetailSource {
        case miniPlayer
        case listItem
    }

    private var transitionNamespace: Namespace.ID {
        switch episodeDetailSource {
        case .miniPlayer:
            return animation
        case .listItem:
            return listAnimation
        }
    }

    private func transitionSourceID(for episode: Episode) -> String {
        switch episodeDetailSource {
        case .miniPlayer:
            return "MINIPLAYER-\(episode.id)"
        case .listItem:
            return "EPISODE-\(episode.id)"
        }
    }

    private func presentEpisode(_ episode: Episode, source: EpisodeDetailSource) {
        episodeDetailSource = source
        selectedEpisode = episode
    }
}

#Preview {
    ContentView()
}
