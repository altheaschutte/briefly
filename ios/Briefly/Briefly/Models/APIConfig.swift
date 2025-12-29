import Foundation

enum APIConfig {
    private static func string(for key: String) -> String {
        if let env = ProcessInfo.processInfo.environment[key], env.isEmpty == false {
            return env
        }
        if let plistValue = Bundle.main.object(forInfoDictionaryKey: key) as? String, plistValue.isEmpty == false {
            return plistValue
        }
        fatalError("Missing config key: \(key)")
    }

    private static func url(for key: String) -> URL {
        let value = string(for: key)
        guard let url = URL(string: value) else {
            fatalError("Invalid URL for key \(key): \(value)")
        }
        return url
    }

    static let baseURL = url(for: "API_BASE_URL")
    static let authBaseURL = url(for: "SUPABASE_URL")
    static let authAPIKey: String = string(for: "SUPABASE_ANON_KEY")
    static let webAppURL: URL = url(for: "APP_WEB_URL")

    static var manageAccountURL: URL {
        webAppURL.appendingPathComponent("subscriptions")
    }

    static var supabaseRestURL: URL {
        authBaseURL.appendingPathComponent("rest/v1")
    }

    static var supabaseAuthURL: URL {
        authBaseURL.appendingPathComponent("auth/v1")
    }
}
