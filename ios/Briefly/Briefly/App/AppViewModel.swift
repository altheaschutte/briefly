import Combine
import Foundation
import os.log

@MainActor
final class AppViewModel: ObservableObject {
    @Published var isAuthenticated: Bool = false
    @Published var isBootstrapping: Bool = true
    @Published var currentUserEmail: String?
    @Published var hasCompletedOnboarding: Bool = UserDefaults.standard.bool(forKey: "hasCompletedOnboarding")
    @Published var currentUserId: String?
    @Published var suggestedFirstName: String?
    @Published var isCheckingProfile: Bool = false
    @Published var prefetchedTopics: [Topic]?
    @Published var prefetchedEpisodes: [Episode]?

    let apiClient: APIClient
    let authManager: AuthManager
    let topicService: TopicService
    let episodeService: EpisodeService
    let entitlementsService: EntitlementsService
    let profileService: ProfileService
    let supabaseUserService: SupabaseUserService
    let audioPlayer = AudioPlayerManager()

    private let keychain = KeychainStore()
    private let authLog = OSLog(subsystem: "com.briefly.app", category: "Auth")
    private var cancellables = Set<AnyCancellable>()

    init() {
        let authProvider = SupabaseAuthProvider(url: APIConfig.authBaseURL, anonKey: APIConfig.authAPIKey)
        let authManager = AuthManager(authProvider: authProvider,
                                      keychain: keychain)
        let apiClient = APIClient(baseURL: APIConfig.baseURL)
        apiClient.tokenProvider = { [weak authManager] in
            authManager?.currentToken?.accessToken
        }

        self.authManager = authManager
        self.apiClient = apiClient
        self.entitlementsService = EntitlementsService(apiClient: apiClient)
        self.topicService = TopicService(apiClient: apiClient)
        self.episodeService = EpisodeService(apiClient: apiClient)
        self.profileService = ProfileService(tokenProvider: { [weak authManager] in
            authManager?.currentToken?.accessToken
        })
        self.supabaseUserService = SupabaseUserService(tokenProvider: { [weak authManager] in
            authManager?.currentToken?.accessToken
        })

        self.apiClient.unauthorizedHandler = { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                await self.authManager.refreshSessionIfNeeded(force: true)
                if self.authManager.currentToken != nil {
                    self.apiClient.tokenProvider = { [weak authManager] in
                        authManager?.currentToken?.accessToken
                    }
                    return
                }
                await self.logout()
            }
        }
    }

    func bootstrap() {
        if authManager.currentToken != nil {
            isAuthenticated = true
            currentUserEmail = authManager.currentUserEmail
            Task { await authManager.refreshSessionIfNeeded() }
            Task { await refreshUserAndProfile() }
            Task { await preloadTopics() }
            Task { await preloadEpisodes() }
        }
        isBootstrapping = false
    }

    func sendOtp(email: String) async throws {
        try await authManager.sendOtp(email: email)
    }

    func verifyOtp(email: String, code: String) async throws {
        os_log("AppViewModel verifying OTP for email: %{public}@", log: authLog, type: .debug, email)
        let token = try await authManager.verifyOtp(email: email, token: code)
        apiClient.tokenProvider = { [weak authManager] in
            authManager?.currentToken?.accessToken
        }
        currentUserEmail = email
        await refreshUserAndProfile()
        await preloadTopics()
        await preloadEpisodes()
        isAuthenticated = token.accessToken.isEmpty == false
        os_log("AppViewModel authenticated=%{public}@ for email: %{public}@", log: authLog, type: .info, isAuthenticated.description, email)
    }

    func signInWithGoogle() async throws {
        os_log("AppViewModel starting Google sign-in", log: authLog, type: .info)
        let token = try await authManager.signInWithGoogle()
        apiClient.tokenProvider = { [weak authManager] in
            authManager?.currentToken?.accessToken
        }
        currentUserEmail = authManager.currentUserEmail
        await refreshUserAndProfile()
        await preloadTopics()
        await preloadEpisodes()
        isAuthenticated = token.accessToken.isEmpty == false
        os_log("AppViewModel Google sign-in completed, authenticated=%{public}@ email=%{public}@",
               log: authLog,
               type: .info,
               isAuthenticated.description,
               currentUserEmail ?? "unknown")
    }

    func logout() async {
        await authManager.logout()
        isAuthenticated = false
        currentUserEmail = nil
        audioPlayer.stop()
        hasCompletedOnboarding = false
        UserDefaults.standard.set(false, forKey: "hasCompletedOnboarding")
        currentUserId = nil
        suggestedFirstName = nil
        isCheckingProfile = false
        prefetchedTopics = nil
        prefetchedEpisodes = nil
    }

    func markOnboardingComplete() {
        hasCompletedOnboarding = true
        UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")
    }

    func refreshUserAndProfile() async {
        guard authManager.currentToken != nil else { return }
        isCheckingProfile = true
        defer { isCheckingProfile = false }
        do {
            let user = try await supabaseUserService.fetchCurrentUser()
            currentUserId = user.id
            currentUserEmail = user.email ?? currentUserEmail
            suggestedFirstName = user.suggestedFirstName
            let profile = try await profileService.fetchProfile(for: user.id)
            hasCompletedOnboarding = profile != nil
            UserDefaults.standard.set(hasCompletedOnboarding, forKey: "hasCompletedOnboarding")
        } catch {
            os_log("Fetching Supabase user/profile failed: %{public}@", log: authLog, type: .error, error.localizedDescription)
        }
    }

    func preloadTopics() async {
        do {
            let fetched = try await topicService.fetchTopics()
            prefetchedTopics = fetched.sorted { $0.orderIndex < $1.orderIndex }
        } catch {
            os_log("Preloading topics failed: %{public}@", log: authLog, type: .error, error.localizedDescription)
        }
    }

    func preloadEpisodes() async {
        do {
            let fetched = try await episodeService.fetchEpisodes()
            prefetchedEpisodes = sortEpisodes(fetched)
        } catch {
            os_log("Preloading episodes failed: %{public}@", log: authLog, type: .error, error.localizedDescription)
        }
    }

    private func sortEpisodes(_ episodes: [Episode]) -> [Episode] {
        let sorted = episodes.sorted { lhs, rhs in
            let lhsDate = lhs.displayDate ?? .distantPast
            let rhsDate = rhs.displayDate ?? .distantPast
            return lhsDate > rhsDate
        }

        var seen = Set<UUID>()
        var unique: [Episode] = []
        for episode in sorted where seen.insert(episode.id).inserted {
            unique.append(episode)
        }
        return unique
    }
}
