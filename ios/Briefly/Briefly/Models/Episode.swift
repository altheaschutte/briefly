import Foundation

struct Episode: Codable, Identifiable, Equatable, Hashable {
    var id: UUID
    var title: String
    var summary: String
    var audioURL: URL?
    var durationSeconds: Double?
    var publishedAt: Date?
    var topics: [Topic]?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case summary
        case audioURL = "audio_url"
        case durationSeconds = "duration_seconds"
        case publishedAt = "published_at"
        case topics
    }

    static var placeholder: Episode {
        Episode(id: UUID(),
                title: "Morning Briefly",
                summary: "A quick roundup of the stories you care about.",
                audioURL: nil,
                durationSeconds: 600,
                publishedAt: Date(),
                topics: [Topic.placeholder])
    }
}
