import Foundation

final class SupabaseUserService {
    private let apiClient: APIClient
    private let anonKey: String

    init(baseURL: URL = APIConfig.supabaseAuthURL,
         anonKey: String = APIConfig.authAPIKey,
         tokenProvider: (() -> String?)? = nil) {
        self.apiClient = APIClient(baseURL: baseURL)
        self.apiClient.tokenProvider = tokenProvider
        self.anonKey = anonKey
    }

    func fetchCurrentUser() async throws -> SupabaseUser {
        let endpoint = APIEndpoint(
            path: "/user",
            method: .get,
            headers: ["apikey": anonKey]
        )
        return try await apiClient.request(endpoint)
    }
}
