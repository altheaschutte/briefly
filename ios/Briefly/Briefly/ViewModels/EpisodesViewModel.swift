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

    var sections: [EpisodeSection] {
        let calendar = Calendar.current
        let now = Date()
        var today: [Episode] = []
        var thisWeek: [Episode] = []
        var older: [Episode] = []

        for episode in episodes {
            guard let date = episode.publishedAt else { continue }
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
        defer { isLoading = false }
        do {
            episodes = try await episodeService.fetchEpisodes()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
