import Foundation
import Security

final class KeychainStore {
    private let service = "com.briefly.app"
    private let tokenKey = "authToken"
    private let emailKey = "userEmail"

    func saveToken(_ token: AuthToken) {
        do {
            let data = try JSONEncoder().encode(token)
            try save(data: data, for: tokenKey)
        } catch {
            print("Keychain save token failed: \(error)")
        }
    }

    func loadToken() -> AuthToken? {
        guard let data = try? loadData(for: tokenKey) else { return nil }
        return try? JSONDecoder().decode(AuthToken.self, from: data)
    }

    func deleteToken() {
        deleteValue(for: tokenKey)
    }

    func saveEmail(_ email: String) {
        if let data = email.data(using: .utf8) {
            try? save(data: data, for: emailKey)
        }
    }

    func loadEmail() -> String? {
        guard let data = try? loadData(for: emailKey) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func deleteEmail() {
        deleteValue(for: emailKey)
    }

    private func save(data: Data, for key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    private func loadData(for key: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: kCFBooleanTrue as Any,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else {
            return nil
        }
        return item as? Data
    }

    private func deleteValue(for key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}
