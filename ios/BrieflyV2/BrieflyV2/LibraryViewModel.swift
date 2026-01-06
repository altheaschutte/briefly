import Combine
import Foundation

@MainActor
final class LibraryViewModel: ObservableObject {
    @Published var episodes: [Episode] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let service: EpisodeService
    private let appViewModel: AppViewModel

    init(appViewModel: AppViewModel) {
        self.appViewModel = appViewModel
        self.service = EpisodeService(baseURL: APIConfig.baseURL) {
            appViewModel.authManager.currentToken?.accessToken
        }
    }

    func load(force: Bool = false) async {
        guard isLoading == false else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let fetched = try await service.fetchEpisodes()
            let sorted = fetched.sorted { lhs, rhs in
                let lhsDate = lhs.publishedAt ?? .distantPast
                let rhsDate = rhs.publishedAt ?? .distantPast
                return lhsDate > rhsDate
            }
            episodes = sorted
            await appViewModel.audioPlayer.restoreSession(with: sorted)
        } catch {
            errorMessage = "Couldn't load episodes. \(error.localizedDescription)"
        }
    }

    var inProgressEpisode: Episode? {
        episodes.first { episode in
            guard let status = episode.status?.lowercased() else { return false }
            return status != "ready" && status != "published" && status != "completed"
        }
    }

    var latestEpisode: Episode? {
        episodes.first
    }
}
