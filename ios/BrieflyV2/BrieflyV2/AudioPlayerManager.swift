import AVFoundation
import Combine
import Foundation

@MainActor
final class AudioPlayerManager: ObservableObject {
    @Published var currentEpisode: Episode?
    @Published var isPlaying: Bool = false
    @Published var progress: Double = 0
    @Published var currentTimeSeconds: Double = 0
    @Published var durationSeconds: Double = 0
    @Published var playbackSpeed: Double

    private var player: AVPlayer?
    private var timeObserver: Any?
    private let service: EpisodeService
    private let playbackPreferences: PlaybackPreferences
    private let playbackHistory: PlaybackHistory?
    private var endObserver: Any?
    private var lastEpisodeId: UUID?
    private var lastPlaybackSeconds: Double = 0 {
        didSet { persistState() }
    }
    private let defaults = UserDefaults.standard
    private let lastEpisodeKey = "BrieflyV2_LastEpisodeId"
    private let lastPositionKey = "BrieflyV2_LastPosition"

    init(
        service: EpisodeService,
        playbackPreferences: PlaybackPreferences = PlaybackPreferences(),
        playbackHistory: PlaybackHistory? = nil
    ) {
        self.service = service
        self.playbackPreferences = playbackPreferences
        self.playbackHistory = playbackHistory
        self.playbackSpeed = playbackPreferences.playbackSpeed
        restorePersistedState()
    }

    func play(episode: Episode, from startTime: Double? = nil) {
        Task { [weak self] in
            await self?.preparePlayback(episode: episode, startTime: startTime)
        }
    }

    private func preparePlayback(episode: Episode, startTime: Double?) async {
        let startSeconds: Double
        if let startTime {
            startSeconds = max(startTime, 0)
        } else if let resumeSeconds = playbackHistory?.resumePositionSeconds(
            for: episode.id,
            durationSeconds: episode.durationDisplaySeconds ?? 0
        ) {
            startSeconds = resumeSeconds
        } else if lastPlaybackSeconds > 0, episode.id == lastEpisodeId {
            startSeconds = lastPlaybackSeconds
        } else {
            startSeconds = 0
        }

        currentEpisode = episode
        lastEpisodeId = episode.id
        persistState()

        let url: URL?
        if let direct = episode.audioURL {
            url = direct
        } else {
            url = await service.fetchSignedAudioURL(for: episode.id)
        }
        guard let url else { return }

        startPlayback(url: url, episode: episode, startSeconds: startSeconds)
    }

    func togglePlayPause() {
        if isPlaying {
            pause()
        } else {
            resume()
        }
    }

    func pause() {
        player?.pause()
        isPlaying = false
        capturePlaybackPosition()
    }

    func resume() {
        guard let player else { return }
        if lastPlaybackSeconds > 0, currentEpisode?.id == lastEpisodeId {
            let seekTime = CMTime(seconds: lastPlaybackSeconds, preferredTimescale: 600)
            Task { await player.seek(to: seekTime) }
        }
        player.play()
        player.rate = Float(playbackSpeed)
        isPlaying = true
    }

    func stop() {
        capturePlaybackPosition()
        removeTimeObserverIfNeeded()
        player?.pause()
        player = nil
        isPlaying = false
        progress = 0
        currentTimeSeconds = 0
    }

    func seek(to progress: Double) {
        guard let duration = player?.currentItem?.duration.seconds, duration.isFinite, duration > 0 else { return }
        let clamped = max(0, min(progress, 1))
        seek(toSeconds: duration * clamped, autoPlay: nil)
    }

    func seek(toSeconds seconds: Double, autoPlay: Bool? = nil) {
        guard let player else { return }
        let duration = player.currentItem?.duration.seconds
        let validDuration = (duration?.isFinite == true && (duration ?? 0) > 0) ? duration : nil
        let clamped = max(0, min(seconds, validDuration ?? seconds))
        let time = CMTime(seconds: clamped, preferredTimescale: 600)
        player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            guard let self else { return }
            self.currentTimeSeconds = clamped
            if let validDuration {
                self.durationSeconds = validDuration
                self.progress = validDuration > 0 ? clamped / validDuration : 0
            }
            let shouldPlay = autoPlay ?? self.isPlaying
            if shouldPlay {
                player.play()
                player.rate = Float(self.playbackSpeed)
                self.isPlaying = true
            }
            self.capturePlaybackPosition()
        }
    }

    func setPlaybackSpeed(_ speed: Double) {
        let clamped = max(0.5, min(speed, 2.0))
        playbackSpeed = clamped
        playbackPreferences.playbackSpeed = clamped
        if player?.timeControlStatus == .playing {
            player?.rate = Float(clamped)
        }
    }

    private func startPlayback(url: URL, episode: Episode, startSeconds: Double) {
        removeTimeObserverIfNeeded()
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
            self.endObserver = nil
        }

        let item = AVPlayerItem(url: url)
        let newPlayer = AVPlayer(playerItem: item)
        player = newPlayer
        durationSeconds = episode.durationDisplaySeconds ?? item.asset.duration.seconds
        currentTimeSeconds = 0
        progress = 0

        if startSeconds > 0 {
            let seekTime = CMTime(seconds: startSeconds, preferredTimescale: 600)
            Task { await newPlayer.seek(to: seekTime) }
            currentTimeSeconds = startSeconds
        }

        addTimeObserver()
        observePlaybackEnd()

        newPlayer.play()
        newPlayer.rate = Float(playbackSpeed)
        isPlaying = true
    }

    private func addTimeObserver() {
        guard let player else { return }
        let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self else { return }
            let seconds = time.seconds
            if seconds.isFinite {
                self.currentTimeSeconds = seconds
            }
            if let duration = player.currentItem?.duration.seconds, duration.isFinite, duration > 0 {
                self.durationSeconds = duration
                self.progress = duration > 0 ? self.currentTimeSeconds / duration : 0
            }
        }
    }

    private func removeTimeObserverIfNeeded() {
        if let timeObserver {
            player?.removeTimeObserver(timeObserver)
            self.timeObserver = nil
        }
    }

    private func observePlaybackEnd() {
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player?.currentItem,
            queue: .main
        ) { [weak self] _ in
            self?.isPlaying = false
            self?.capturePlaybackPosition(resetToZero: true)
            if let episodeId = self?.currentEpisode?.id {
                self?.playbackHistory?.markListened(episodeId)
                self?.playbackHistory?.clearPlaybackPosition(episodeId)
            }
        }
    }

    private func capturePlaybackPosition(resetToZero: Bool = false) {
        guard resetToZero == false else {
            lastPlaybackSeconds = 0
            return
        }
        guard let player else { return }
        let seconds = CMTimeGetSeconds(player.currentTime())
        if seconds.isFinite && seconds >= 0 {
            lastPlaybackSeconds = seconds
            if let episodeId = currentEpisode?.id {
                let duration = (currentEpisode?.durationSeconds ?? player.currentItem?.duration.seconds) ?? 0
                playbackHistory?.updatePlaybackPosition(
                    episodeID: episodeId,
                    seconds: seconds,
                    durationSeconds: duration
                )
            }
        }
    }

    func restoreSession(with episodes: [Episode]) {
        if let lastId = lastEpisodeId,
           let match = episodes.first(where: { $0.id == lastId }) {
            currentEpisode = match
        } else if let first = episodes.first {
            currentEpisode = first
            lastEpisodeId = first.id
            lastPlaybackSeconds = 0
        }
    }

    private func restorePersistedState() {
        if let idString = defaults.string(forKey: lastEpisodeKey),
           let uuid = UUID(uuidString: idString) {
            lastEpisodeId = uuid
        }
        let storedPosition = defaults.double(forKey: lastPositionKey)
        if storedPosition.isNaN == false && storedPosition >= 0 {
            lastPlaybackSeconds = storedPosition
        }
    }

    private func persistState() {
        if let id = lastEpisodeId {
            defaults.set(id.uuidString, forKey: lastEpisodeKey)
        }
        defaults.set(lastPlaybackSeconds, forKey: lastPositionKey)
    }
}
