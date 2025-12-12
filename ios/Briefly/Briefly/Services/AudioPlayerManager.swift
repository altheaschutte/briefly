import Foundation
import AVFoundation

final class AudioPlayerManager: NSObject, ObservableObject {
    @Published var currentEpisode: Episode?
    @Published var isPlaying: Bool = false
    @Published var progress: Double = 0
    @Published var currentTimeSeconds: Double = 0
    @Published var durationSeconds: Double = 0

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var playbackSpeed: Double = 1.0

    override init() {
        super.init()
        configureSession()
    }

    func play(episode: Episode) {
        guard let url = episode.audioURL else { return }
        // Stop observing the previous player before swapping in a new instance.
        removeTimeObserverIfNeeded()
        player?.pause()

        currentEpisode = episode
        let newPlayer = AVPlayer(url: url)
        player = newPlayer
        addTimeObserver()
        newPlayer.play()
        newPlayer.rate = Float(playbackSpeed)
        isPlaying = true
        durationSeconds = episode.durationSeconds ?? newPlayer.currentItem?.asset.duration.seconds ?? 0
    }

    func pause() {
        player?.pause()
        isPlaying = false
    }

    func resume() {
        player?.play()
        player?.rate = Float(playbackSpeed)
        isPlaying = true
    }

    func stop() {
        player?.pause()
        isPlaying = false
        progress = 0
        currentTimeSeconds = 0
    }

    func seek(to progress: Double) {
        guard let duration = player?.currentItem?.duration.seconds, duration.isFinite else { return }
        let seconds = duration * progress
        let time = CMTime(seconds: seconds, preferredTimescale: 600)
        player?.seek(to: time) { [weak self] _ in
            self?.currentTimeSeconds = seconds
            self?.progress = progress
        }
    }

    func setPlaybackSpeed(_ speed: Double) {
        playbackSpeed = max(0.5, min(speed, 2.0))
        if isPlaying {
            player?.rate = Float(playbackSpeed)
        }
    }

    /// Refresh the current episode metadata with a freshly fetched list.
    /// If the episode no longer exists, stop playback to keep UI in sync.
    func syncCurrentEpisode(with episodes: [Episode]) {
        guard let current = currentEpisode else { return }
        if let updated = episodes.first(where: { $0.id == current.id }) {
            // Only update when metadata changes to avoid unnecessary publishes.
            if updated.title != current.title ||
                updated.episodeNumber != current.episodeNumber ||
                updated.summary != current.summary ||
                updated.audioURL != current.audioURL ||
                updated.durationSeconds != current.durationSeconds ||
                updated.status != current.status {
                currentEpisode = updated
                durationSeconds = updated.durationSeconds ?? durationSeconds
            }
        } else {
            stop()
            currentEpisode = nil
        }
    }

    private func configureSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.interruptSpokenAudioAndMixWithOthers])
        } catch {
            print("Failed to set audio session: \(error)")
        }
    }

    private func addTimeObserver() {
        removeTimeObserverIfNeeded()
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self, let duration = self.player?.currentItem?.duration.seconds, duration.isFinite else { return }
            let current = time.seconds
            self.currentTimeSeconds = current
            self.durationSeconds = duration
            self.progress = duration > 0 ? current / duration : 0
        }
    }

    private func removeTimeObserverIfNeeded() {
        if let player, let timeObserver {
            player.removeTimeObserver(timeObserver)
            self.timeObserver = nil
        }
    }

    deinit {
        removeTimeObserverIfNeeded()
    }
}
