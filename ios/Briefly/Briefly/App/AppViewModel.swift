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
    @Published var prefetchedEntitlements: Entitlements?
    @Published var prefetchedSchedules: [Schedule]?
    @Published var isSeedingTopics: Bool = false
    @Published var isHandlingAuthRedirect: Bool = false
    @Published var snackbarMessage: String?

    let apiClient: APIClient
    let authManager: AuthManager
    let topicService: TopicService
    let episodeService: EpisodeService
    let entitlementsService: EntitlementsService
    let profileService: ProfileService
    let supabaseUserService: SupabaseUserService
    let scheduleService: ScheduleService
    lazy var audioPlayer: AudioPlayerManager = {
        let manager = AudioPlayerManager(audioURLProvider: { [weak self] episodeId in
            guard let self else { return nil }
            return await self.episodeService.fetchSignedAudioURL(for: episodeId)
        })
        manager.nextEpisodeResolver = { [weak self] currentEpisode in
            guard let self else { return nil }
            do {
                let episodes = try await self.episodeService.fetchEpisodes()
                let readyEpisodes = episodes.filter { $0.isReady }
                guard readyEpisodes.isEmpty == false else { return nil }
                if let currentIndex = readyEpisodes.firstIndex(where: { $0.id == currentEpisode.id }) {
                    let nextIndex = readyEpisodes.index(after: currentIndex)
                    return nextIndex < readyEpisodes.count ? readyEpisodes[nextIndex] : nil
                }
                return readyEpisodes.first
            } catch {
                os_log("Auto-play resolver fetch failed: %{public}@", log: self.playbackLog, type: .error, error.localizedDescription)
                return nil
            }
        }
        return manager
    }()

    private let keychain = KeychainStore()
    private let authLog = OSLog(subsystem: "com.briefly.app", category: "Auth")
    private let playbackLog = OSLog(subsystem: "com.briefly.app", category: "Playback")
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
        self.scheduleService = ScheduleService(apiClient: apiClient)

        self.apiClient.unauthorizedHandler = { [weak self] message in
            Task { @MainActor in
                guard let self else { return }
                if let message, message.lowercased().contains("authentication service") {
                    self.showSnackbar(message)
                    await self.logout()
                    return
                }
                await self.authManager.refreshSessionIfNeeded(force: true)
                if self.authManager.currentToken != nil {
                    self.apiClient.tokenProvider = { [weak authManager] in
                        authManager?.currentToken?.accessToken
                    }
                    return
                }
                self.showSnackbar(message ?? "Session expired. Please sign in again.")
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
            Task { await preloadEntitlements() }
            Task { await preloadSchedules() }
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
        async let topics = preloadTopics()
        async let episodes = preloadEpisodes()
        async let entitlements = preloadEntitlements()
        async let schedules = preloadSchedules()
        _ = await (topics, episodes, entitlements, schedules)
        isAuthenticated = token.accessToken.isEmpty == false
        os_log("AppViewModel authenticated=%{public}@ for email: %{public}@", log: authLog, type: .info, isAuthenticated.description, email)
    }

    func handleAuthRedirect(_ url: URL) async {
        guard isHandlingAuthRedirect == false else { return }
        isHandlingAuthRedirect = true
        defer { isHandlingAuthRedirect = false }
        do {
            let token = try await authManager.handleAuthRedirect(url: url)
            apiClient.tokenProvider = { [weak authManager] in
                authManager?.currentToken?.accessToken
            }
            currentUserEmail = authManager.currentUserEmail
            await refreshUserAndProfile()
            async let topics = preloadTopics()
            async let episodes = preloadEpisodes()
            async let entitlements = preloadEntitlements()
            async let schedules = preloadSchedules()
            _ = await (topics, episodes, entitlements, schedules)
            isAuthenticated = token.accessToken.isEmpty == false
            os_log("AppViewModel handled auth redirect authenticated=%{public}@ email=%{public}@",
                   log: authLog,
                   type: .info,
                   isAuthenticated.description,
                   currentUserEmail ?? "unknown")
        } catch {
            os_log("AppViewModel auth redirect failed: %{public}@", log: authLog, type: .error, error.localizedDescription)
        }
    }

    func signInWithGoogle() async throws {
        os_log("AppViewModel starting Google sign-in", log: authLog, type: .info)
        let token = try await authManager.signInWithGoogle()
        apiClient.tokenProvider = { [weak authManager] in
            authManager?.currentToken?.accessToken
        }
        currentUserEmail = authManager.currentUserEmail
        await refreshUserAndProfile()
        async let topics = preloadTopics()
        async let episodes = preloadEpisodes()
        async let entitlements = preloadEntitlements()
        async let schedules = preloadSchedules()
        _ = await (topics, episodes, entitlements, schedules)
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
        prefetchedEntitlements = nil
        prefetchedSchedules = nil
        isSeedingTopics = false
    }

    func showSnackbar(_ message: String, duration: TimeInterval = 3.5) {
        snackbarMessage = message
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
            if self.snackbarMessage == message {
                self.snackbarMessage = nil
            }
        }
    }

    func forceLogoutWithSnackbar(_ message: String = "Unable to reach our authentication service. Please retry or sign in again.") async {
        showSnackbar(message)
        await logout()
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
            let storedFlag = UserDefaults.standard.bool(forKey: "hasCompletedOnboarding")
            let remoteFlag = (profile?.userAboutContext.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
            let resolved = storedFlag || remoteFlag
            hasCompletedOnboarding = isSeedingTopics ? false : resolved
            UserDefaults.standard.set(resolved, forKey: "hasCompletedOnboarding")
        } catch {
            os_log("Fetching Supabase user/profile failed: %{public}@", log: authLog, type: .error, error.localizedDescription)
        }
    }

    func preloadTopics() async {
        do {
            let fetched = try await topicService.fetchTopics()
            guard isSeedingTopics == false else { return }
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

    func preloadEntitlements() async {
        do {
            let fetched = try await entitlementsService.fetchEntitlements()
            prefetchedEntitlements = fetched
        } catch {
            os_log("Preloading entitlements failed: %{public}@", log: authLog, type: .error, error.localizedDescription)
        }
    }

    func preloadSchedules() async {
        do {
            let fetched = try await scheduleService.listSchedules()
            prefetchedSchedules = fetched.sorted { $0.localTimeMinutes < $1.localTimeMinutes }
        } catch {
            os_log("Preloading schedules failed: %{public}@", log: authLog, type: .error, error.localizedDescription)
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

    func seedTopics(from userAboutContext: String) async throws -> [Topic] {
        isSeedingTopics = true
        defer { isSeedingTopics = false }
        let seeded = try await topicService.seedTopics(userAboutContext: userAboutContext)
        let sorted = seeded.sorted { $0.orderIndex < $1.orderIndex }
        prefetchedTopics = sorted
        return sorted
    }
}
