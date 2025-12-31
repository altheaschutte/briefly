import XCTest
@testable import Briefly

final class EpisodeDecodingTests: XCTestCase {
    func testDecodesBackendEpisodeShape() throws {
        let json = """
        {
            "id": "01234567-89AB-CDEF-0123-456789ABCDEF",
            "userId": "user-123",
            "status": "ready",
            "target_duration_minutes": 15,
            "duration_seconds": 780,
            "audioUrl": "https://example.com/audio.mp3",
            "transcript": "Hello world script",
            "show_notes": "Short summary line.\\n\\n- point one\\n- point two",
            "cover_image_url": "https://example.com/cover.png",
            "cover_prompt": "Composition inspired by layered ideas.",
            "dive_deeper_seeds": [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "episode_id": "01234567-89AB-CDEF-0123-456789ABCDEF",
                    "segment_id": "22222222-2222-2222-2222-222222222222",
                    "position": 0,
                    "title": "Go deeper on this",
                    "angle": "Investigate the most surprising claim in this segment.",
                    "focus_claims": ["Claim A"],
                    "seed_queries": ["example query"],
                    "context_bundle": {"segment_summary": "A short summary"},
                    "created_at": "2024-02-10T12:05:00.123Z",
                    "updated_at": "2024-02-10T12:06:00.123Z"
                }
            ],
            "created_at": "2024-02-10T12:00:00Z",
            "updated_at": "2024-02-10T12:30:00Z"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)

            let withFractional = ISO8601DateFormatter()
            withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = withFractional.date(from: string) {
                return date
            }

            let basic = ISO8601DateFormatter()
            basic.formatOptions = [.withInternetDateTime]
            if let date = basic.date(from: string) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid date format: \(string)"
            )
        }
        let episode = try decoder.decode(Episode.self, from: json)
        let formatter = ISO8601DateFormatter()

        XCTAssertEqual(episode.id, UUID(uuidString: "01234567-89AB-CDEF-0123-456789ABCDEF"))
        XCTAssertEqual(episode.audioURL, URL(string: "https://example.com/audio.mp3"))
        XCTAssertEqual(episode.coverImageURL, URL(string: "https://example.com/cover.png"))
        XCTAssertEqual(episode.coverPrompt, "Composition inspired by layered ideas.")
        XCTAssertEqual(episode.durationSeconds, 780)
        XCTAssertEqual(episode.targetDurationMinutes, 15)
        XCTAssertEqual(episode.createdAt, formatter.date(from: "2024-02-10T12:00:00Z"))
        XCTAssertEqual(episode.updatedAt, formatter.date(from: "2024-02-10T12:30:00Z"))
        XCTAssertEqual(episode.displayDate, formatter.date(from: "2024-02-10T12:00:00Z"))
        XCTAssertEqual(episode.publishedAt, formatter.date(from: "2024-02-10T12:00:00Z"))
        XCTAssertEqual(episode.durationDisplaySeconds, 780)
        XCTAssertEqual(episode.status, "ready")
        XCTAssertEqual(episode.summary, "Short summary line.")
        XCTAssertEqual(episode.diveDeeperSeeds?.count, 1)
        XCTAssertEqual(episode.diveDeeperSeeds?.first?.title, "Go deeper on this")
        XCTAssertEqual(episode.diveDeeperSeeds?.first?.createdAt, formatter.date(from: "2024-02-10T12:05:00.123Z"))
        XCTAssertFalse(episode.title.isEmpty)
    }

    func testDisplayTitleStripsBracketedEpisodeNumberSuffix() throws {
        let json = """
        {
            "id": "01234567-89AB-CDEF-0123-456789ABCDEF",
            "title": "Morning Briefly [15]"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        let episode = try decoder.decode(Episode.self, from: json)

        XCTAssertEqual(episode.title, "Morning Briefly [15]")
        XCTAssertEqual(episode.displayTitle, "Morning Briefly")
    }
}
