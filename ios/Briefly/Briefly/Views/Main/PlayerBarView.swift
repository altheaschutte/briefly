import SwiftUI

struct PlayerBarView: View {
    @EnvironmentObject private var audioManager: AudioPlayerManager

    var body: some View {
        Group {
            if let episode = audioManager.currentEpisode {
                VStack(spacing: 8) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(episode.displayTitle)
                                .font(.caption2)
                                .lineLimit(1)
                            Text(timeString(audioManager.currentTimeSeconds) + " / " + timeString(audioManager.durationSeconds))
                                .font(.caption)
                                .foregroundColor(.brieflyTextMuted)
                        }
                        Spacer()
                        Button(action: togglePlay) {
                            Image(systemName: audioManager.isPlaying ? "pause.fill" : "play.fill")
                                .font(.title2)
                        }
                    }
                    Slider(value: Binding(get: {
                        audioManager.progress
                    }, set: { newValue in
                        audioManager.seek(to: newValue)
                    }))
                }
                .padding(12)
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

    private func timeString(_ seconds: Double) -> String {
        guard seconds.isFinite else { return "--:--" }
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%02d:%02d", minutes, secs)
    }
}
