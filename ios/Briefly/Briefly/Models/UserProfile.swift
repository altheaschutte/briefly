import Foundation

struct UserProfile: Codable, Identifiable {
    var id: String
    var firstName: String
    var intention: String

    enum CodingKeys: String, CodingKey {
        case id
        case firstName = "first_name"
        case intention
    }
}
