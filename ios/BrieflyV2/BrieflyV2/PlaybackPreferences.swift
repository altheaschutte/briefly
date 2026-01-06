import Foundation
import Combine

final class PlaybackPreferences {
    private static let autoPlayNextKey = "autoPlayNextEpisode"
    private static let legacyAutoPlayLatestKey = "autoPlayLatest"
    private static let playbackSpeedKey = "playbackSpeed"
    static let defaultPlaybackSpeed: Double = 1.0
    static let speedOptions: [Double] = [0.8, 1.0, 1.2, 1.5, 2.0]

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var autoPlayNextEpisode: Bool {
        get {
            let hasNewPreference = defaults.object(forKey: Self.autoPlayNextKey) != nil
            return hasNewPreference
                ? defaults.bool(forKey: Self.autoPlayNextKey)
                : defaults.bool(forKey: Self.legacyAutoPlayLatestKey)
        }
        set {
            defaults.set(newValue, forKey: Self.autoPlayNextKey)
        }
    }

    var playbackSpeed: Double {
        get {
            if defaults.object(forKey: Self.playbackSpeedKey) == nil {
                return Self.defaultPlaybackSpeed
            }
            let stored = defaults.double(forKey: Self.playbackSpeedKey)
            return max(0.5, min(stored, 2.0))
        }
        set {
            let clamped = max(0.5, min(newValue, 2.0))
            defaults.set(clamped, forKey: Self.playbackSpeedKey)
        }
    }
}

@MainActor
final class PlaybackHistory: ObservableObject {
    private static let listenedEpisodeIDsKey = "listenedEpisodeIDs"
    private static let playbackPositionsKey = "playbackPositionsByEpisodeID"

    struct EpisodePlaybackPosition: Codable, Hashable {
        var seconds: Double
        var durationSeconds: Double
        var updatedAt: Date
    }

    @Published private(set) var listenedEpisodeIDs: Set<UUID>
    @Published private(set) var playbackPositionsByEpisodeID: [UUID: EpisodePlaybackPosition]

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let stored = defaults.array(forKey: Self.listenedEpisodeIDsKey) as? [String] ?? []
        listenedEpisodeIDs = Set(stored.compactMap(UUID.init(uuidString:)))

        if let data = defaults.data(forKey: Self.playbackPositionsKey),
           let decoded = try? JSONDecoder().decode([String: EpisodePlaybackPosition].self, from: data) {
            playbackPositionsByEpisodeID = Dictionary(
                uniqueKeysWithValues: decoded.compactMap { key, value in
                    guard let id = UUID(uuidString: key) else { return nil }
                    return (id, value)
                }
            )
        } else {
            playbackPositionsByEpisodeID = [:]
        }
    }

    func isListened(_ episodeID: UUID) -> Bool {
        listenedEpisodeIDs.contains(episodeID)
    }

    func playbackPosition(for episodeID: UUID) -> EpisodePlaybackPosition? {
        playbackPositionsByEpisodeID[episodeID]
    }

    func resumePositionSeconds(for episodeID: UUID, durationSeconds: Double?) -> Double? {
        guard isListened(episodeID) == false else { return nil }
        guard let position = playbackPosition(for: episodeID) else { return nil }

        let duration = (durationSeconds ?? 0) > 0 ? (durationSeconds ?? 0) : position.durationSeconds
        guard duration.isFinite, duration > 0 else { return nil }
        guard position.seconds.isFinite, position.seconds > 0 else { return nil }

        let epsilon = 8.0
        guard position.seconds >= 10 else { return nil }
        guard position.seconds <= max(0, duration - epsilon) else { return nil }
        return position.seconds
    }

    func partialPlaybackFraction(episodeID: UUID, fallbackDurationSeconds: Double?) -> Double? {
        guard isListened(episodeID) == false else { return nil }
        guard let position = playbackPosition(for: episodeID) else { return nil }
        let duration = (fallbackDurationSeconds ?? 0) > 0 ? (fallbackDurationSeconds ?? 0) : position.durationSeconds
        guard duration.isFinite, duration > 0 else { return nil }
        let fraction = max(0, min(position.seconds / duration, 1))
        guard fraction > 0.02, fraction < 0.98 else { return nil }
        return fraction
    }

    func remainingSeconds(episodeID: UUID, fallbackDurationSeconds: Double?) -> Double? {
        guard isListened(episodeID) == false else { return nil }
        guard let position = playbackPosition(for: episodeID) else { return nil }
        let duration = (fallbackDurationSeconds ?? 0) > 0 ? (fallbackDurationSeconds ?? 0) : position.durationSeconds
        guard duration.isFinite, duration > 0 else { return nil }
        let remaining = max(0, duration - position.seconds)
        guard remaining.isFinite, remaining > 0 else { return nil }
        return remaining
    }

    func updatePlaybackPosition(episodeID: UUID, seconds: Double, durationSeconds: Double) {
        guard durationSeconds.isFinite, durationSeconds > 0 else { return }
        guard seconds.isFinite, seconds >= 0 else { return }

        let minSavedSeconds = 10.0
        let minRemainingSeconds = 8.0
        let clampedSeconds = max(0, min(seconds, durationSeconds))

        if clampedSeconds < minSavedSeconds {
            clearPlaybackPosition(episodeID)
            return
        }

        if durationSeconds - clampedSeconds <= minRemainingSeconds {
            markListened(episodeID)
            clearPlaybackPosition(episodeID)
            return
        }

        playbackPositionsByEpisodeID[episodeID] = EpisodePlaybackPosition(
            seconds: clampedSeconds,
            durationSeconds: durationSeconds,
            updatedAt: Date()
        )
        persistPositions()
    }

    func markListened(_ episodeID: UUID) {
        guard listenedEpisodeIDs.contains(episodeID) == false else { return }
        listenedEpisodeIDs.insert(episodeID)
        persist()
    }

    func clearListened(_ episodeID: UUID) {
        guard listenedEpisodeIDs.contains(episodeID) else { return }
        listenedEpisodeIDs.remove(episodeID)
        persist()
    }

    func clearAll() {
        listenedEpisodeIDs.removeAll()
        playbackPositionsByEpisodeID.removeAll()
        persist()
        persistPositions()
    }

    private func persist() {
        defaults.set(listenedEpisodeIDs.map(\.uuidString).sorted(), forKey: Self.listenedEpisodeIDsKey)
    }

    func clearPlaybackPosition(_ episodeID: UUID) {
        guard playbackPositionsByEpisodeID.removeValue(forKey: episodeID) != nil else { return }
        persistPositions()
    }

    private func persistPositions() {
        let keyed: [String: EpisodePlaybackPosition] = Dictionary(
            uniqueKeysWithValues: playbackPositionsByEpisodeID.map { ($0.key.uuidString, $0.value) }
        )
        if let data = try? JSONEncoder().encode(keyed) {
            defaults.set(data, forKey: Self.playbackPositionsKey)
        }
    }
}
