import Foundation

struct UserProfile: Codable, Identifiable {
    var id: String
    var firstName: String
    var intention: String
    var userAboutContext: String
    var timezone: String

    enum CodingKeys: String, CodingKey {
        case id
        case firstName = "first_name"
        case intention
        case userAboutContext = "user_about_context"
        case timezone
    }
}
