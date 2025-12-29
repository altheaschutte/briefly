import Foundation
import os.log

@MainActor
final class AuthManager: ObservableObject {
    private let keychain: KeychainStore
    private let authProvider: OTPAuthProviding
    private let authLog = OSLog(subsystem: "com.briefly.app", category: "Auth")

    @Published private(set) var currentToken: AuthToken?
    @Published private(set) var currentUserEmail: String?
    private var lastRefreshDate: Date?

    init(authProvider: OTPAuthProviding, keychain: KeychainStore) {
        self.authProvider = authProvider
        self.keychain = keychain
        self.currentToken = keychain.loadToken()
        self.currentUserEmail = keychain.loadEmail()
    }

    func sendOtp(email: String) async throws {
        os_log("AuthManager sending OTP for email: %{public}@", log: authLog, type: .debug, email)
        try await authProvider.sendOtp(email: email)
    }

    func verifyOtp(email: String, token code: String) async throws -> AuthToken {
        os_log("AuthManager verifying OTP for email: %{public}@", log: authLog, type: .debug, email)
        let token = try await authProvider.verifyOtp(email: email, token: code)
        persist(token: token, email: email)
        os_log("AuthManager OTP verification succeeded for email: %{public}@", log: authLog, type: .info, email)
        return token
    }

    func handleAuthRedirect(url: URL) async throws -> AuthToken {
        os_log("AuthManager handling auth redirect: %{public}@", log: authLog, type: .debug, url.absoluteString)
        let token = try await authProvider.handleAuthRedirect(url: url)
        let email = token.userEmail ?? currentUserEmail ?? ""
        persist(token: token, email: email)
        os_log("AuthManager auth redirect succeeded for email: %{public}@", log: authLog, type: .info, email)
        return token
    }

    func signInWithGoogle() async throws -> AuthToken {
        os_log("AuthManager starting Google sign-in", log: authLog, type: .info)
        let token = try await authProvider.signInWithGoogle()
        let email = token.userEmail ?? currentUserEmail ?? ""
        persist(token: token, email: email)
        os_log("AuthManager Google sign-in succeeded for email: %{public}@", log: authLog, type: .info, email)
        return token
    }

    func refreshSessionIfNeeded(force: Bool = false) async {
        guard let token = currentToken else { return }
        guard let refresh = token.refreshToken else { return }

        let now = Date()
        var shouldRefresh = force

        if let expiresAt = token.expiresAt {
            let timeRemaining = expiresAt.timeIntervalSince(now)
            if timeRemaining <= 0 || timeRemaining < 600 { // refresh if expired or within 10 minutes
                shouldRefresh = true
            }
        } else if let last = lastRefreshDate {
            if now.timeIntervalSince(last) > 86_400 { // once a day when no expiry provided
                shouldRefresh = true
            }
        } else {
            shouldRefresh = true
        }

        guard shouldRefresh else { return }
        do {
            let refreshed = try await authProvider.refreshSession(refreshToken: refresh)
            lastRefreshDate = Date()
            persist(token: refreshed, email: currentUserEmail ?? "")
            os_log("AuthManager refreshed session for email: %{public}@", log: authLog, type: .info, currentUserEmail ?? "unknown")
        } catch {
            os_log("AuthManager refresh failed: %{public}@", log: authLog, type: .error, error.localizedDescription)
            await logout()
        }
    }

    func logout() async {
        do {
            try await authProvider.signOut()
        } catch {
            os_log("AuthManager signOut error: %{public}@", log: authLog, type: .error, error.localizedDescription)
        }
        keychain.deleteToken()
        keychain.deleteEmail()
        currentToken = nil
        currentUserEmail = nil
    }

    private func persist(token: AuthToken, email: String) {
        currentToken = token
        currentUserEmail = email
        keychain.saveToken(token)
        keychain.saveEmail(email)
    }
}
