import Foundation

@MainActor
final class HomeViewModel: ObservableObject {
    @Published var latestEpisode: Episode?
    @Published var errorMessage: String?
    @Published var isLoading: Bool = false

    private let episodeService: EpisodeProviding
    private let audioManager: AudioPlayerManager
    private let onFatalAuthError: ((String) -> Void)?

    init(
        episodeService: EpisodeProviding,
        audioManager: AudioPlayerManager,
        onFatalAuthError: ((String) -> Void)? = nil
    ) {
        self.episodeService = episodeService
        self.audioManager = audioManager
        self.onFatalAuthError = onFatalAuthError
    }

    func loadLatest() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        var lastError: String?
        for attempt in 1...3 {
            do {
                latestEpisode = try await episodeService.fetchLatestEpisode()
                errorMessage = nil
                return
            } catch let apiError as APIError {
                if case .unauthorized = apiError {
                    return
                }
                lastError = apiError.localizedDescription
            } catch {
                lastError = error.localizedDescription
            }

            if attempt >= 3 {
                let message = lastError ?? "Unable to reach our authentication service. Please retry or sign in again."
                errorMessage = message
                onFatalAuthError?(message)
            }
        }
    }

    func magicPlay() {
        if audioManager.isPlaying {
            audioManager.pause()
            return
        }
        if let current = audioManager.currentEpisode {
            audioManager.resume()
        } else if let latestEpisode {
            audioManager.play(episode: latestEpisode)
        }
    }
}
