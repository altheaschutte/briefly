import Combine
import Foundation
import os.log

@MainActor
final class AppViewModel: ObservableObject {
    @Published var isAuthenticated: Bool = false
    @Published var isHandlingAuthRedirect: Bool = false
    @Published var isBootstrapping: Bool = true
    @Published var currentUserEmail: String?

    let apiClient: APIClient
    let authManager: AuthManager
    let entitlementsService: EntitlementsService
    let scheduleService: ScheduleService
    let notificationService: NotificationService
    let pushManager: PushNotificationManager
    let playbackPreferences = PlaybackPreferences()
    let playbackHistory = PlaybackHistory()
    let audioPlayer: AudioPlayerManager
    private let authLog = OSLog(subsystem: "com.briefly.brieflyv2", category: "Auth")

    init() {
        let authProvider = SupabaseAuthProvider(url: APIConfig.authCustomDomainBaseURL, anonKey: APIConfig.authAPIKey)
        let keychain = KeychainStore()
        let manager = AuthManager(authProvider: authProvider, keychain: keychain)
        self.authManager = manager
        let apiClient = APIClient(baseURL: APIConfig.baseURL) { [weak manager] in
            manager?.currentToken?.accessToken
        }
        self.apiClient = apiClient
        self.entitlementsService = EntitlementsService(apiClient: apiClient)
        self.scheduleService = ScheduleService(apiClient: apiClient)
        self.notificationService = NotificationService(apiClient: apiClient)
        self.pushManager = PushNotificationManager(notificationService: notificationService)
        let episodeService = EpisodeService(baseURL: APIConfig.baseURL) { [weak manager] in
            manager?.currentToken?.accessToken
        }
        self.audioPlayer = AudioPlayerManager(
            service: episodeService,
            playbackPreferences: playbackPreferences,
            playbackHistory: playbackHistory
        )
        self.isAuthenticated = manager.currentToken != nil
        self.currentUserEmail = manager.currentUserEmail
        self.apiClient.unauthorizedHandler = { [weak manager] _ in
            Task { await manager?.refreshSessionIfNeeded(force: true) }
        }
    }

    func bootstrap() {
        isAuthenticated = authManager.currentToken != nil
        currentUserEmail = authManager.currentUserEmail
        isBootstrapping = false
        Task { await authManager.refreshSessionIfNeeded(force: false) }
    }

    func sendOtp(email: String) async throws {
        try await authManager.sendOtp(email: email)
    }

    func verifyOtp(email: String, code: String) async throws {
        os_log("AppViewModel verifying OTP for email: %{public}@", log: authLog, type: .debug, email)
        let token = try await authManager.verifyOtp(email: email, token: code)
        currentUserEmail = email
        isAuthenticated = token.accessToken.isEmpty == false
    }

    func handleAuthRedirect(_ url: URL) async {
        guard isHandlingAuthRedirect == false else { return }
        isHandlingAuthRedirect = true
        defer { isHandlingAuthRedirect = false }
        do {
            let token = try await authManager.handleAuthRedirect(url: url)
            currentUserEmail = authManager.currentUserEmail
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
        currentUserEmail = authManager.currentUserEmail
        isAuthenticated = token.accessToken.isEmpty == false
    }

    func logout() async {
        await authManager.logout()
        isAuthenticated = false
        currentUserEmail = nil
    }
}
