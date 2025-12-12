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
            "created_at": "2024-02-10T12:00:00Z",
            "updated_at": "2024-02-10T12:30:00Z"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
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
        XCTAssertFalse(episode.title.isEmpty)
    }
}
