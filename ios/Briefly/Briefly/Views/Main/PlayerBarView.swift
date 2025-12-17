import SwiftUI

struct PlayerBarView: View {
    @EnvironmentObject private var audioManager: AudioPlayerManager

    var body: some View {
        Group {
            if let episode = audioManager.currentEpisode {
                HStack(spacing: 12) {
                    Text(episode.displayTitle)
                        .font(.callout)
                        .lineLimit(1)
                    Spacer()
                    Button(action: togglePlay) {
                        Image(systemName: audioManager.isPlaying ? "pause.fill" : "play.fill")
                            .font(.title2)
                    }
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
                .background(Color.brieflySurface)
                .cornerRadius(12)
                .padding(.horizontal)
            }
        }
    }

    private func togglePlay() {
        if audioManager.isPlaying {
            audioManager.pause()
        } else if let episode = audioManager.currentEpisode {
            audioManager.play(episode: episode)
        }
    }
}
