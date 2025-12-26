import Foundation

struct TargetDurationPreference {
    static let defaultMinutes = 15
    static let allowedOptions: [Int] = [10, 15, 20, 25, 30, 35]
    private static let storageKey = "targetDurationMinutes"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var value: Int {
        get {
            let stored = defaults.integer(forKey: Self.storageKey)
            return stored == 0 ? Self.defaultMinutes : stored
        }
        set {
            defaults.set(newValue, forKey: Self.storageKey)
        }
    }

    func options(maxMinutes: Int?) -> [Int] {
        guard let maxMinutes else { return Self.allowedOptions }
        let filtered = Self.allowedOptions.filter { $0 <= maxMinutes }
        if filtered.isEmpty {
            return [maxMinutes]
        }
        return filtered
    }
}

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var autoPlayLatest: Bool
    @Published var resumeLast: Bool
    @Published var playbackSpeed: Double {
        didSet {
            audioManager?.setPlaybackSpeed(playbackSpeed)
        }
    }
    @Published var entitlements: Entitlements?
    @Published var targetDurationMinutes: Int {
        didSet {
            targetPreference.value = targetDurationMinutes
        }
    }

    private let appViewModel: AppViewModel
    private weak var audioManager: AudioPlayerManager?
    private let defaults = UserDefaults.standard
    private var targetPreference = TargetDurationPreference()

    init(appViewModel: AppViewModel, audioManager: AudioPlayerManager) {
        self.appViewModel = appViewModel
        self.audioManager = audioManager
        let savedSpeed = defaults.double(forKey: "playbackSpeed")
        let initialSpeed = savedSpeed == 0 ? 1.0 : savedSpeed
        autoPlayLatest = defaults.bool(forKey: "autoPlayLatest")
        resumeLast = defaults.bool(forKey: "resumeLast")
        targetDurationMinutes = targetPreference.value
        playbackSpeed = initialSpeed
        audioManager.setPlaybackSpeed(initialSpeed)
    }

    func save() {
        defaults.set(autoPlayLatest, forKey: "autoPlayLatest")
        defaults.set(resumeLast, forKey: "resumeLast")
        defaults.set(playbackSpeed, forKey: "playbackSpeed")
        defaults.set(targetDurationMinutes, forKey: "targetDurationMinutes")
    }

    func refreshEntitlements() async {
        do {
            entitlements = try await appViewModel.entitlementsService.fetchEntitlements()
            clampTargetDurationIfNeeded()
        } catch {
            // Ignore failures; UI falls back to defaults.
        }
    }

    func logout() {
        Task { await appViewModel.logout() }
    }

    var durationOptions: [Int] {
        targetPreference.options(maxMinutes: entitlements?.limits.maxEpisodeMinutes)
    }

    private func clampTargetDurationIfNeeded() {
        guard entitlements?.limits.maxEpisodeMinutes != nil else { return }
        let options = durationOptions
        guard !options.isEmpty else { return }
        if !options.contains(targetDurationMinutes) {
            targetDurationMinutes = options.last ?? targetDurationMinutes
        }
    }
}
