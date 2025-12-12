import XCTest
@testable import Briefly

final class APIClientTests: XCTestCase {
    func testRequestAddsAuthorizationHeader() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let session = URLSession(configuration: config)

        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token123")
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = #"{"message":"ok"}"#.data(using: .utf8)!
            return (response, data)
        }

        let client = APIClient(baseURL: URL(string: "https://example.com")!, session: session, tokenProvider: { "token123" })
        struct Response: Decodable { let message: String }
        let result: Response = try await client.request(APIEndpoint(path: "/test", method: .get))
        XCTAssertEqual(result.message, "ok")
    }
}
