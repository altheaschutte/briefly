import SwiftUI

struct PlayerBarView: View {
    let onCreateEpisode: (() -> Void)?
    @EnvironmentObject private var audioManager: AudioPlayerManager
    @State private var navigateToDetail: Bool = false

    init(onCreateEpisode: (() -> Void)? = nil) {
        self.onCreateEpisode = onCreateEpisode
    }

    var body: some View {
        Group {
            if let episode = audioManager.currentEpisode {
                ZStack {
                    NavigationLink(
                        destination: EpisodeDetailView(episode: episode, onCreateEpisode: onCreateEpisode),
                        isActive: $navigateToDetail
                    ) { EmptyView() }
                    .hidden()

                    VStack(spacing: 8) {
                        HStack(spacing: 12) {
                            Text(episode.displayTitle)
                                .font(.callout.weight(.semibold))
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)

                            Button(action: togglePlay) {
                                Image(systemName: audioManager.isPlaying ? "pause.fill" : "play.fill")
                                    .font(.title2.weight(.semibold))
                                    .foregroundColor(.primary)
                            }
                            .buttonStyle(.borderless)
                        }

                        progressBar
                    }
                    .padding(.vertical, 10)
                    .padding(.horizontal, 12)
                    .background(Color.brieflySurface)
                    .cornerRadius(12)
                    .padding(.horizontal)
                    .contentShape(Rectangle())
                    .simultaneousGesture(
                        TapGesture().onEnded { navigateToDetail = true }
                    )
                }
            }
        }
    }

    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(Color.brieflyBorder)
                Rectangle()
                    .fill(Color.brieflyPrimary)
                    .frame(width: max(0, min(audioManager.progress, 1)) * geo.size.width)
            }
            .cornerRadius(2)
        }
        .frame(height: 3)
    }

    private func togglePlay() {
        if audioManager.isPlaying {
            audioManager.pause()
        } else if let episode = audioManager.currentEpisode {
            audioManager.play(episode: episode)
        }
    }
}
