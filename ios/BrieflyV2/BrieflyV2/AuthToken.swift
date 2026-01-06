import Foundation
#if canImport(Supabase)
import Supabase
#endif

struct AuthToken: Codable {
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Date?
    let userEmail: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresAt = "expires_at"
        case userEmail = "user_email"
    }

    init(accessToken: String, refreshToken: String?, expiresAt: Date?, userEmail: String? = nil) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
        self.userEmail = userEmail
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try container.decode(String.self, forKey: .accessToken)
        refreshToken = try? container.decode(String.self, forKey: .refreshToken)
        userEmail = try? container.decodeIfPresent(String.self, forKey: .userEmail)
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

#if canImport(Supabase)
extension AuthToken {
    init(session: Supabase.Session) {
        let expires: Date? = {
            if session.expiresAt > 0 {
                return Date(timeIntervalSince1970: session.expiresAt)
            }
            if session.expiresIn > 0 {
                return Date().addingTimeInterval(session.expiresIn)
            }
            return nil
        }()
        self.init(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            expiresAt: expires,
            userEmail: session.user.email
        )
    }
}
#endif
