import Foundation

struct SupabaseUser: Decodable {
    let id: String
    let email: String?
    let userMetadata: [String: String]?

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case userMetadata = "user_metadata"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        email = try container.decodeIfPresent(String.self, forKey: .email)

        if let metadataContainer = try? container.nestedContainer(keyedBy: DynamicCodingKeys.self, forKey: .userMetadata) {
            var metadata: [String: String] = [:]
            for key in metadataContainer.allKeys {
                if let value = try? metadataContainer.decode(String.self, forKey: key) {
                    metadata[key.stringValue] = value
                }
            }
            userMetadata = metadata.isEmpty ? nil : metadata
        } else {
            userMetadata = nil
        }
    }
}

extension SupabaseUser {
    var suggestedFirstName: String? {
        if let given = userMetadata?["given_name"], given.isEmpty == false {
            return given.split(separator: " ").first.map(String.init)
        }
        if let full = userMetadata?["full_name"], full.isEmpty == false {
            return full.split(separator: " ").first.map(String.init)
        }
        if let name = userMetadata?["name"], name.isEmpty == false {
            return name.split(separator: " ").first.map(String.init)
        }
        return nil
    }
}

private struct DynamicCodingKeys: CodingKey {
    var stringValue: String
    init?(stringValue: String) { self.stringValue = stringValue }
    var intValue: Int? { nil }
    init?(intValue: Int) { return nil }
}
