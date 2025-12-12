import Foundation

protocol TopicProviding {
    func fetchTopics() async throws -> [Topic]
    func createTopic(originalText: String) async throws -> Topic
    func updateTopic(_ topic: Topic) async throws -> Topic
    func deleteTopic(id: UUID) async throws
}

final class TopicService: TopicProviding {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchTopics() async throws -> [Topic] {
        let endpoint = APIEndpoint(path: "/topics", method: .get)
        let backendTopics: [BackendTopic] = try await apiClient.request(endpoint)
        return backendTopics.map { $0.toTopic() }
    }

    func createTopic(originalText: String) async throws -> Topic {
        let body = ["original_text": originalText]
        let endpoint = APIEndpoint(path: "/topics",
                                   method: .post,
                                   body: AnyEncodable(body))
        let backendTopic: BackendTopic = try await apiClient.request(endpoint)
        return backendTopic.toTopic()
    }

    func updateTopic(_ topic: Topic) async throws -> Topic {
        guard let id = topic.id else { throw APIError.invalidURL }
        struct Payload: Encodable {
            let original_text: String
            let is_active: Bool
        }
        let body = Payload(original_text: topic.originalText, is_active: topic.isActive)
        let endpoint = APIEndpoint(path: "/topics/\(id.uuidString)",
                                   method: .patch,
                                   body: AnyEncodable(body))
        let backendTopic: BackendTopic = try await apiClient.request(endpoint)
        return backendTopic.toTopic()
    }

    func deleteTopic(id: UUID) async throws {
        let endpoint = APIEndpoint(path: "/topics/\(id.uuidString)", method: .delete)
        try await apiClient.requestVoid(endpoint)
    }
}

// MARK: - DTO

private struct BackendTopic: Decodable {
    let id: String
    let originalText: String
    let rewrittenQuery: String?
    let isActive: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case originalTextCamel = "originalText"
        case originalTextSnake = "original_text"
        case rewrittenQuery
        case rewrittenQuerySnake = "rewritten_query"
        case isActive
        case isActiveSnake = "is_active"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        if let camel = try? container.decode(String.self, forKey: .originalTextCamel) {
            originalText = camel
        } else {
            originalText = try container.decode(String.self, forKey: .originalTextSnake)
        }
        if let camel = try? container.decode(String.self, forKey: .rewrittenQuery) {
            rewrittenQuery = camel
        } else {
            rewrittenQuery = try container.decodeIfPresent(String.self, forKey: .rewrittenQuerySnake)
        }
        if let camel = try? container.decode(Bool.self, forKey: .isActive) {
            isActive = camel
        } else {
            isActive = try container.decode(Bool.self, forKey: .isActiveSnake)
        }
    }

    func toTopic() -> Topic {
        Topic(
            id: UUID(uuidString: id) ?? UUID(),
            originalText: originalText,
            isActive: isActive
        )
    }
}
