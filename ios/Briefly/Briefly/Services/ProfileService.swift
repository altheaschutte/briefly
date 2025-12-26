import Foundation

final class ProfileService {
    private let apiClient: APIClient
    private let anonKey: String

    init(baseURL: URL = APIConfig.supabaseRestURL,
         anonKey: String = APIConfig.authAPIKey,
         tokenProvider: (() -> String?)? = nil) {
        self.apiClient = APIClient(baseURL: baseURL)
        self.apiClient.tokenProvider = tokenProvider
        self.anonKey = anonKey
    }

    func fetchProfile(for userId: String) async throws -> UserProfile? {
        let endpoint = APIEndpoint(
            path: "/profiles",
            method: .get,
            queryItems: [
                URLQueryItem(name: "id", value: "eq.\(userId)"),
                URLQueryItem(name: "select", value: "id,first_name,intention"),
                URLQueryItem(name: "limit", value: "1")
            ],
            headers: supabaseHeaders()
        )
        let profiles: [UserProfile] = try await apiClient.request(endpoint)
        return profiles.first
    }

    @discardableResult
    func upsertProfile(_ profile: UserProfile) async throws -> UserProfile {
        let endpoint = APIEndpoint(
            path: "/profiles",
            method: .post,
            queryItems: [URLQueryItem(name: "on_conflict", value: "id")],
            body: AnyEncodable(profile),
            headers: supabaseHeaders(extra: ["Prefer": "resolution=merge-duplicates,return=representation"])
        )
        let profiles: [UserProfile] = try await apiClient.request(endpoint)
        return profiles.first ?? profile
    }
}

private extension ProfileService {
    func supabaseHeaders(extra: [String: String] = [:]) -> [String: String] {
        var headers = ["apikey": anonKey]
        extra.forEach { headers[$0.key] = $0.value }
        return headers
    }
}
