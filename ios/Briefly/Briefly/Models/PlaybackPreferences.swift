import Foundation
import Combine

struct PlaybackPreferences {
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

    @Published private(set) var listenedEpisodeIDs: Set<UUID>

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let stored = defaults.array(forKey: Self.listenedEpisodeIDsKey) as? [String] ?? []
        listenedEpisodeIDs = Set(stored.compactMap(UUID.init(uuidString:)))
    }

    func isListened(_ episodeID: UUID) -> Bool {
        listenedEpisodeIDs.contains(episodeID)
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
        persist()
    }

    private func persist() {
        defaults.set(listenedEpisodeIDs.map(\.uuidString).sorted(), forKey: Self.listenedEpisodeIDsKey)
    }
}
