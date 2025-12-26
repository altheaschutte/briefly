import XCTest
@testable import Briefly

final class AuthManagerTests: XCTestCase {
    func testVerifyOtpPersistsToken() async throws {
        let keychain = KeychainStore()
        let mockProvider = MockOTPProvider()
        mockProvider.verifyResult = AuthToken(accessToken: "abc", refreshToken: "ref", expiresAt: Date())

        let manager = AuthManager(authProvider: mockProvider, keychain: keychain)

        try await manager.sendOtp(email: "test@example.com")
        XCTAssertEqual(mockProvider.sentEmails.last, "test@example.com")

        let token = try await manager.verifyOtp(email: "test@example.com", token: "123456")
        XCTAssertEqual(token.accessToken, "abc")
        XCTAssertEqual(manager.currentToken?.accessToken, "abc")

        await manager.logout()
        XCTAssertNil(manager.currentToken)
    }
}

private final class MockOTPProvider: OTPAuthProviding {
    var sentEmails: [String] = []
    var verifyResult: AuthToken?
    var refreshResult: AuthToken?
    var signOutCalled = false

    func sendOtp(email: String) async throws {
        sentEmails.append(email)
    }

    func verifyOtp(email: String, token: String) async throws -> AuthToken {
        return verifyResult ?? AuthToken(accessToken: "token", refreshToken: nil, expiresAt: nil)
    }

    func refreshSession(refreshToken: String) async throws -> AuthToken {
        return refreshResult ?? AuthToken(accessToken: "refreshed", refreshToken: nil, expiresAt: nil)
    }

    func signOut() async throws {
        signOutCalled = true
    }
}
