import Foundation

struct Topic: Codable, Identifiable, Equatable, Hashable {
    var id: UUID?
    var originalText: String
    var orderIndex: Int
    var isActive: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case originalTextCamel = "originalText"
        case originalTextSnake = "original_text"
        case titleFallback = "title"
        case descriptionFallback = "description"
        case orderIndexCamel = "orderIndex"
        case orderIndexSnake = "order_index"
        case isActiveCamel = "isActive"
        case isActiveSnake = "is_active"
        case isActiveLegacy = "active"
    }

    init(id: UUID? = nil, originalText: String, orderIndex: Int, isActive: Bool) {
        self.id = id
        self.originalText = originalText
        self.orderIndex = orderIndex
        self.isActive = isActive
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id)

        if let camel = try? container.decode(String.self, forKey: .originalTextCamel) {
            originalText = camel
        } else if let snake = try? container.decode(String.self, forKey: .originalTextSnake) {
            originalText = snake
        } else if let title = try? container.decode(String.self, forKey: .titleFallback) {
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
        try container.encode(originalText, forKey: .originalTextSnake)
        try container.encode(orderIndex, forKey: .orderIndexSnake)
        try container.encode(isActive, forKey: .isActiveSnake)
    }

    static var placeholder: Topic {
        Topic(id: UUID(), originalText: "Local arts: upcoming exhibitions and creative events this week.", orderIndex: 0, isActive: true)
    }
}
