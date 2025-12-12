import SwiftUI

struct EpisodesView: View {
    @ObservedObject var viewModel: EpisodesViewModel
    @EnvironmentObject private var audioManager: AudioPlayerManager

    var body: some View {
        List {
            ForEach(viewModel.sections) { section in
                Section(header: Text(section.title)) {
                    ForEach(section.episodes) { episode in
                        NavigationLink(value: episode) {
                            EpisodeRow(episode: episode)
                        }
                    }
                }
            }
        }
        .navigationTitle("Episodes")
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
        .padding(.vertical, 4)
    }

    private func durationString(_ seconds: Double) -> String {
        let minutes = Int(seconds) / 60
        return "\(minutes) min"
    }
}
