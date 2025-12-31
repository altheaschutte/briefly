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

    func testLatestEpisodeSkipsNonReadyEpisodes() async {
        let now = Date()
        let pending = Episode(id: UUID(),
                              title: "Pending Briefly",
                              summary: "Still generating.",
                              audioURL: nil,
                              createdAt: now,
                              topics: [],
                              status: "queued")
        let ready = Episode(id: UUID(),
                            title: "Ready Briefly",
                            summary: "Finished episode.",
                            audioURL: URL(string: "https://example.com/audio.mp3"),
                            createdAt: now.addingTimeInterval(-3600),
                            topics: [],
                            status: "ready")
        let service = MockEpisodeProvider(episodes: [pending, ready])
        let viewModel = EpisodesViewModel(episodeService: service)

        await viewModel.load()

        XCTAssertEqual(viewModel.latestEpisode?.id, ready.id)
        XCTAssertFalse(viewModel.previousEpisodes.contains(where: { $0.id == pending.id }))
        XCTAssertEqual(viewModel.sections.flatMap(\.episodes).count, 1)
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

    func requestEpisodeGeneration(targetDurationMinutes: Int?) async throws -> EpisodeCreation {
        EpisodeCreation(episodeId: episodes.first?.id ?? UUID(), status: "ready")
    }

    func requestDiveDeeperEpisode(parentEpisodeID: UUID, seedID: UUID, targetDurationMinutes: Int?) async throws -> EpisodeCreation {
        EpisodeCreation(episodeId: episodes.first?.id ?? UUID(), status: "queued")
    }

    func fetchEpisode(id: UUID) async throws -> Episode {
        episodes.first { $0.id == id } ?? episodes.first!
    }

    func deleteEpisode(id: UUID) async throws {
        // No-op for tests
    }
}
