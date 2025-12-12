import Foundation

@MainActor
final class HomeViewModel: ObservableObject {
    @Published var latestEpisode: Episode?
    @Published var errorMessage: String?
    @Published var isLoading: Bool = false

    private let episodeService: EpisodeProviding
    private let audioManager: AudioPlayerManager

    init(episodeService: EpisodeProviding, audioManager: AudioPlayerManager) {
        self.episodeService = episodeService
        self.audioManager = audioManager
    }

    func loadLatest() async {
        isLoading = true
        defer { isLoading = false }
        do {
            latestEpisode = try await episodeService.fetchLatestEpisode()
        } catch {
            errorMessage = error.localizedDescription
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
