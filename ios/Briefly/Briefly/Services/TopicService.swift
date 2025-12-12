import Foundation

protocol TopicProviding {
    func submitTranscript(_ text: String) async throws
    func fetchSuggestedTopics() async throws -> [Topic]
    func fetchTopics() async throws -> [Topic]
    func createTopic(title: String, description: String) async throws -> Topic
    func updateTopic(_ topic: Topic) async throws -> Topic
    func deleteTopic(id: UUID) async throws
}

final class TopicService: TopicProviding {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func submitTranscript(_ text: String) async throws {
        let body = ["transcriptText": text]
        let endpoint = APIEndpoint(path: "/onboarding/transcripts",
                                   method: .post,
                                   body: AnyEncodable(body))
        try await apiClient.requestVoid(endpoint)
    }

    func fetchSuggestedTopics() async throws -> [Topic] {
        let endpoint = APIEndpoint(path: "/onboarding/topics",
                                   method: .get)
        if let direct: [Topic] = try? await apiClient.request(endpoint) {
            return direct
        }
        struct Response: Decodable { let data: [Topic] }
        let response: Response = try await apiClient.request(endpoint)
        return response.data
    }

    func fetchTopics() async throws -> [Topic] {
        let endpoint = APIEndpoint(path: "/topics", method: .get)
        if let direct: [Topic] = try? await apiClient.request(endpoint) {
            return direct
        }
        struct Response: Decodable { let data: [Topic] }
        let response: Response = try await apiClient.request(endpoint)
        return response.data
    }

    func createTopic(title: String, description: String) async throws -> Topic {
        let body = ["title": title, "description": description]
        let endpoint = APIEndpoint(path: "/topics",
                                   method: .post,
                                   body: AnyEncodable(body))
        return try await apiClient.request(endpoint)
    }

    func updateTopic(_ topic: Topic) async throws -> Topic {
        guard let id = topic.id else { throw APIError.invalidURL }
        struct Payload: Encodable {
            let title: String
            let description: String
            let active: Bool
        }
        let body = Payload(title: topic.title, description: topic.description, active: topic.isActive)
        let endpoint = APIEndpoint(path: "/topics/\(id.uuidString)",
                                   method: .put,
                                   body: AnyEncodable(body))
        return try await apiClient.request(endpoint)
    }

    func deleteTopic(id: UUID) async throws {
        let endpoint = APIEndpoint(path: "/topics/\(id.uuidString)", method: .delete)
        try await apiClient.requestVoid(endpoint)
    }
}
