import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var autoPlayLatest: Bool
    @Published var resumeLast: Bool

    private let appViewModel: AppViewModel
    private let defaults = UserDefaults.standard

    init(appViewModel: AppViewModel) {
        self.appViewModel = appViewModel
        autoPlayLatest = defaults.bool(forKey: "autoPlayLatest")
        resumeLast = defaults.bool(forKey: "resumeLast")
    }

    func save() {
        defaults.set(autoPlayLatest, forKey: "autoPlayLatest")
        defaults.set(resumeLast, forKey: "resumeLast")
    }

    func logout() {
        appViewModel.logout()
    }
}
