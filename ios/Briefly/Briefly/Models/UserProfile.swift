import Foundation

struct UserProfile: Codable, Identifiable {
    var id: UUID = UUID()
    var email: String
}
