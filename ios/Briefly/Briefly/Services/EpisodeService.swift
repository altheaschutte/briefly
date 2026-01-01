import Foundation
import os.log

protocol EpisodeProviding {
    func fetchLatestEpisode() async throws -> Episode?
    func fetchEpisodes() async throws -> [Episode]
    func generateEpisode() async throws -> Episode?
    func requestEpisodeGeneration(targetDurationMinutes: Int?) async throws -> EpisodeCreation
    func requestDiveDeeperEpisode(parentEpisodeID: UUID, seedID: UUID, targetDurationMinutes: Int?) async throws -> EpisodeCreation
    func fetchEpisode(id: UUID) async throws -> Episode
    func deleteEpisode(id: UUID) async throws
}

final class EpisodeService: EpisodeProviding {
    private let apiClient: APIClient
    private let log = OSLog(subsystem: "com.briefly.app", category: "EpisodeService")
    private let detailsCache = EpisodeDetailsCache()
    private static let iso8601Basic: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
    private static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func cachedEpisode(id: UUID, maxAge: TimeInterval = 3600) async -> Episode? {
        await detailsCache.episodeIfFresh(for: id, maxAge: maxAge)
    }

    func fetchEpisodeCached(id: UUID, maxAge: TimeInterval = 3600, forceRefresh: Bool = false) async throws -> Episode {
        if forceRefresh == false, let cached = await cachedEpisode(id: id, maxAge: maxAge) {
            return cached
        }
        return try await fetchEpisode(id: id)
    }

    func fetchLatestEpisode() async throws -> Episode? {
        let episodes = try await fetchEpisodes()
        return episodes.sorted { lhs, rhs in
            let lhsDate = lhs.displayDate ?? .distantPast
            let rhsDate = rhs.displayDate ?? .distantPast
            return lhsDate > rhsDate
        }.first
    }

    func fetchEpisodes() async throws -> [Episode] {
        let endpoint = APIEndpoint(path: "/episodes", method: .get)
        let episodes: [Episode]
        if let direct: [Episode] = try? await apiClient.request(endpoint) {
            episodes = direct
        } else {
            struct Response: Decodable { let data: [Episode] }
            let response: Response = try await apiClient.request(endpoint)
            episodes = response.data
        }
        let merged = await detailsCache.mergeSummaries(episodes)
        return merged.sorted { lhs, rhs in
            let lhsDate = lhs.displayDate ?? .distantPast
            let rhsDate = rhs.displayDate ?? .distantPast
            return lhsDate > rhsDate
        }
    }

    func generateEpisode() async throws -> Episode? {
        let creation = try await requestEpisodeGeneration(targetDurationMinutes: nil)

        if let created: Episode? = try? await fetchEpisode(id: creation.episodeId) {
            return created
        }

        let episodes = try await fetchEpisodes()
        return episodes.first(where: { $0.id == creation.episodeId }) ?? episodes.first
    }

    func requestEpisodeGeneration(targetDurationMinutes: Int? = nil) async throws -> EpisodeCreation {
        var endpoint = APIEndpoint(path: "/episodes", method: .post)
        if let targetDurationMinutes {
            struct Body: Encodable { let duration: Int }
            endpoint.body = AnyEncodable(Body(duration: targetDurationMinutes))
        }
        let creation: EpisodeCreationResponse = try await apiClient.request(endpoint)
        guard let episodeId = creation.episodeId else {
            throw APIError.invalidResponse
        }
        return EpisodeCreation(episodeId: episodeId, status: creation.status)
    }

    func requestDiveDeeperEpisode(
        parentEpisodeID: UUID,
        seedID: UUID,
        targetDurationMinutes: Int? = nil
    ) async throws -> EpisodeCreation {
        let parentId = parentEpisodeID.uuidString.lowercased()
        let seedId = seedID.uuidString.lowercased()
        var endpoint = APIEndpoint(path: "/episodes/\(parentId)/dive-deeper/\(seedId)", method: .post)
        if let targetDurationMinutes {
            struct Body: Encodable { let duration: Int }
            endpoint.body = AnyEncodable(Body(duration: targetDurationMinutes))
        }
        let creation: EpisodeCreationResponse = try await apiClient.request(endpoint)
        guard let episodeId = creation.episodeId else {
            throw APIError.invalidResponse
        }
        return EpisodeCreation(episodeId: episodeId, status: creation.status)
    }

    func fetchEpisode(id: UUID) async throws -> Episode {
        let detail = APIEndpoint(path: "/episodes/\(id.uuidString)", method: .get)
        let data = try await apiClient.requestData(detail)

#if DEBUG
        if let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
            let seedsValue = (json["dive_deeper_seeds"] as? [Any]) ?? (json["diveDeeperSeeds"] as? [Any])
            let seedsCount = seedsValue?.count ?? -1
            os_log(
                "raw episode json id=%{public}@ keys=%{public}@ dive_deeper_seeds=%{public}d",
                log: log,
                type: .info,
                id.uuidString,
                json.keys.sorted().joined(separator: ","),
                seedsCount,
            )
        }
#endif

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)

            if let date = EpisodeService.iso8601WithFractionalSeconds.date(from: string) {
                return date
            }
            if let date = EpisodeService.iso8601Basic.date(from: string) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid date format: \(string)",
            )
        }
        var episode = try decoder.decode(Episode.self, from: data)
        if episode.audioURL == nil {
            episode.audioURL = await fetchSignedAudioURL(for: id)
        }
        if let cached = await detailsCache.episode(for: id) {
            episode = EpisodeDetailsCache.mergePreferNew(episode, keepingMissingFrom: cached)
        }
        await detailsCache.store(episode)
#if DEBUG
        os_log(
            "fetchEpisode id=%{public}@ status=%{public}@ diveDeeperSeeds=%{public}d baseURL=%{public}@",
            log: log,
            type: .info,
            id.uuidString,
            episode.status ?? "nil",
            episode.diveDeeperSeeds?.count ?? -1,
            apiClient.baseURL.absoluteString,
        )
#endif
        return episode
    }

    func deleteEpisode(id: UUID) async throws {
        let endpoint = APIEndpoint(path: "/episodes/\(id.uuidString)", method: .delete)
        try await apiClient.requestVoid(endpoint)
        await detailsCache.remove(id)
    }

    func fetchSignedAudioURL(for id: UUID) async -> URL? {
        let endpoint = APIEndpoint(path: "/episodes/\(id.uuidString)/audio", method: .get)
        struct Response: Decodable {
            let audioUrl: String?
            let audio_url: String?
        }
        guard let response: Response = try? await apiClient.request(endpoint) else {
            return nil
        }
        let value = response.audioUrl ?? response.audio_url
        guard let urlString = value, let url = URL(string: urlString) else {
            return nil
        }
        return url
    }
}

struct EpisodeCreation {
    let episodeId: UUID
    let status: String?
}

private struct EpisodeCreationResponse: Decodable {
    let episodeId: UUID?
    let status: String?

    enum CodingKeys: String, CodingKey {
        case episodeId
        case id
        case status
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let uuid = try? container.decode(UUID.self, forKey: .episodeId) {
            episodeId = uuid
        } else if let uuid = try? container.decode(UUID.self, forKey: .id) {
            episodeId = uuid
        } else if let idString = try? container.decode(String.self, forKey: .episodeId),
                  let uuid = UUID(uuidString: idString) {
            episodeId = uuid
        } else if let idString = try? container.decode(String.self, forKey: .id),
                  let uuid = UUID(uuidString: idString) {
            episodeId = uuid
        } else {
            episodeId = nil
        }
        status = try? container.decodeIfPresent(String.self, forKey: .status)
    }
}

private actor EpisodeDetailsCache {
    private struct Entry {
        var episode: Episode
        var storedAt: Date
    }

    private var episodesById: [UUID: Entry] = [:]

    func episode(for id: UUID) -> Episode? {
        episodesById[id]?.episode
    }

    func episodeIfFresh(for id: UUID, maxAge: TimeInterval) -> Episode? {
        guard let entry = episodesById[id] else { return nil }
        guard Date().timeIntervalSince(entry.storedAt) <= maxAge else { return nil }
        return entry.episode
    }

    func store(_ episode: Episode) {
        episodesById[episode.id] = Entry(episode: episode, storedAt: Date())
    }

    func remove(_ id: UUID) {
        episodesById.removeValue(forKey: id)
    }

    func mergeSummaries(_ summaries: [Episode]) -> [Episode] {
        summaries.map { summary in
            guard let cached = episodesById[summary.id]?.episode else { return summary }
            return Self.mergePreferNew(summary, keepingMissingFrom: cached)
        }
    }

    static func mergePreferNew(_ new: Episode, keepingMissingFrom old: Episode) -> Episode {
        var merged = new
        if merged.audioURL == nil { merged.audioURL = old.audioURL }
        if merged.durationSeconds == nil { merged.durationSeconds = old.durationSeconds }
        if merged.targetDurationMinutes == nil { merged.targetDurationMinutes = old.targetDurationMinutes }
        if merged.description == nil { merged.description = old.description }
        if merged.topics == nil { merged.topics = old.topics }
        if merged.segments == nil { merged.segments = old.segments }
        if merged.sources == nil { merged.sources = old.sources }
        if merged.showNotes == nil { merged.showNotes = old.showNotes }
        if merged.transcript == nil { merged.transcript = old.transcript }
        if merged.coverImageURL == nil { merged.coverImageURL = old.coverImageURL }
        if merged.coverPrompt == nil { merged.coverPrompt = old.coverPrompt }
        if merged.errorMessage == nil { merged.errorMessage = old.errorMessage }
        if (merged.diveDeeperSeeds == nil || merged.diveDeeperSeeds?.isEmpty == true),
           let existing = old.diveDeeperSeeds,
           existing.isEmpty == false {
            merged.diveDeeperSeeds = existing
        }
        return merged
    }
}
