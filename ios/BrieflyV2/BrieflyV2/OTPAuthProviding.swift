import Foundation

protocol OTPAuthProviding {
    func sendOtp(email: String) async throws
    func verifyOtp(email: String, token: String) async throws -> AuthToken
    func handleAuthRedirect(url: URL) async throws -> AuthToken
    func refreshSession(refreshToken: String) async throws -> AuthToken
    func signOut() async throws
    func signInWithGoogle() async throws -> AuthToken
}

enum AuthProviderError: LocalizedError {
    case missingSession
    case missingRefreshToken

    var errorDescription: String? {
        switch self {
        case .missingSession:
            return "No session returned from Supabase."
        case .missingRefreshToken:
            return "Missing refresh token."
        }
    }
}
