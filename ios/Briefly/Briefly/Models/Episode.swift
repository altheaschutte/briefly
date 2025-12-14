import Foundation

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
    var status: String?
    var showNotes: String?
    var transcript: String?
    var coverImageURL: URL?
    var coverPrompt: String?
    var errorMessage: String?

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
         status: String? = nil,
         showNotes: String? = nil,
         transcript: String? = nil,
         coverImageURL: URL? = nil,
         coverPrompt: String? = nil,
         errorMessage: String? = nil) {
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
        self.status = status
        self.showNotes = showNotes
        self.transcript = transcript
        self.coverImageURL = coverImageURL
        self.coverPrompt = coverPrompt
        self.errorMessage = errorMessage
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
        status = try? container.decodeIfPresent(String.self, forKey: .status)

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
        try container.encodeIfPresent(status, forKey: .status)
        try container.encodeIfPresent(showNotes, forKey: .showNotesSnake)
        try container.encodeIfPresent(transcript, forKey: .transcript)
        try container.encodeIfPresent(coverImageURL?.absoluteString, forKey: .coverImageURLSnake)
        try container.encodeIfPresent(coverPrompt, forKey: .coverPromptSnake)
        try container.encodeIfPresent(errorMessage, forKey: .errorMessageSnake)
    }

    var subtitle: String {
        description?.nonEmpty ?? summary
    }

    var displayTitle: String {
        guard let number = episodeNumber, number > 0 else { return title }
        return "\(title) [\(number)]"
    }

    var displayDate: Date? {
        createdAt ?? publishedAt ?? updatedAt
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

    static func == (lhs: Episode, rhs: Episode) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

private extension String {
    var nonEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private extension Episode {
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
