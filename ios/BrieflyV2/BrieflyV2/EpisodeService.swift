import Foundation

struct EpisodeService {
    let baseURL: URL
    let tokenProvider: () -> String?

    init(baseURL: URL = APIConfig.baseURL, tokenProvider: @escaping () -> String?) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
    }

    func fetchEpisodes() async throws -> [Episode] {
        let data = try await request(path: "/episodes")
        let decoder = EpisodeService.makeDecoder()
        if let episodes = try? decoder.decode([Episode].self, from: data) {
            return episodes
        }
        struct Envelope: Decodable { let data: [Episode] }
        let envelope = try decoder.decode(Envelope.self, from: data)
        return envelope.data
    }

    func fetchEpisode(id: UUID) async throws -> Episode {
        let data = try await request(path: "/episodes/\(id.uuidString)")
        let decoder = EpisodeService.makeDecoder()
        if let episode = try? decoder.decode(Episode.self, from: data) {
            return episode
        }
        struct Envelope: Decodable { let data: Episode }
        let envelope = try decoder.decode(Envelope.self, from: data)
        return envelope.data
    }

    func fetchSignedAudioURL(for id: UUID) async -> URL? {
        do {
            let data = try await request(path: "/episodes/\(id.uuidString)/audio")
            struct Response: Decodable {
                let audioUrl: String?
                let audio_url: String?
            }
            let response = try EpisodeService.makeDecoder().decode(Response.self, from: data)
            let value = response.audioUrl ?? response.audio_url
            guard let urlString = value, let url = URL(string: urlString) else { return nil }
            return url
        } catch {
            return nil
        }
    }

    func requestDiveDeeperEpisode(
        parentEpisodeID: UUID,
        seedID: UUID,
        targetDurationMinutes: Int? = nil
    ) async throws -> EpisodeCreation {
        var body: Data?
        if let targetDurationMinutes {
            struct Payload: Encodable { let duration: Int }
            body = try JSONEncoder().encode(Payload(duration: targetDurationMinutes))
        }
        let path = "/episodes/\(parentEpisodeID.uuidString)/dive-deeper/\(seedID.uuidString)"
        let data = try await request(path: path, method: "POST", body: body)
        let response = try EpisodeService.makeDecoder().decode(EpisodeCreationResponse.self, from: data)
        guard let episodeId = response.episodeId else {
            throw URLError(.badServerResponse)
        }
        return EpisodeCreation(episodeId: episodeId, status: response.status)
    }

    func deleteEpisode(id: UUID) async throws {
        _ = try await request(path: "/episodes/\(id.uuidString)", method: "DELETE")
    }

    private func request(path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token = tokenProvider(), token.isEmpty == false {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return data
    }
}

private extension EpisodeService {
    static let iso8601Basic: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)

            if let date = iso8601WithFractionalSeconds.date(from: string) {
                return date
            }
            if let date = iso8601Basic.date(from: string) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid date format: \(string)"
            )
        }
        return decoder
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
