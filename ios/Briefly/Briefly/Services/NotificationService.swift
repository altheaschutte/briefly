import Foundation

struct RegisterDeviceRequest: Encodable {
    let token: String
    let platform: String
}

final class NotificationService {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func registerDevice(token: String, platform: String = "ios") async throws {
        let payload = RegisterDeviceRequest(token: token, platform: platform)
        let endpoint = APIEndpoint(
            path: "/notifications/device",
            method: .post,
            body: AnyEncodable(payload)
        )
        try await apiClient.requestVoid(endpoint)
    }

    func unregisterDevice(token: String) async throws {
        let endpoint = APIEndpoint(
            path: "/notifications/device/\(token)",
            method: .delete
        )
        try await apiClient.requestVoid(endpoint)
    }
}
