import Foundation

struct Topic: Codable, Identifiable, Equatable, Hashable {
    var id: UUID?
    var title: String
    var description: String
    var isActive: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case description
        case isActive = "active"
    }

    static var placeholder: Topic {
        Topic(id: UUID(), title: "Local arts", description: "Upcoming exhibitions and creative events this week.", isActive: true)
    }
}
