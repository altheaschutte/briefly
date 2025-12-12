import XCTest
@testable import Briefly

final class EpisodeViewModelTests: XCTestCase {
    func testEpisodesLoadIntoSections() async {
        let episode = Episode(id: UUID(),
                              title: "Morning Briefly",
                              summary: "News you care about.",
                              audioURL: nil,
                              durationSeconds: 600,
                              publishedAt: Date(),
                              topics: [])
        let service = MockEpisodeProvider(episodes: [episode])
        let viewModel = EpisodesViewModel(episodeService: service)

        await viewModel.load()

        XCTAssertEqual(viewModel.sections.first?.episodes.first?.title, "Morning Briefly")
    }
}

struct MockEpisodeProvider: EpisodeProviding {
    let episodes: [Episode]

    func fetchLatestEpisode() async throws -> Episode? {
        episodes.first
    }

    func fetchEpisodes() async throws -> [Episode] {
        episodes
    }

    func generateEpisode() async throws -> Episode? {
        episodes.first
    }
}
