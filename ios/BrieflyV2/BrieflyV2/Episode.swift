import Foundation

struct SegmentDiveDeeperSeed: Codable, Identifiable, Hashable {
    var id: UUID
    var episodeId: UUID?
    var segmentId: UUID?
    var position: Int?
    var title: String
    var angle: String
    var focusClaims: [String]?
    var seedQueries: [String]?
    var contextBundle: JSONValue?
    var createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case episodeId = "episode_id"
        case segmentId = "segment_id"
        case position
        case title
        case angle
        case focusClaims = "focus_claims"
        case seedQueries = "seed_queries"
        case contextBundle = "context_bundle"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        if let uuid = try? container.decode(UUID.self, forKey: .id) {
            id = uuid
        } else if let idString = try? container.decode(String.self, forKey: .id),
                  let uuid = UUID(uuidString: idString) {
            id = uuid
        } else {
            id = UUID()
        }

        if let uuid = try? container.decodeIfPresent(UUID.self, forKey: .episodeId) {
            episodeId = uuid
        } else if let idString = try? container.decodeIfPresent(String.self, forKey: .episodeId) {
            episodeId = UUID(uuidString: idString)
        } else {
            episodeId = nil
        }

        if let uuid = try? container.decodeIfPresent(UUID.self, forKey: .segmentId) {
            segmentId = uuid
        } else if let idString = try? container.decodeIfPresent(String.self, forKey: .segmentId) {
            segmentId = UUID(uuidString: idString)
        } else {
            segmentId = nil
        }

        if let value = try? container.decodeIfPresent(Int.self, forKey: .position) {
            position = value
        } else if let string = try? container.decodeIfPresent(String.self, forKey: .position),
                  let parsed = Int(string) {
            position = parsed
        } else {
            position = nil
        }

        title = (try? container.decode(String.self, forKey: .title)) ?? ""
        angle = (try? container.decode(String.self, forKey: .angle)) ?? ""
        focusClaims = try? container.decodeIfPresent([String].self, forKey: .focusClaims)
        seedQueries = try? container.decodeIfPresent([String].self, forKey: .seedQueries)
        contextBundle = try? container.decodeIfPresent(JSONValue.self, forKey: .contextBundle)
        createdAt = try? container.decodeIfPresent(Date.self, forKey: .createdAt)
        updatedAt = try? container.decodeIfPresent(Date.self, forKey: .updatedAt)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(episodeId, forKey: .episodeId)
        try container.encodeIfPresent(segmentId, forKey: .segmentId)
        try container.encodeIfPresent(position, forKey: .position)
        try container.encode(title, forKey: .title)
        try container.encode(angle, forKey: .angle)
        try container.encodeIfPresent(focusClaims, forKey: .focusClaims)
        try container.encodeIfPresent(seedQueries, forKey: .seedQueries)
        try container.encodeIfPresent(contextBundle, forKey: .contextBundle)
        try container.encodeIfPresent(createdAt, forKey: .createdAt)
        try container.encodeIfPresent(updatedAt, forKey: .updatedAt)
    }
}

enum JSONValue: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let number = try? container.decode(Double.self) {
            self = .number(number)
        } else if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let array = try? container.decode([JSONValue].self) {
            self = .array(array)
        } else if let object = try? container.decode([String: JSONValue].self) {
            self = .object(object)
        } else {
            self = .null
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null:
            try container.encodeNil()
        case .bool(let bool):
            try container.encode(bool)
        case .number(let number):
            try container.encode(number)
        case .string(let string):
            try container.encode(string)
        case .array(let array):
            try container.encode(array)
        case .object(let object):
            try container.encode(object)
        }
    }
}

struct Episode: Codable, Identifiable, Hashable {
    var id: UUID
    var title: String
    var episodeNumber: Int?
    var summary: String
    var description: String?
    var audioURL: URL?
    var durationSeconds: Double?
    var targetDurationMinutes: Int?
    var createdAt: Date?
    var updatedAt: Date?
    var publishedAt: Date?
    var topics: [Topic]?
    var segments: [EpisodeSegment]?
    var sources: [EpisodeSource]?
    var status: String?
    var showNotes: String?
    var transcript: String?
    var coverImageURL: URL?
    var coverPrompt: String?
    var errorMessage: String?
    var diveDeeperSeeds: [SegmentDiveDeeperSeed]?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case episodeNumberCamel = "episodeNumber"
        case episodeNumberSnake = "episode_number"
        case summary
        case description
        case shortDescription = "short_description"
        case episodeDescription = "episode_description"
        case audioURLCamel = "audioUrl"
        case audioURLSnake = "audio_url"
        case durationSeconds = "duration_seconds"
        case targetDurationMinutes = "target_duration_minutes"
        case publishedAt = "published_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case topics
        case segments
        case sources
        case status
        case showNotesCamel = "showNotes"
        case showNotesSnake = "show_notes"
        case transcript
        case coverImageURLCamel = "coverImageUrl"
        case coverImageURLSnake = "cover_image_url"
        case coverPromptCamel = "coverPrompt"
        case coverPromptSnake = "cover_prompt"
        case errorMessageCamel = "errorMessage"
        case errorMessageSnake = "error_message"
        case diveDeeperSeedsCamel = "diveDeeperSeeds"
        case diveDeeperSeedsSnake = "dive_deeper_seeds"
    }

    init(id: UUID,
         title: String,
         episodeNumber: Int? = nil,
         summary: String,
         description: String? = nil,
         audioURL: URL? = nil,
         durationSeconds: Double? = nil,
         targetDurationMinutes: Int? = nil,
         createdAt: Date? = nil,
         updatedAt: Date? = nil,
         publishedAt: Date? = nil,
         topics: [Topic]? = nil,
         segments: [EpisodeSegment]? = nil,
         sources: [EpisodeSource]? = nil,
         status: String? = nil,
         showNotes: String? = nil,
         transcript: String? = nil,
         coverImageURL: URL? = nil,
         coverPrompt: String? = nil,
         errorMessage: String? = nil,
         diveDeeperSeeds: [SegmentDiveDeeperSeed]? = nil) {
        self.id = id
        self.title = title
        self.episodeNumber = episodeNumber
        self.summary = summary
        self.description = description
        self.audioURL = audioURL
        self.durationSeconds = durationSeconds
        self.targetDurationMinutes = targetDurationMinutes
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.publishedAt = publishedAt
        self.topics = topics
        self.segments = segments
        self.sources = sources
        self.status = status
        self.showNotes = showNotes
        self.transcript = transcript
        self.coverImageURL = coverImageURL
        self.coverPrompt = coverPrompt
        self.errorMessage = errorMessage
        self.diveDeeperSeeds = diveDeeperSeeds
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        if let uuid = try? container.decode(UUID.self, forKey: .id) {
            id = uuid
        } else if let idString = try? container.decode(String.self, forKey: .id),
                  let uuid = UUID(uuidString: idString) {
            id = uuid
        } else {
            id = UUID()
        }

        topics = try? container.decodeIfPresent([Topic].self, forKey: .topics)
        segments = try? container.decodeIfPresent([EpisodeSegment].self, forKey: .segments)
        sources = try? container.decodeIfPresent([EpisodeSource].self, forKey: .sources)
        status = try? container.decodeIfPresent(String.self, forKey: .status)
        let decodedDiveDeeperCamel = try? container.decodeIfPresent([SegmentDiveDeeperSeed].self, forKey: .diveDeeperSeedsCamel)
        let decodedDiveDeeperSnake = try? container.decodeIfPresent([SegmentDiveDeeperSeed].self, forKey: .diveDeeperSeedsSnake)
        if let snake = decodedDiveDeeperSnake, snake.isEmpty == false {
            diveDeeperSeeds = snake
        } else if let camel = decodedDiveDeeperCamel, camel.isEmpty == false {
            diveDeeperSeeds = camel
        } else {
            diveDeeperSeeds = decodedDiveDeeperSnake ?? decodedDiveDeeperCamel
        }

        if let number = (try? container.decodeIfPresent(Int.self, forKey: .episodeNumberSnake)) ??
            (try? container.decodeIfPresent(Int.self, forKey: .episodeNumberCamel)) {
            episodeNumber = number
        } else if let numberString = (try? container.decodeIfPresent(String.self, forKey: .episodeNumberSnake)) ??
                    (try? container.decodeIfPresent(String.self, forKey: .episodeNumberCamel)),
                  let parsed = Int(numberString) {
            episodeNumber = parsed
        } else {
            episodeNumber = nil
        }

        showNotes = (try? container.decodeIfPresent(String.self, forKey: .showNotesCamel)) ??
                    (try? container.decodeIfPresent(String.self, forKey: .showNotesSnake))
        transcript = try? container.decodeIfPresent(String.self, forKey: .transcript)

        let published = try? container.decodeIfPresent(Date.self, forKey: .publishedAt)
        let updated = try? container.decodeIfPresent(Date.self, forKey: .updatedAt)
        let created = try? container.decodeIfPresent(Date.self, forKey: .createdAt)
        createdAt = created
        updatedAt = updated
        publishedAt = published ?? created ?? updated

        if let audioString = (try? container.decodeIfPresent(String.self, forKey: .audioURLSnake)) ??
            (try? container.decodeIfPresent(String.self, forKey: .audioURLCamel)),
           let url = URL(string: audioString) {
            audioURL = url
        } else {
            audioURL = nil
        }

        if let coverString = (try? container.decodeIfPresent(String.self, forKey: .coverImageURLSnake)) ??
            (try? container.decodeIfPresent(String.self, forKey: .coverImageURLCamel)),
           let url = URL(string: coverString) {
            coverImageURL = url
        } else {
            coverImageURL = nil
        }

        coverPrompt = (try? container.decodeIfPresent(String.self, forKey: .coverPromptCamel)) ??
            (try? container.decodeIfPresent(String.self, forKey: .coverPromptSnake))
        errorMessage = (try? container.decodeIfPresent(String.self, forKey: .errorMessageCamel)) ??
            (try? container.decodeIfPresent(String.self, forKey: .errorMessageSnake))

        durationSeconds = try? container.decodeIfPresent(Double.self, forKey: .durationSeconds)
        if durationSeconds == nil,
           let secondsString = try? container.decodeIfPresent(String.self, forKey: .durationSeconds),
           let parsed = Double(secondsString) {
            durationSeconds = parsed
        }

        if let minutes = try? container.decodeIfPresent(Int.self, forKey: .targetDurationMinutes) {
            targetDurationMinutes = minutes
        } else if let minutesString = try? container.decodeIfPresent(String.self, forKey: .targetDurationMinutes),
                  let parsed = Int(minutesString) {
            targetDurationMinutes = parsed
        } else {
            targetDurationMinutes = nil
        }

        let decodedTitle = (try? container.decodeIfPresent(String.self, forKey: .title))?.nonEmpty
        let decodedSummary = (try? container.decodeIfPresent(String.self, forKey: .summary))?.nonEmpty
        let decodedDescription = (try? container.decodeIfPresent(String.self, forKey: .description))?.nonEmpty ??
            (try? container.decodeIfPresent(String.self, forKey: .shortDescription))?.nonEmpty ??
            (try? container.decodeIfPresent(String.self, forKey: .episodeDescription))?.nonEmpty
        let titleDate = createdAt ?? publishedAt ?? updatedAt

        title = decodedTitle ?? Episode.deriveTitle(date: titleDate, status: status)
        summary = decodedSummary ?? Episode.deriveSummary(showNotes: showNotes, transcript: transcript)
        description = decodedDescription ?? Episode.deriveDescription(from: summary)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(title, forKey: .title)
        try container.encodeIfPresent(episodeNumber, forKey: .episodeNumberSnake)
        try container.encode(summary, forKey: .summary)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(audioURL?.absoluteString, forKey: .audioURLSnake)
        try container.encodeIfPresent(durationSeconds, forKey: .durationSeconds)
        try container.encodeIfPresent(targetDurationMinutes, forKey: .targetDurationMinutes)
        try container.encodeIfPresent(createdAt, forKey: .createdAt)
        try container.encodeIfPresent(updatedAt, forKey: .updatedAt)
        try container.encodeIfPresent(publishedAt, forKey: .publishedAt)
        try container.encodeIfPresent(topics, forKey: .topics)
        try container.encodeIfPresent(segments, forKey: .segments)
        try container.encodeIfPresent(sources, forKey: .sources)
        try container.encodeIfPresent(status, forKey: .status)
        try container.encodeIfPresent(showNotes, forKey: .showNotesSnake)
        try container.encodeIfPresent(transcript, forKey: .transcript)
        try container.encodeIfPresent(coverImageURL?.absoluteString, forKey: .coverImageURLSnake)
        try container.encodeIfPresent(coverPrompt, forKey: .coverPromptSnake)
        try container.encodeIfPresent(errorMessage, forKey: .errorMessageSnake)
        try container.encodeIfPresent(diveDeeperSeeds, forKey: .diveDeeperSeedsSnake)
    }

    var subtitle: String {
        description?.nonEmpty ?? summary
    }

    var displayTitle: String {
        Episode.stripTrailingEpisodeNumber(from: title)
    }

    var displayDate: Date? {
        createdAt ?? publishedAt ?? updatedAt
    }

    var displayDateLabel: String {
        Episode.formatEpisodeDateLabel(displayDate)
    }

    var durationDisplaySeconds: Double? {
        if let seconds = durationSeconds, seconds.isFinite, seconds > 0 {
            return seconds
        }
        if let minutes = targetDurationMinutes, minutes > 0 {
            return Double(minutes * 60)
        }
        return nil
    }

    var isReady: Bool {
        if let status {
            return status.lowercased() == "ready"
        }
        return audioURL != nil
    }

    static var placeholder: Episode {
        Episode(id: UUID(),
                title: "Morning Briefly",
                summary: "A quick roundup of the stories you care about.",
                description: "A quick, personal news rundown.",
                audioURL: nil,
                durationSeconds: 600,
                targetDurationMinutes: 10,
                createdAt: Date(),
                updatedAt: Date(),
                publishedAt: Date(),
                topics: [Topic.placeholder])
    }

    static func formatEpisodeDateLabel(_ date: Date?, relativeTo now: Date = Date(), calendar: Calendar = .current) -> String {
        guard let date else { return "—" }

        if calendar.isDate(date, inSameDayAs: now) {
            return "TODAY"
        }

        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
           calendar.isDate(date, inSameDayAs: yesterday) {
            return "YESTERDAY"
        }

        let needsYear = calendar.component(.year, from: date) != calendar.component(.year, from: now)
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = needsYear ? "d MMM yyyy" : "d MMM"
        return formatter.string(from: date).uppercased()
    }
}

private extension String {
    var nonEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private extension Episode {
    static func stripTrailingEpisodeNumber(from title: String) -> String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return trimmed }

        let pattern = #"\s*\[\d+\]\s*$"#
        guard let matchRange = trimmed.range(of: pattern, options: .regularExpression) else {
            return trimmed
        }

        return String(trimmed[..<matchRange.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func deriveTitle(date: Date?, status: String?) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        let dateLabel = date.map { formatter.string(from: $0) } ?? "Recent episode"
        if let status, status.lowercased() != "ready" {
            return "Briefly (\(status.capitalized)) - \(dateLabel)"
        }
        return "Briefly - \(dateLabel)"
    }

    static func deriveSummary(showNotes: String?, transcript: String?) -> String {
        if let summary = summaryFromShowNotes(showNotes) {
            return summary
        }
        if let transcript = transcript?.nonEmpty {
            let snippet = String(transcript.prefix(180))
            return transcript.count > 180 ? "\(snippet)..." : snippet
        }
        return "Your personalized episode is queued."
    }

    static func deriveDescription(from summary: String) -> String {
        let trimmed = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else {
            return "Your personalized Briefly episode"
        }

        let firstSentence = trimmed
            .split(maxSplits: 1, omittingEmptySubsequences: true, whereSeparator: { ".!?".contains($0) })
            .first
            .map(String.init)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }

        let base = firstSentence?.isEmpty == false ? firstSentence! : trimmed
        if base.count > 120 {
            let prefix = base.prefix(117)
            return "\(prefix)..."
        }
        return base
    }

    static func summaryFromShowNotes(_ showNotes: String?) -> String? {
        guard let notes = showNotes else { return nil }
        let sanitized = notes.replacingOccurrences(of: "**", with: "")
        let paragraphs = sanitized
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let firstParagraph = paragraphs.first(where: { paragraph in
            let lowercased = paragraph.lowercased()
            return lowercased.hasPrefix("sources") == false && paragraph.hasPrefix("-") == false
        })
        return firstParagraph?.nonEmpty
    }
}
