import Foundation

protocol EntitlementsProviding {
    func fetchEntitlements() async throws -> Entitlements
}

final class EntitlementsService: EntitlementsProviding {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchEntitlements() async throws -> Entitlements {
        let endpoint = APIEndpoint(path: "/me/entitlements", method: .get)
        return try await apiClient.request(endpoint)
    }
}
