import Combine
import Foundation
import os.log

@MainActor
final class AppViewModel: ObservableObject {
    @Published var isAuthenticated: Bool = false
    @Published var isBootstrapping: Bool = true
    @Published var currentUserEmail: String?
    @Published var hasCompletedOnboarding: Bool = UserDefaults.standard.bool(forKey: "hasCompletedOnboarding")

    let apiClient: APIClient
    let authManager: AuthManager
    let topicService: TopicService
    let episodeService: EpisodeService
    let audioPlayer = AudioPlayerManager()

    private let keychain = KeychainStore()
    private let authLog = OSLog(subsystem: "com.briefly.app", category: "Auth")
    private var cancellables = Set<AnyCancellable>()

    init() {
        let authManager = AuthManager(baseURL: APIConfig.authBaseURL,
                                      anonKey: APIConfig.authAPIKey,
                                      keychain: keychain)
        let apiClient = APIClient(baseURL: APIConfig.baseURL)
        apiClient.tokenProvider = { [weak authManager] in
            authManager?.currentToken?.accessToken
        }

        self.authManager = authManager
        self.apiClient = apiClient
        self.topicService = TopicService(apiClient: apiClient)
        self.episodeService = EpisodeService(apiClient: apiClient)
    }

    func bootstrap() {
        if authManager.currentToken != nil {
            isAuthenticated = true
            currentUserEmail = authManager.currentUserEmail
        }
        isBootstrapping = false
    }

    func handleLogin(email: String, password: String) async throws {
        os_log("AppViewModel handling login for email: %{public}@", log: authLog, type: .debug, email)
        do {
            let token = try await authManager.login(email: email, password: password)
            apiClient.tokenProvider = { [weak authManager] in
                authManager?.currentToken?.accessToken
            }
            currentUserEmail = email
            isAuthenticated = token.accessToken.isEmpty == false
            os_log("AppViewModel authenticated=%{public}@ for email: %{public}@", log: authLog, type: .info, isAuthenticated.description, email)
        } catch {
            os_log("AppViewModel login failed for email: %{public}@ error: %{public}@", log: authLog, type: .error, email, error.localizedDescription)
            throw error
        }
    }

    func handleSignup(email: String, password: String) async throws {
        let token = try await authManager.signup(email: email, password: password)
        apiClient.tokenProvider = { [weak authManager] in
            authManager?.currentToken?.accessToken
        }
        currentUserEmail = email
        isAuthenticated = token.accessToken.isEmpty == false
    }

    func logout() {
        authManager.logout()
        isAuthenticated = false
        currentUserEmail = nil
        audioPlayer.stop()
        hasCompletedOnboarding = false
        UserDefaults.standard.set(false, forKey: "hasCompletedOnboarding")
    }

    func markOnboardingComplete() {
        hasCompletedOnboarding = true
        UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")
    }
}
