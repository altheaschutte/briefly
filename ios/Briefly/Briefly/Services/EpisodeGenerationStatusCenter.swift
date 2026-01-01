import Foundation

@MainActor
final class EpisodeGenerationStatusCenter: ObservableObject {
    @Published private(set) var isVisible: Bool
    @Published private(set) var text: String
    @Published private(set) var episodeId: UUID?

    private let episodeService: EpisodeProviding
    private let storage: UserDefaults
    private var pollTask: Task<Void, Never>?

    private let pollIntervalNanoseconds: UInt64 = 4_000_000_000

    private enum Keys {
        static let episodeId = "briefly.generationToast.episodeId"
        static let status = "briefly.generationToast.status"
    }

    init(episodeService: EpisodeProviding, storage: UserDefaults = .standard) {
        self.episodeService = episodeService
        self.storage = storage

        if let storedIdString = storage.string(forKey: Keys.episodeId),
           let storedId = UUID(uuidString: storedIdString) {
            let storedStatus = storage.string(forKey: Keys.status)
            if Self.isTerminal(storedStatus) {
                self.isVisible = false
                self.text = ""
                self.episodeId = nil
                storage.removeObject(forKey: Keys.episodeId)
                storage.removeObject(forKey: Keys.status)
            } else {
                self.isVisible = true
                self.text = Self.toastText(for: storedStatus)
                self.episodeId = storedId
            }
        } else {
            self.isVisible = false
            self.text = ""
            self.episodeId = nil
        }
    }

    func refreshFromServer() async {
        do {
            let episodes = try await episodeService.fetchEpisodes()
            if let active = episodes.first(where: { Self.isTerminal($0.status) == false }) {
                trackEpisode(id: active.id, status: active.status)
            } else {
                clear()
            }
        } catch {
            // Keep the last known state if we can't refresh (offline, expired session, etc.).
        }
    }

    func resumePollingIfNeeded() {
        guard pollTask == nil, isVisible, let episodeId else { return }
        startPolling(episodeId: episodeId)
    }

    func trackEpisode(id: UUID, status: String? = nil) {
        if episodeId == id, isVisible {
            updateStatus(status)
            return
        }

        episodeId = id
        isVisible = true
        updateStatus(status)
        startPolling(episodeId: id)
    }

    func clear() {
        pollTask?.cancel()
        pollTask = nil
        isVisible = false
        text = ""
        episodeId = nil
        storage.removeObject(forKey: Keys.episodeId)
        storage.removeObject(forKey: Keys.status)
    }

    private func updateStatus(_ status: String?) {
        text = Self.toastText(for: status)
        if let episodeId {
            storage.set(episodeId.uuidString, forKey: Keys.episodeId)
            storage.set(status, forKey: Keys.status)
        }
    }

    private func startPolling(episodeId: UUID) {
        pollTask?.cancel()
        let service = episodeService
        let interval = pollIntervalNanoseconds

        pollTask = Task.detached(priority: .background) { [weak self, service, interval] in
            while !Task.isCancelled {
                do {
                    let episode = try await service.fetchEpisode(id: episodeId)
                    let status = episode.status
                    let isDone = Self.isTerminal(status)

                    await MainActor.run {
                        guard let self, self.episodeId == episodeId else { return }
                        self.updateStatus(status)
                        if isDone {
                            self.clear()
                        }
                    }

                    if isDone { break }
                    try await Task.sleep(nanoseconds: interval)
                } catch {
                    try? await Task.sleep(nanoseconds: interval)
                }
            }
        }
    }

    nonisolated private static func isTerminal(_ status: String?) -> Bool {
        switch status?.lowercased() {
        case "ready", "failed":
            return true
        default:
            return false
        }
    }

    nonisolated private static func toastText(for status: String?) -> String {
        switch status?.lowercased() {
        case "queued":
            return "Queued…"
        case "rewriting_queries":
            return "Polishing topics…"
        case "retrieving_content":
            return "Retrieving content…"
        case "generating_script":
            return "Writing script…"
        case "generating_audio":
            return "Generating audio…"
        default:
            return "Creating episode…"
        }
    }
}
