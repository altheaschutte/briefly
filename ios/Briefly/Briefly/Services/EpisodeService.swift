import Foundation

protocol EpisodeProviding {
    func fetchLatestEpisode() async throws -> Episode?
    func fetchEpisodes() async throws -> [Episode]
    func generateEpisode() async throws -> Episode?
}

final class EpisodeService: EpisodeProviding {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchLatestEpisode() async throws -> Episode? {
        let endpoint = APIEndpoint(path: "/episodes",
                                   method: .get,
                                   queryItems: [URLQueryItem(name: "latest", value: "true")])
        if let single: Episode? = try? await apiClient.request(endpoint) {
            return single
        }
        let episodes: [Episode] = try await apiClient.request(endpoint)
        return episodes.first
    }

    func fetchEpisodes() async throws -> [Episode] {
        let endpoint = APIEndpoint(path: "/episodes", method: .get)
        if let direct: [Episode] = try? await apiClient.request(endpoint) {
            return direct
        }
        struct Response: Decodable { let data: [Episode] }
        let response: Response = try await apiClient.request(endpoint)
        return response.data
    }

    func generateEpisode() async throws -> Episode? {
        let endpoint = APIEndpoint(path: "/episodes/generate", method: .post)
        if let single: Episode? = try? await apiClient.request(endpoint) {
            return single
        }
        let episodes: [Episode] = try await apiClient.request(endpoint)
        return episodes.first
    }
}
