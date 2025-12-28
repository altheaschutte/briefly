import Foundation
import AVFoundation
import MediaPlayer
import UIKit
import os.log

@MainActor
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
    private var nowPlayingInfo: [String: Any] = [:]
    private var artworkCache: [URL: MPMediaItemArtwork] = [:]
    private var artworkFetchTasks: [URL: Task<MPMediaItemArtwork?, Never>] = [:]
    private let audioLog = OSLog(subsystem: "com.briefly.app", category: "Audio")

    init(audioURLProvider: ((UUID) async -> URL?)? = nil) {
        self.audioURLProvider = audioURLProvider
        super.init()
        configureSession()
        configureRemoteCommands()
        UIApplication.shared.beginReceivingRemoteControlEvents()
    }

    func play(episode: Episode, from startTime: Double? = nil) {
        Task { [weak self] in
            await self?.preparePlayback(episode: episode, startTime: startTime)
        }
    }

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
            updateNowPlayingInfo(for: episode, elapsed: startSeconds, duration: durationSeconds, rate: 0)
            os_log("Started new playback item. url=%{public}@ startSeconds=%{public}.2f duration=%{public}.2f", log: audioLog, type: .info, url.absoluteString, startSeconds, durationSeconds)
        } else {
            currentEpisode = episode
        }

        activateAudioSessionIfNeeded()
        seek(toSeconds: startSeconds, autoPlay: true)
    }

    func pause() {
        player?.pause()
        isPlaying = false
        updateNowPlayingInfo(for: currentEpisode, elapsed: currentTimeSeconds, duration: durationSeconds, rate: 0)
    }

    func resume() {
        activateAudioSessionIfNeeded()
        player?.play()
        player?.rate = Float(playbackSpeed)
        isPlaying = true
        updateNowPlayingInfo(for: currentEpisode, elapsed: currentTimeSeconds, duration: durationSeconds, rate: Float(playbackSpeed))
    }

    func stop() {
        player?.pause()
        isPlaying = false
        progress = 0
        currentTimeSeconds = 0
        if currentEpisode != nil {
            updateNowPlayingInfo(for: currentEpisode, elapsed: 0, duration: durationSeconds, rate: 0)
        } else {
            clearNowPlayingInfo()
        }
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
                self.activateAudioSessionIfNeeded()
                player.play()
                player.rate = Float(self.playbackSpeed)
                self.isPlaying = true
            }
            self.updateNowPlayingInfo(for: self.currentEpisode,
                                      elapsed: clampedSeconds,
                                      duration: validDuration ?? self.durationSeconds,
                                      rate: shouldPlay ? Float(self.playbackSpeed) : 0)
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
                updateNowPlayingInfo(for: updated, elapsed: currentTimeSeconds, duration: durationSeconds, rate: isPlaying ? Float(playbackSpeed) : 0)
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
            os_log("Audio session configured for playback", log: audioLog, type: .info)
        } catch {
            os_log("Failed to set audio session: %{public}@", log: audioLog, type: .error, error.localizedDescription)
        }
    }

    private func activateAudioSessionIfNeeded() {
        do {
            try AVAudioSession.sharedInstance().setActive(true, options: [])
        } catch {
            os_log("Failed to activate audio session: %{public}@", log: audioLog, type: .error, error.localizedDescription)
        }
    }

    private func configureRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()

        commandCenter.playCommand.isEnabled = true
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.resume()
            return .success
        }

        commandCenter.pauseCommand.isEnabled = true
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }

        commandCenter.togglePlayPauseCommand.isEnabled = true
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.isPlaying ? self.pause() : self.resume()
            return .success
        }

        let changePosition = commandCenter.changePlaybackPositionCommand
        changePosition.isEnabled = true
        changePosition.addTarget { [weak self] event in
            guard let self, let positionEvent = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            self.seek(toSeconds: positionEvent.positionTime)
            return .success
        }
        os_log("Remote command center configured", log: audioLog, type: .info)
    }

    @MainActor
    private func updateNowPlayingInfo(for episode: Episode?, elapsed: Double? = nil, duration: Double? = nil, rate: Float? = nil) {
        guard let episode else { return }
        var info = nowPlayingInfo
        info[MPMediaItemPropertyTitle] = episode.title
        info[MPMediaItemPropertyArtist] = "Briefly"
        info[MPMediaItemPropertyAlbumTitle] = "News Brief"

        if let duration, duration.isFinite {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        if let elapsed, elapsed.isFinite {
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
        }
        if let rate {
            info[MPNowPlayingInfoPropertyPlaybackRate] = rate
        }
        info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = rate ?? 1
        info[MPNowPlayingInfoPropertyMediaType] = MPNowPlayingInfoMediaType.audio.rawValue
        if let artworkURL = episode.coverImageURL {
            if let cached = artworkCache[artworkURL] {
                info[MPMediaItemPropertyArtwork] = cached
            } else {
                startArtworkFetch(for: artworkURL)
            }
        }

        nowPlayingInfo = info
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        os_log("Set nowPlayingInfo title=%{public}@ elapsed=%{public}.2f duration=%{public}.2f rate=%{public}.2f artwork=%{public}@",
               log: audioLog,
               type: .info,
               episode.title,
               elapsed ?? -1,
               duration ?? -1,
               rate ?? -1,
               (info[MPMediaItemPropertyArtwork] as? MPMediaItemArtwork) != nil ? "yes" : "no")
    }

    private func startArtworkFetch(for url: URL) {
        if artworkCache[url] != nil || artworkFetchTasks[url] != nil { return }

        let task = Task.detached(priority: .utility) { () async -> MPMediaItemArtwork? in
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                guard let image = UIImage(data: data) else { return nil }
                return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            } catch {
                return nil
            }
        }
        artworkFetchTasks[url] = task

        Task { @MainActor [weak self] in
            guard let self else { return }
            let artwork = await task.value
            self.artworkFetchTasks[url] = nil
            guard let artwork else { return }
            self.artworkCache[url] = artwork
            self.nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
            MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlayingInfo
            os_log("Updated nowPlayingInfo with fetched artwork: %{public}@", log: self.audioLog, type: .info, url.absoluteString)
        }
    }

    private func clearNowPlayingInfo() {
        nowPlayingInfo = [:]
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        os_log("Cleared nowPlayingInfo", log: audioLog, type: .info)
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
            self.updateNowPlayingInfo(for: self.currentEpisode,
                                      elapsed: current,
                                      duration: duration,
                                      rate: self.isPlaying ? Float(self.playbackSpeed) : 0)
        }
    }

    private func removeTimeObserverIfNeeded() {
        if let player, let timeObserver {
            player.removeTimeObserver(timeObserver)
            self.timeObserver = nil
        }
    }

    deinit {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.removeTimeObserverIfNeeded()
            self.removeStatusObserverIfNeeded()
        }
    }
}
