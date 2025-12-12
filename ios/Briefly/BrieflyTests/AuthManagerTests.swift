import XCTest
@testable import Briefly

final class AuthManagerTests: XCTestCase {
    func testLoginPersistsToken() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let session = URLSession(configuration: config)

        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertTrue(request.url?.absoluteString.contains("grant_type=password") ?? false)
            let body = try XCTUnwrap(request.httpBody)
            let json = try JSONSerialization.jsonObject(with: body) as? [String: String]
            XCTAssertEqual(json?["email"], "test@example.com")
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = #"{"access_token":"abc","refresh_token":"ref","expires_at": 0}"#.data(using: .utf8)!
            return (response, data)
        }

        let apiClient = APIClient(baseURL: URL(string: "https://example.com")!, session: session)
        let keychain = KeychainStore()
        let manager = AuthManager(baseURL: URL(string: "https://example.com")!,
                                  anonKey: "anon",
                                  keychain: keychain,
                                  apiClient: apiClient)

        let token = try await manager.login(email: "test@example.com", password: "password")
        XCTAssertEqual(token.accessToken, "abc")
        XCTAssertEqual(manager.currentToken?.accessToken, "abc")

        manager.logout()
    }
}
