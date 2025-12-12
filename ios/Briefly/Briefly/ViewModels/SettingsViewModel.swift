import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var autoPlayLatest: Bool
    @Published var resumeLast: Bool
    @Published var playbackSpeed: Double {
        didSet {
            audioManager?.setPlaybackSpeed(playbackSpeed)
        }
    }

    private let appViewModel: AppViewModel
    private weak var audioManager: AudioPlayerManager?
    private let defaults = UserDefaults.standard

    init(appViewModel: AppViewModel, audioManager: AudioPlayerManager) {
        self.appViewModel = appViewModel
        self.audioManager = audioManager
        autoPlayLatest = defaults.bool(forKey: "autoPlayLatest")
        resumeLast = defaults.bool(forKey: "resumeLast")
        let savedSpeed = defaults.double(forKey: "playbackSpeed")
        playbackSpeed = savedSpeed == 0 ? 1.0 : savedSpeed
        audioManager.setPlaybackSpeed(playbackSpeed)
    }

    func save() {
        defaults.set(autoPlayLatest, forKey: "autoPlayLatest")
        defaults.set(resumeLast, forKey: "resumeLast")
        defaults.set(playbackSpeed, forKey: "playbackSpeed")
    }

    func logout() {
        appViewModel.logout()
    }
}
