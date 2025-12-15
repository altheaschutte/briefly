import SwiftUI

struct EpisodeDetailView: View {
    let episode: Episode
    @EnvironmentObject private var audioManager: AudioPlayerManager

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(episode.displayTitle)
                    .font(.title.bold())
                if let date = episode.displayDate {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .foregroundColor(.brieflyTextMuted)
                }
                Text(episode.summary)
                    .foregroundColor(.primary)

                if let topics = episode.topics, topics.isEmpty == false {
                    Text("Topics")
                        .font(.headline)
                    ForEach(topics) { topic in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(topic.originalText)
                                .foregroundColor(.primary)
                        }
                        .padding()
                        .background(Color.brieflySurface)
                        .cornerRadius(10)
                    }
                }

                playControls
            }
            .padding()
        }
        .background(Color.brieflyBackground)
        .navigationTitle("Episode")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { audioManager.play(episode: episode) }) {
                    Image(systemName: "play.circle")
                }
            }
        }
    }

    private var playControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button(action: { audioManager.play(episode: episode) }) {
                    Image(systemName: "play.fill")
                        .padding()
                }
                Button(action: audioManager.pause) {
                    Image(systemName: "pause.fill")
                        .padding()
                }
                Spacer()
                Text(timeString(displayedCurrentTime))
                    .font(.footnote)
                Text("/")
                    .foregroundColor(.brieflyTextMuted)
                Text(timeString(displayedDuration))
                    .font(.footnote)
            }
            Slider(value: Binding(get: {
                audioManager.progress
            }, set: { newValue in
                audioManager.seek(to: newValue)
            }))
        }
    }

    private var displayedCurrentTime: Double {
        audioManager.currentEpisode?.id == episode.id ? audioManager.currentTimeSeconds : 0
    }

    private var displayedDuration: Double? {
        if audioManager.currentEpisode?.id == episode.id, audioManager.durationSeconds > 0 {
            return audioManager.durationSeconds
        }
        return episode.durationDisplaySeconds
    }

    private func timeString(_ seconds: Double?) -> String {
        guard let seconds, seconds.isFinite else { return "--:--" }
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%02d:%02d", minutes, secs)
    }
}
