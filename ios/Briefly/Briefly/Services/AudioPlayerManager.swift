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
    private var statusObserver: NSKeyValueObservation?
    private var playbackSpeed: Double = 1.0
    private var didRetryPlayback: Bool = false
    private let audioURLProvider: ((UUID) async -> URL?)?

    init(audioURLProvider: ((UUID) async -> URL?)? = nil) {
        self.audioURLProvider = audioURLProvider
        super.init()
        configureSession()
    }

    func play(episode: Episode, from startTime: Double? = nil) {
        Task { [weak self] in
            await self?.preparePlayback(episode: episode, startTime: startTime)
        }
    }

    @MainActor
    private func preparePlayback(episode: Episode, startTime: Double?) async {
        var resolvedEpisode = episode
        if resolvedEpisode.audioURL == nil, let urlProvider = audioURLProvider {
            if let refreshed = await urlProvider(episode.id) {
                resolvedEpisode.audioURL = refreshed
            }
        }

        guard let url = resolvedEpisode.audioURL else {
            isPlaying = false
            return
        }

        let startSeconds = max(startTime ?? 0, 0)
        startPlayback(episode: resolvedEpisode, url: url, startSeconds: startSeconds)
    }

    @MainActor
    private func startPlayback(episode: Episode, url: URL, startSeconds: Double) {
        // Stop observing the previous player before swapping in a new instance.
        let needsNewPlayer = currentEpisode?.id != episode.id ||
            player == nil ||
            currentEpisode?.audioURL != episode.audioURL
        if needsNewPlayer {
            removeTimeObserverIfNeeded()
            removeStatusObserverIfNeeded()
            player?.pause()

            currentEpisode = episode
            let item = AVPlayerItem(url: url)
            let newPlayer = AVPlayer(playerItem: item)
            player = newPlayer
            didRetryPlayback = false
            addStatusObserver(for: item, episode: episode, startSeconds: startSeconds)
            addTimeObserver()
            if let duration = episode.durationSeconds, duration.isFinite {
                durationSeconds = duration
            } else if let assetDuration = newPlayer.currentItem?.asset.duration.seconds, assetDuration.isFinite {
                durationSeconds = assetDuration
            } else {
                durationSeconds = 0
            }
            progress = 0
            currentTimeSeconds = 0
        } else {
            currentEpisode = episode
        }

        seek(toSeconds: startSeconds, autoPlay: true)
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
        guard let duration = player?.currentItem?.duration.seconds, duration.isFinite, duration > 0 else { return }
        let clampedProgress = max(0, min(progress, 1))
        let seconds = duration * clampedProgress
        seek(toSeconds: seconds, autoPlay: nil)
    }

    func seek(toSeconds seconds: Double, autoPlay: Bool? = nil) {
        guard let player else { return }
        let duration = player.currentItem?.duration.seconds
        let validDuration = (duration?.isFinite == true && (duration ?? 0) > 0) ? duration : nil
        let clampedSeconds = max(0, min(seconds, validDuration ?? seconds))
        let time = CMTime(seconds: clampedSeconds, preferredTimescale: 600)
        player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            guard let self else { return }
            self.currentTimeSeconds = clampedSeconds
            if let durationSeconds = validDuration {
                self.durationSeconds = durationSeconds
                self.progress = durationSeconds > 0 ? clampedSeconds / durationSeconds : 0
            }
            let shouldPlay = autoPlay ?? self.isPlaying
            if shouldPlay {
                player.play()
                player.rate = Float(self.playbackSpeed)
                self.isPlaying = true
            }
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

    private func addStatusObserver(for item: AVPlayerItem, episode: Episode, startSeconds: Double) {
        removeStatusObserverIfNeeded()
        statusObserver = item.observe(\.status, options: [.new]) { [weak self] observedItem, _ in
            guard let self else { return }
            if observedItem.status == .failed {
                Task {
                    await self.retryPlayback(for: episode, startSeconds: startSeconds)
                }
            }
        }
    }

    @MainActor
    private func retryPlayback(for episode: Episode, startSeconds: Double) async {
        guard didRetryPlayback == false, let urlProvider = audioURLProvider else {
            isPlaying = false
            return
        }
        didRetryPlayback = true

        if let refreshed = await urlProvider(episode.id) {
            var refreshedEpisode = episode
            refreshedEpisode.audioURL = refreshed
            startPlayback(episode: refreshedEpisode, url: refreshed, startSeconds: startSeconds)
        } else {
            isPlaying = false
        }
    }

    private func removeStatusObserverIfNeeded() {
        statusObserver?.invalidate()
        statusObserver = nil
    }

    private func configureSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.interruptSpokenAudioAndMixWithOthers])
            try session.setActive(true, options: [])
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
        removeStatusObserverIfNeeded()
    }
}
