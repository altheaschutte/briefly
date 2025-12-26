import Foundation
import Supabase

struct SupabaseAuthProvider: OTPAuthProviding {
    private let client: SupabaseClient

    init(url: URL, anonKey: String) {
        let options = SupabaseClientOptions(
            auth: .init(
                redirectToURL: URL(string: "io.supabase.gotrue://login-callback")
            )
        )
        self.client = SupabaseClient(supabaseURL: url, supabaseKey: anonKey, options: options)
    }

    func sendOtp(email: String) async throws {
        try await client.auth.signInWithOTP(
            email: email,
            shouldCreateUser: true
        )
    }

    func verifyOtp(email: String, token: String) async throws -> AuthToken {
        let response: AuthResponse = try await client.auth.verifyOTP(
            email: email,
            token: token,
            type: .email
        )
        guard let session = response.session else {
            throw AuthProviderError.missingSession
        }
        return AuthToken(session: session)
    }

    func refreshSession(refreshToken: String) async throws -> AuthToken {
        let session = try await client.auth.refreshSession(
            refreshToken: refreshToken
        )
        return AuthToken(session: session)
    }

    func signOut() async throws {
        try await client.auth.signOut()
    }

    func signInWithGoogle() async throws -> AuthToken {
        let session = try await client.auth.signInWithOAuth(provider: .google)
        return AuthToken(session: session)
    }
}
