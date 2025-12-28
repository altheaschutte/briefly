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
    @Published var notificationsEnabled: Bool = false
    @Published var schedules: [Schedule] = []
    @Published var scheduleError: String?
    @Published var isLoadingSchedules: Bool = false

    private let appViewModel: AppViewModel
    private weak var audioManager: AudioPlayerManager?
    private let defaults = UserDefaults.standard
    private var targetPreference = TargetDurationPreference()
    private let scheduleService: ScheduleService
    private var hasLoadedSchedulesOnce: Bool

    init(appViewModel: AppViewModel,
         audioManager: AudioPlayerManager,
         initialEntitlements: Entitlements? = nil,
         initialSchedules: [Schedule] = []) {
        self.appViewModel = appViewModel
        self.audioManager = audioManager
        self.scheduleService = appViewModel.scheduleService
        let savedSpeed = defaults.double(forKey: "playbackSpeed")
        let initialSpeed = savedSpeed == 0 ? 1.0 : savedSpeed
        autoPlayLatest = defaults.bool(forKey: "autoPlayLatest")
        resumeLast = defaults.bool(forKey: "resumeLast")
        targetDurationMinutes = targetPreference.value
        playbackSpeed = initialSpeed
        audioManager.setPlaybackSpeed(initialSpeed)
        entitlements = initialEntitlements
        let sortedSchedules = initialSchedules.sorted { $0.localTimeMinutes < $1.localTimeMinutes }
        schedules = sortedSchedules
        hasLoadedSchedulesOnce = sortedSchedules.isEmpty == false
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

    func refreshNotificationSettings(pushManager: PushNotificationManager) async {
        let isAuthorized = await pushManager.isSystemAuthorizedForPush()
        notificationsEnabled = isAuthorized && pushManager.userPreferenceAllowsNotifications
    }

    func setNotificationsEnabled(_ isEnabled: Bool, pushManager: PushNotificationManager) async {
        if isEnabled {
            pushManager.userPreferenceAllowsNotifications = true
            await pushManager.registerForPushNotifications()
        } else {
            await pushManager.disablePushNotifications()
        }

        await refreshNotificationSettings(pushManager: pushManager)
    }

    func refreshSchedules(showLoading: Bool = true) async {
        let shouldShowLoading = showLoading || (schedules.isEmpty && !hasLoadedSchedulesOnce)
        isLoadingSchedules = shouldShowLoading
        defer { isLoadingSchedules = false }
        do {
            schedules = try await scheduleService.listSchedules().sorted { $0.localTimeMinutes < $1.localTimeMinutes }
            scheduleError = nil
            hasLoadedSchedulesOnce = true
        } catch {
            scheduleError = error.localizedDescription
        }
    }

    func saveSchedule(id: String?,
                      frequency: ScheduleFrequency,
                      localTimeMinutes: Int,
                      timezone: String) async {
        do {
            let schedule: Schedule
            if let id {
                schedule = try await scheduleService.updateSchedule(
                    id: id,
                    localTimeMinutes: localTimeMinutes,
                    frequency: frequency,
                    timezone: timezone,
                    isActive: true
                )
            } else {
                schedule = try await scheduleService.createSchedule(
                    localTimeMinutes: localTimeMinutes,
                    frequency: frequency,
                    timezone: timezone
                )
            }
            schedules = merge(schedule, into: schedules)
            scheduleError = nil
            await refreshPlanAndSchedules(showScheduleLoading: false)
        } catch {
            scheduleError = error.localizedDescription
        }
    }

    func toggleSchedule(_ schedule: Schedule, isActive: Bool) async {
        do {
            let updated = try await scheduleService.updateSchedule(
                id: schedule.id,
                localTimeMinutes: nil,
                frequency: nil,
                timezone: nil,
                isActive: isActive
            )
            schedules = merge(updated, into: schedules)
            await refreshPlanAndSchedules(showScheduleLoading: false)
        } catch {
            scheduleError = error.localizedDescription
        }
    }

    func deleteSchedule(_ schedule: Schedule) async {
        do {
            try await scheduleService.deleteSchedule(id: schedule.id)
            schedules.removeAll { $0.id == schedule.id }
            await refreshPlanAndSchedules(showScheduleLoading: false)
        } catch {
            scheduleError = error.localizedDescription
        }
    }

    func refreshAll(pushManager: PushNotificationManager, showScheduleLoading: Bool) async {
        async let entitlementsTask = refreshEntitlements()
        async let notificationsTask = refreshNotificationSettings(pushManager: pushManager)
        async let schedulesTask = refreshSchedules(showLoading: showScheduleLoading)
        _ = await (entitlementsTask, notificationsTask, schedulesTask)
    }

    func refreshPlanAndSchedules(showScheduleLoading: Bool) async {
        async let entitlementsTask = refreshEntitlements()
        async let schedulesTask = refreshSchedules(showLoading: showScheduleLoading)
        _ = await (entitlementsTask, schedulesTask)
    }

    func refreshOnAppear(pushManager: PushNotificationManager) async {
        await refreshAll(pushManager: pushManager, showScheduleLoading: schedules.isEmpty)
    }

    func formattedTime(from minutes: Int) -> String {
        let hour = minutes / 60
        let minute = minutes % 60
        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        let calendar = Calendar.current
        let date = calendar.date(from: components) ?? Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    func localTimeMinutes(from date: Date) -> Int {
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        let hour = components.hour ?? 0
        let minute = components.minute ?? 0
        return hour * 60 + minute
    }

    private func merge(_ schedule: Schedule, into existing: [Schedule]) -> [Schedule] {
        var next = existing
        if let idx = next.firstIndex(where: { $0.id == schedule.id }) {
            next[idx] = schedule
        } else {
            next.append(schedule)
        }
        return next.sorted { $0.localTimeMinutes < $1.localTimeMinutes }
    }
}
