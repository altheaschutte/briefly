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

    init(episodeService: EpisodeProviding) {
        self.episodeService = episodeService
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
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let fetched = try await episodeService.fetchEpisodes()
            episodes = sortAndDeduplicate(fetched)
        } catch {
            errorMessage = error.localizedDescription
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
}
