import SwiftUI

struct FeedView: View {
    @ObservedObject var viewModel: EpisodesViewModel
    @EnvironmentObject private var audioManager: AudioPlayerManager

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let latest = viewModel.latestEpisode {
                    latestCard(for: latest)
                } else if viewModel.isLoading {
                    ProgressView("Loading your feed…")
                        .frame(maxWidth: .infinity, alignment: .center)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("No episodes yet")
                            .font(.headline)
                        Text("Create topics in Setup to generate your first Briefly episode.")
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(12)
                }

                if viewModel.previousEpisodes.isEmpty == false {
                    Text("Previous episodes")
                        .font(.headline)
                    VStack(spacing: 12) {
                        ForEach(viewModel.previousEpisodes) { episode in
                            NavigationLink(value: episode) {
                                EpisodeRow(episode: episode)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Your Feed")
        .navigationDestination(for: Episode.self) { episode in
            EpisodeDetailView(episode: episode)
        }
        .onAppear {
            Task { await viewModel.load() }
        }
        .refreshable {
            await viewModel.load()
        }
        .overlay(alignment: .bottom) {
            PlayerBarView()
                .padding(.bottom, 8)
        }
    }

    private func latestCard(for episode: Episode) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Latest episode")
                .font(.caption)
                .foregroundColor(.secondary)
            Text(episode.title)
                .font(.title2.bold())
            Text(episode.summary)
                .foregroundColor(.secondary)
                .lineLimit(3)

            HStack(spacing: 12) {
                Button(action: { togglePlay(episode) }) {
                    Label(audioManager.isPlaying && audioManager.currentEpisode?.id == episode.id ? "Pause" : "Play",
                          systemImage: audioManager.isPlaying && audioManager.currentEpisode?.id == episode.id ? "pause.fill" : "play.fill")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }

                NavigationLink(value: episode) {
                    Text("Details")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(.tertiarySystemFill))
                        .cornerRadius(12)
                }
                .buttonStyle(.plain)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }

    private func togglePlay(_ episode: Episode) {
        if audioManager.currentEpisode?.id == episode.id {
            if audioManager.isPlaying {
                audioManager.pause()
            } else {
                audioManager.resume()
            }
        } else {
            audioManager.play(episode: episode)
        }
    }
}

private struct EpisodeRow: View {
    let episode: Episode

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(episode.title)
                .font(.headline)
            Text(episode.summary)
                .font(.subheadline)
                .foregroundColor(.secondary)
            if let duration = episode.durationSeconds {
                Text(durationString(duration))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    private func durationString(_ seconds: Double) -> String {
        let minutes = Int(seconds) / 60
        return "\(minutes) min"
    }
}
