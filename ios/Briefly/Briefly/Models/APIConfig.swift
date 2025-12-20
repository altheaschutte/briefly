import Foundation

enum APIConfig {
    // Update these values to point at the running backend
    static let baseURL = URL(string: "http://127.0.0.1:3344")!
    static let authBaseURL = URL(string: "http://127.0.0.1:54321")!
    static let authAPIKey: String = {
        if let env = ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"], env.isEmpty == false {
            return env
        }
        if let plistValue = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
           plistValue.isEmpty == false {
            return plistValue
        }
        return ""
    }()

    static let webAppURL: URL = {
        if let env = ProcessInfo.processInfo.environment["APP_WEB_URL"],
           let url = URL(string: env) {
            return url
        }
        if let plistValue = Bundle.main.object(forInfoDictionaryKey: "APP_WEB_URL") as? String,
           let url = URL(string: plistValue) {
            return url
        }
        return URL(string: "https://brieflypodcast.app")!
    }()

    static var manageAccountURL: URL {
        webAppURL.appendingPathComponent("account")
    }
}
