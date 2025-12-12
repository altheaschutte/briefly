import Foundation

protocol EpisodeProviding {
    func fetchLatestEpisode() async throws -> Episode?
    func fetchEpisodes() async throws -> [Episode]
    func generateEpisode() async throws -> Episode?
    func requestEpisodeGeneration() async throws -> EpisodeCreation
    func fetchEpisode(id: UUID) async throws -> Episode
    func deleteEpisode(id: UUID) async throws
}

final class EpisodeService: EpisodeProviding {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchLatestEpisode() async throws -> Episode? {
        let episodes = try await fetchEpisodes()
        return episodes.sorted { lhs, rhs in
            let lhsDate = lhs.displayDate ?? .distantPast
            let rhsDate = rhs.displayDate ?? .distantPast
            return lhsDate > rhsDate
        }.first
    }

    func fetchEpisodes() async throws -> [Episode] {
        let endpoint = APIEndpoint(path: "/episodes", method: .get)
        let episodes: [Episode]
        if let direct: [Episode] = try? await apiClient.request(endpoint) {
            episodes = direct
        } else {
            struct Response: Decodable { let data: [Episode] }
            let response: Response = try await apiClient.request(endpoint)
            episodes = response.data
        }
        return episodes.sorted { lhs, rhs in
            let lhsDate = lhs.displayDate ?? .distantPast
            let rhsDate = rhs.displayDate ?? .distantPast
            return lhsDate > rhsDate
        }
    }

    func generateEpisode() async throws -> Episode? {
        let creation = try await requestEpisodeGeneration()

        if let created: Episode? = try? await fetchEpisode(id: creation.episodeId) {
            return created
        }

        let episodes = try await fetchEpisodes()
        return episodes.first(where: { $0.id == creation.episodeId }) ?? episodes.first
    }

    func requestEpisodeGeneration() async throws -> EpisodeCreation {
        let endpoint = APIEndpoint(path: "/episodes", method: .post)
        let creation: EpisodeCreationResponse = try await apiClient.request(endpoint)
        guard let episodeId = creation.episodeId else {
            throw APIError.invalidResponse
        }
        return EpisodeCreation(episodeId: episodeId, status: creation.status)
    }

    func fetchEpisode(id: UUID) async throws -> Episode {
        let detail = APIEndpoint(path: "/episodes/\(id.uuidString)", method: .get)
        return try await apiClient.request(detail)
    }

    func deleteEpisode(id: UUID) async throws {
        let endpoint = APIEndpoint(path: "/episodes/\(id.uuidString)", method: .delete)
        try await apiClient.requestVoid(endpoint)
    }
}

struct EpisodeCreation {
    let episodeId: UUID
    let status: String?
}

private struct EpisodeCreationResponse: Decodable {
    let episodeId: UUID?
    let status: String?

    enum CodingKeys: String, CodingKey {
        case episodeId
        case id
        case status
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let uuid = try? container.decode(UUID.self, forKey: .episodeId) {
            episodeId = uuid
        } else if let uuid = try? container.decode(UUID.self, forKey: .id) {
            episodeId = uuid
        } else if let idString = try? container.decode(String.self, forKey: .episodeId),
                  let uuid = UUID(uuidString: idString) {
            episodeId = uuid
        } else if let idString = try? container.decode(String.self, forKey: .id),
                  let uuid = UUID(uuidString: idString) {
            episodeId = uuid
        } else {
            episodeId = nil
        }
        status = try? container.decodeIfPresent(String.self, forKey: .status)
    }
}
