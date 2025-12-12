import Foundation
import os.log

@MainActor
final class AuthManager: ObservableObject {
    private let apiClient: APIClient
    private let keychain: KeychainStore
    private let anonKey: String
    private let authLog = OSLog(subsystem: "com.briefly.app", category: "Auth")

    @Published private(set) var currentToken: AuthToken?
    @Published private(set) var currentUserEmail: String?

    init(baseURL: URL, anonKey: String, keychain: KeychainStore, apiClient: APIClient? = nil) {
        self.keychain = keychain
        self.anonKey = anonKey
        self.apiClient = apiClient ?? APIClient(baseURL: baseURL)
        self.currentToken = keychain.loadToken()
        self.currentUserEmail = keychain.loadEmail()
    }

    func login(email: String, password: String) async throws -> AuthToken {
        os_log("AuthManager sending login request for email: %{public}@", log: authLog, type: .debug, email)
        let body = ["email": email, "password": password]
        let endpoint = APIEndpoint(
            path: "/auth/v1/token",
            method: .post,
            queryItems: [URLQueryItem(name: "grant_type", value: "password")],
            body: AnyEncodable(body),
            headers: [
                "apikey": anonKey,
                "Authorization": "Bearer \(anonKey)"
            ],
            requiresAuth: false
        )
        do {
            let token: AuthToken = try await apiClient.request(endpoint)
            os_log("AuthManager login succeeded for email: %{public}@ token length: %{public}d", log: authLog, type: .info, email, token.accessToken.count)
            persist(token: token, email: email)
            return token
        } catch {
            os_log("AuthManager login failed for email: %{public}@ error: %{public}@", log: authLog, type: .error, email, error.localizedDescription)
            throw error
        }
    }

    func signup(email: String, password: String) async throws -> AuthToken {
        let body = ["email": email, "password": password]
        let endpoint = APIEndpoint(
            path: "/auth/v1/signup",
            method: .post,
            body: AnyEncodable(body),
            headers: [
                "apikey": anonKey,
                "Authorization": "Bearer \(anonKey)"
            ],
            requiresAuth: false
        )
        let token: AuthToken = try await apiClient.request(endpoint)
        persist(token: token, email: email)
        return token
    }

    func logout() {
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
