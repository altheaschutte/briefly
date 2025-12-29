import Foundation

struct EpisodeSection: Identifiable {
    let id = UUID()
    let title: String
    let episodes: [Episode]
}

@MainActor
final class EpisodesViewModel: ObservableObject {
    @Published var episodes: [Episode] = []
    @Published var errorMessage: String?
    @Published var isLoading: Bool = false

    private let episodeService: EpisodeProviding
    private let onFatalAuthError: ((String) -> Void)?
    private var hasAppliedPrefetch = false
    private var hasLoadedOnce = false

    init(
        episodeService: EpisodeProviding,
        initialEpisodes: [Episode]? = nil,
        onFatalAuthError: ((String) -> Void)? = nil
    ) {
        self.episodeService = episodeService
        self.onFatalAuthError = onFatalAuthError
        if let initialEpisodes {
            applyPrefetchedEpisodes(initialEpisodes)
        }
    }

    private var readyEpisodes: [Episode] {
        episodes.filter { $0.isReady }
    }

    var latestEpisode: Episode? {
        readyEpisodes.first
    }

    var previousEpisodes: [Episode] {
        Array(readyEpisodes.dropFirst())
    }

    var sections: [EpisodeSection] {
        let episodes = readyEpisodes
        let calendar = Calendar.current
        let now = Date()
        var today: [Episode] = []
        var thisWeek: [Episode] = []
        var older: [Episode] = []

        for episode in episodes {
            guard let date = episode.displayDate else { continue }
            if calendar.isDateInToday(date) {
                today.append(episode)
            } else if let weekAgo = calendar.date(byAdding: .day, value: -7, to: now),
                      date >= weekAgo {
                thisWeek.append(episode)
            } else {
                older.append(episode)
            }
        }

        var sections: [EpisodeSection] = []
        if today.isEmpty == false { sections.append(EpisodeSection(title: "Today", episodes: today)) }
        if thisWeek.isEmpty == false { sections.append(EpisodeSection(title: "This Week", episodes: thisWeek)) }
        if older.isEmpty == false { sections.append(EpisodeSection(title: "Earlier", episodes: older)) }
        return sections
    }

    func load() async {
        let shouldShowLoading = episodes.isEmpty && hasLoadedOnce == false
        isLoading = shouldShowLoading
        errorMessage = nil
        var lastError: String?
        defer {
            isLoading = false
            hasLoadedOnce = true
        }
        for attempt in 1...3 {
            do {
                let fetched = try await episodeService.fetchEpisodes()
                episodes = sortAndDeduplicate(fetched)
                hasAppliedPrefetch = true
                errorMessage = nil
                return
            } catch is CancellationError {
                return
            } catch let urlError as URLError where urlError.code == .cancelled {
                return
            } catch let apiError as APIError {
                if case .unauthorized = apiError {
                    // AppViewModel handles logout/navigation on 401s; skip showing an overlay here.
                    return
                }
                lastError = apiError.localizedDescription
            } catch {
                lastError = error.localizedDescription
            }

            if attempt >= 3 {
                let message = lastError ?? "Unable to reach our authentication service. Please retry or sign in again."
                errorMessage = message
                onFatalAuthError?(message)
            }
        }
    }

    func deleteEpisode(_ episode: Episode) async {
        do {
            try await episodeService.deleteEpisode(id: episode.id)
            episodes.removeAll { $0.id == episode.id }
        } catch {
            errorMessage = "Couldn't delete episode: \(error.localizedDescription)"
        }
    }

    private func sortAndDeduplicate(_ episodes: [Episode]) -> [Episode] {
        let sorted = episodes.sorted { lhs, rhs in
            let lhsDate = lhs.displayDate ?? .distantPast
            let rhsDate = rhs.displayDate ?? .distantPast
            return lhsDate > rhsDate
        }

        var seen = Set<UUID>()
        var unique: [Episode] = []
        for episode in sorted where seen.insert(episode.id).inserted {
            unique.append(episode)
        }
        return unique
    }

    func applyPrefetchedEpisodes(_ prefetched: [Episode]) {
        guard hasAppliedPrefetch == false else { return }
        guard episodes.isEmpty else { return }
        episodes = sortAndDeduplicate(prefetched)
        hasAppliedPrefetch = true
    }
}
