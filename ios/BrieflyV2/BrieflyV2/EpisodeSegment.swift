import Foundation

struct EpisodeSegment: Codable, Identifiable, Hashable {
    var id: UUID
    var episodeId: UUID?
    var orderIndex: Int
    var title: String?
    var intent: String?
    var rawContent: String?
    var script: String?
    var audioURL: URL?
    var startTimeSeconds: Double?
    var durationSeconds: Double?
    var sources: [EpisodeSource]

    enum CodingKeys: String, CodingKey {
        case id
        case episodeIdCamel = "episodeId"
        case episodeIdSnake = "episode_id"
        case orderIndexCamel = "orderIndex"
        case orderIndexSnake = "order_index"
        case title
        case intent
        case rawContentCamel = "rawContent"
        case rawContentSnake = "raw_content"
        case rawSourcesCamel = "rawSources"
        case rawSourcesSnake = "raw_sources"
        case sources
        case script
        case audioURLCamel = "audioUrl"
        case audioURLSnake = "audio_url"
        case startTimeSecondsCamel = "startTimeSeconds"
        case startTimeSecondsSnake = "start_time_seconds"
        case durationSecondsCamel = "durationSeconds"
        case durationSecondsSnake = "duration_seconds"
    }

    init(id: UUID,
         episodeId: UUID? = nil,
         orderIndex: Int,
         title: String? = nil,
         intent: String? = nil,
         rawContent: String? = nil,
         script: String? = nil,
         audioURL: URL? = nil,
         startTimeSeconds: Double? = nil,
         durationSeconds: Double? = nil,
         sources: [EpisodeSource] = []) {
        self.id = id
        self.episodeId = episodeId
        self.orderIndex = orderIndex
        self.title = title
        self.intent = intent
        self.rawContent = rawContent
        self.script = script
        self.audioURL = audioURL
        self.startTimeSeconds = startTimeSeconds
        self.durationSeconds = durationSeconds
        self.sources = sources
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

        episodeId = EpisodeSegment.decodeUUID(from: container, camel: .episodeIdCamel, snake: .episodeIdSnake)
        orderIndex = EpisodeSegment.decodeInt(from: container, camel: .orderIndexCamel, snake: .orderIndexSnake) ?? 0
        title = try? container.decodeIfPresent(String.self, forKey: .title)
        intent = try? container.decodeIfPresent(String.self, forKey: .intent)
        rawContent = (try? container.decodeIfPresent(String.self, forKey: .rawContentCamel)) ??
        (try? container.decodeIfPresent(String.self, forKey: .rawContentSnake))
        script = try? container.decodeIfPresent(String.self, forKey: .script)

        if let audioString = (try? container.decodeIfPresent(String.self, forKey: .audioURLSnake)) ??
            (try? container.decodeIfPresent(String.self, forKey: .audioURLCamel)),
           let url = URL(string: audioString) {
            audioURL = url
        } else {
            audioURL = nil
        }

        startTimeSeconds = EpisodeSegment.decodeDouble(from: container,
                                                       camel: .startTimeSecondsCamel,
                                                       snake: .startTimeSecondsSnake)
        durationSeconds = EpisodeSegment.decodeDouble(from: container,
                                                      camel: .durationSecondsCamel,
                                                      snake: .durationSecondsSnake)

        let decodedSources = (try? container.decodeIfPresent([EpisodeSource].self, forKey: .sources)) ??
        (try? container.decodeIfPresent([EpisodeSource].self, forKey: .rawSourcesCamel)) ??
        (try? container.decodeIfPresent([EpisodeSource].self, forKey: .rawSourcesSnake))
        sources = decodedSources ?? []
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(episodeId, forKey: .episodeIdSnake)
        try container.encode(orderIndex, forKey: .orderIndexSnake)
        try container.encodeIfPresent(title, forKey: .title)
        try container.encodeIfPresent(intent, forKey: .intent)
        try container.encodeIfPresent(rawContent, forKey: .rawContentSnake)
        try container.encodeIfPresent(script, forKey: .script)
        try container.encodeIfPresent(audioURL?.absoluteString, forKey: .audioURLSnake)
        try container.encodeIfPresent(startTimeSeconds, forKey: .startTimeSecondsSnake)
        try container.encodeIfPresent(durationSeconds, forKey: .durationSecondsSnake)
        try container.encode(sources, forKey: .sources)
    }
}

private extension EpisodeSegment {
    static func decodeUUID(from container: KeyedDecodingContainer<CodingKeys>,
                           camel: CodingKeys,
                           snake: CodingKeys) -> UUID? {
        if let uuid = try? container.decodeIfPresent(UUID.self, forKey: camel) ??
            container.decodeIfPresent(UUID.self, forKey: snake) {
            return uuid
        }
        if let string = try? container.decodeIfPresent(String.self, forKey: camel) ??
            container.decodeIfPresent(String.self, forKey: snake),
           let uuid = UUID(uuidString: string) {
            return uuid
        }
        return nil
    }

    static func decodeInt(from container: KeyedDecodingContainer<CodingKeys>,
                          camel: CodingKeys,
                          snake: CodingKeys) -> Int? {
        if let intValue = try? container.decodeIfPresent(Int.self, forKey: camel) ??
            container.decodeIfPresent(Int.self, forKey: snake) {
            return intValue
        }
        if let string = try? container.decodeIfPresent(String.self, forKey: camel) ??
            container.decodeIfPresent(String.self, forKey: snake),
           let value = Int(string) {
            return value
        }
        return nil
    }

    static func decodeDouble(from container: KeyedDecodingContainer<CodingKeys>,
                             camel: CodingKeys,
                             snake: CodingKeys) -> Double? {
        if let doubleValue = try? container.decodeIfPresent(Double.self, forKey: camel) ??
            container.decodeIfPresent(Double.self, forKey: snake) {
            return doubleValue
        }
        if let string = try? container.decodeIfPresent(String.self, forKey: camel) ??
            container.decodeIfPresent(String.self, forKey: snake),
           let value = Double(string) {
            return value
        }
        return nil
    }
}
