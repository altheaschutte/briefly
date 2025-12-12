import Foundation

struct AuthToken: Codable {
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Date?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresAt = "expires_at"
    }

    init(accessToken: String, refreshToken: String?, expiresAt: Date?) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try container.decode(String.self, forKey: .accessToken)
        refreshToken = try? container.decode(String.self, forKey: .refreshToken)
        if let timestamp = try? container.decode(Double.self, forKey: .expiresAt) {
            expiresAt = Date(timeIntervalSince1970: timestamp)
        } else if let stringValue = try? container.decode(String.self, forKey: .expiresAt),
                  let date = ISO8601DateFormatter().date(from: stringValue) {
            expiresAt = date
        } else {
            expiresAt = nil
        }
    }
}
