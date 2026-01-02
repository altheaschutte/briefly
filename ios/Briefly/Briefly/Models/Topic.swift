import Foundation

struct Topic: Codable, Identifiable, Equatable, Hashable {
    var id: UUID?
    var title: String?
    var originalText: String
    var orderIndex: Int
    var isActive: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case originalTextCamel = "originalText"
        case originalTextSnake = "original_text"
        case descriptionFallback = "description"
        case orderIndexCamel = "orderIndex"
        case orderIndexSnake = "order_index"
        case isActiveCamel = "isActive"
        case isActiveSnake = "is_active"
        case isActiveLegacy = "active"
    }

    init(id: UUID? = nil, title: String? = nil, originalText: String, orderIndex: Int, isActive: Bool) {
        self.id = id
        self.title = title
        self.originalText = originalText
        self.orderIndex = orderIndex
        self.isActive = isActive
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title)

        if let camel = try? container.decode(String.self, forKey: .originalTextCamel) {
            originalText = camel
        } else if let snake = try? container.decode(String.self, forKey: .originalTextSnake) {
            originalText = snake
        } else if let title, title.isEmpty == false {
            originalText = title
        } else if let description = try? container.decode(String.self, forKey: .descriptionFallback) {
            originalText = description
        } else {
            originalText = ""
        }

        if let camel = try? container.decode(Int.self, forKey: .orderIndexCamel) {
            orderIndex = camel
        } else if let snake = try? container.decode(Int.self, forKey: .orderIndexSnake) {
            orderIndex = snake
        } else {
            orderIndex = 0
        }

        if let camel = try? container.decode(Bool.self, forKey: .isActiveCamel) {
            isActive = camel
        } else if let snake = try? container.decode(Bool.self, forKey: .isActiveSnake) {
            isActive = snake
        } else if let legacy = try? container.decode(Bool.self, forKey: .isActiveLegacy) {
            isActive = legacy
        } else {
            isActive = true
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(id, forKey: .id)
        try container.encodeIfPresent(title, forKey: .title)
        try container.encode(originalText, forKey: .originalTextSnake)
        try container.encode(orderIndex, forKey: .orderIndexSnake)
        try container.encode(isActive, forKey: .isActiveSnake)
    }

    static var placeholder: Topic {
        Topic(
            id: UUID(),
            title: "Local Arts",
            originalText: "Local arts: upcoming exhibitions and creative events this week.",
            orderIndex: 0,
            isActive: true
        )
    }
}

extension Topic {
    var displayTitle: String {
        let trimmedTitle = (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedTitle.isEmpty == false {
            return trimmedTitle
        }
        return Topic.titleFallback(from: originalText)
    }

    private static func titleFallback(from originalText: String) -> String {
        let cleaned = originalText
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"^[\"'\s]+|[\"'\s]+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"[^\p{L}\p{N}\s'’\-]+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleaned.isEmpty == false else { return "" }
        return cleaned.split(separator: " ").prefix(3).joined(separator: " ")
    }
}
