import Foundation

protocol TopicProviding {
    func fetchTopics() async throws -> [Topic]
    func createTopic(originalText: String) async throws -> Topic
    func updateTopic(_ topic: Topic) async throws -> Topic
    func deleteTopic(id: UUID) async throws
    func seedTopics(userAboutContext: String) async throws -> [Topic]
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
            let order_index: Int
        }
        let body = Payload(original_text: topic.originalText, is_active: topic.isActive, order_index: topic.orderIndex)
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

    func seedTopics(userAboutContext: String) async throws -> [Topic] {
        struct Payload: Encodable {
            let user_about_context: String
        }
        let trimmed = userAboutContext.trimmingCharacters(in: .whitespacesAndNewlines)
        let endpoint = APIEndpoint(path: "/topics/seed",
                                   method: .post,
                                   body: AnyEncodable(Payload(user_about_context: trimmed)))
        let backendTopics: [BackendTopic] = try await apiClient.request(endpoint)
        return backendTopics.map { $0.toTopic() }
    }
}

// MARK: - DTO

private struct BackendTopic: Decodable {
    let id: String
    let originalText: String
    let rewrittenQuery: String?
    let isActive: Bool
    let orderIndex: Int

    enum CodingKeys: String, CodingKey {
        case id
        case originalTextCamel = "originalText"
        case originalTextSnake = "original_text"
        case rewrittenQuery
        case rewrittenQuerySnake = "rewritten_query"
        case isActive
        case isActiveSnake = "is_active"
        case orderIndexCamel = "orderIndex"
        case orderIndexSnake = "order_index"
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
        if let camel = try? container.decode(Int.self, forKey: .orderIndexCamel) {
            orderIndex = camel
        } else if let snake = try? container.decode(Int.self, forKey: .orderIndexSnake) {
            orderIndex = snake
        } else {
            orderIndex = 0
        }
    }

    func toTopic() -> Topic {
        Topic(
            id: UUID(uuidString: id) ?? UUID(),
            originalText: originalText,
            orderIndex: orderIndex,
            isActive: isActive
        )
    }
}
