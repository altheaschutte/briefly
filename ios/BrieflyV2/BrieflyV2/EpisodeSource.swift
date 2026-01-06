import Foundation

struct EpisodeSource: Codable, Identifiable, Hashable {
    var id: UUID
    var episodeId: UUID?
    var segmentId: UUID?
    var title: String
    var urlString: String
    var type: String?

    enum CodingKeys: String, CodingKey {
        case id
        case episodeIdCamel = "episodeId"
        case episodeIdSnake = "episode_id"
        case segmentIdCamel = "segmentId"
        case segmentIdSnake = "segment_id"
        case sourceTitleCamel = "sourceTitle"
        case sourceTitleSnake = "source_title"
        case url
        case type
    }

    init(id: UUID = UUID(),
         episodeId: UUID? = nil,
         segmentId: UUID? = nil,
         title: String,
         urlString: String,
         type: String? = nil) {
        self.id = id
        self.episodeId = episodeId
        self.segmentId = segmentId
        self.title = title
        self.urlString = urlString
        self.type = type
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

        episodeId = EpisodeSource.decodeUUID(from: container, camel: .episodeIdCamel, snake: .episodeIdSnake)
        segmentId = EpisodeSource.decodeUUID(from: container, camel: .segmentIdCamel, snake: .segmentIdSnake)

        let decodedTitle = (try? container.decodeIfPresent(String.self, forKey: .sourceTitleCamel)) ??
        (try? container.decodeIfPresent(String.self, forKey: .sourceTitleSnake)) ??
        (try? container.decodeIfPresent(String.self, forKey: .url))
        title = decodedTitle?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? ""

        urlString = (try? container.decodeIfPresent(String.self, forKey: .url))?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        type = try? container.decodeIfPresent(String.self, forKey: .type)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(episodeId, forKey: .episodeIdSnake)
        try container.encodeIfPresent(segmentId, forKey: .segmentIdSnake)
        try container.encode(title, forKey: .sourceTitleSnake)
        try container.encode(urlString, forKey: .url)
        try container.encodeIfPresent(type, forKey: .type)
    }

    var url: URL? {
        URL(string: urlString)
    }

    var displayTitle: String {
        if let sanitized = sanitizedTitle {
            return sanitized
        }
        if let host = url?.host?.replacingOccurrences(of: "www.", with: ""), host.isEmpty == false {
            return host
        }
        return sanitizedUrlString
    }

    var displayHost: String? {
        if let host = url?.host?.replacingOccurrences(of: "www.", with: ""), host.isEmpty == false {
            return host
        }
        return sanitizedHostFromUrlString
    }

    var displayPath: String? {
        if let url {
            var path = url.path
            if path == "/" { path = "" }

            if let query = url.query, query.isEmpty == false {
                path += "?\(query)"
            }

            if let fragment = url.fragment, fragment.isEmpty == false {
                path += "#\(fragment)"
            }

            if path.isEmpty == false {
                return path
            }
        }

        return fallbackPathFromSanitizedUrl
    }

    private var sanitizedTitle: String? {
        guard let nonEmpty = title.nonEmpty else { return nil }
        return nonEmpty
            .replacingOccurrences(of: #"^https?://"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"^www\."#, with: "", options: .regularExpression)
    }

    private var sanitizedUrlString: String {
        urlString
            .replacingOccurrences(of: #"^https?://"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"^www\."#, with: "", options: .regularExpression)
    }

    private var sanitizedHostFromUrlString: String? {
        let host = sanitizedUrlString
            .split(separator: "/")
            .first?
            .split(separator: "?")
            .first?
            .split(separator: "#")
            .first
        return host.map(String.init)?.nonEmpty
    }

    private var fallbackPathFromSanitizedUrl: String? {
        let sanitized = sanitizedUrlString
        guard let index = sanitized.firstIndex(where: { $0 == "/" || $0 == "?" || $0 == "#" }) else { return nil }
        let path = sanitized[index...]
        guard path.isEmpty == false, path != "/" else { return nil }
        return String(path)
    }
}

private extension EpisodeSource {
    static func decodeUUID(from container: KeyedDecodingContainer<CodingKeys>,
                           camel: CodingKeys,
                           snake: CodingKeys) -> UUID? {
        if let uuid = try? container.decodeIfPresent(UUID.self, forKey: camel) ?? container.decodeIfPresent(UUID.self, forKey: snake) {
            return uuid
        }
        if let string = try? container.decodeIfPresent(String.self, forKey: camel) ??
            container.decodeIfPresent(String.self, forKey: snake),
           let uuid = UUID(uuidString: string) {
            return uuid
        }
        return nil
    }
}

private extension String {
    var nonEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
