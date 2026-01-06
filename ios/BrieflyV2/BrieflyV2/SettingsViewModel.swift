import Combine
import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var autoPlayNextEpisode: Bool {
        didSet {
            playbackPreferences.autoPlayNextEpisode = autoPlayNextEpisode
        }
    }
    @Published var playbackSpeed: Double {
        didSet {
            audioManager?.setPlaybackSpeed(playbackSpeed)
            playbackPreferences.playbackSpeed = playbackSpeed
        }
    }
    @Published var entitlements: Entitlements?
    @Published var notificationsEnabled: Bool = false
    @Published var schedules: [Schedule] = []
    @Published var scheduleError: String?
    @Published var isLoadingSchedules: Bool = false

    private let appViewModel: AppViewModel
    private weak var audioManager: AudioPlayerManager?
    private let playbackPreferences = PlaybackPreferences()
    private let scheduleService: ScheduleService
    private let entitlementsService: EntitlementsService
    private var hasLoadedSchedulesOnce: Bool
    private var cancellables = Set<AnyCancellable>()

    init(appViewModel: AppViewModel,
         audioManager: AudioPlayerManager,
         initialEntitlements: Entitlements? = nil,
         initialSchedules: [Schedule] = []) {
        self.appViewModel = appViewModel
        self.audioManager = audioManager
        self.scheduleService = appViewModel.scheduleService
        self.entitlementsService = appViewModel.entitlementsService
        autoPlayNextEpisode = playbackPreferences.autoPlayNextEpisode
        let initialSpeed = playbackPreferences.playbackSpeed
        playbackSpeed = initialSpeed
        entitlements = initialEntitlements
        let sortedSchedules = initialSchedules.sorted { $0.localTimeMinutes < $1.localTimeMinutes }
        schedules = sortedSchedules
        hasLoadedSchedulesOnce = sortedSchedules.isEmpty == false
        audioManager.setPlaybackSpeed(initialSpeed)
        bindPlaybackSpeedUpdates()
    }

    func save() {
        playbackPreferences.autoPlayNextEpisode = autoPlayNextEpisode
        playbackPreferences.playbackSpeed = playbackSpeed
    }

    func refreshEntitlements() async {
        do {
            entitlements = try await entitlementsService.fetchEntitlements()
        } catch {
            // Allow UI to continue with last-known state.
        }
    }

    func logout() {
        Task { await appViewModel.logout() }
    }

    private func bindPlaybackSpeedUpdates() {
        audioManager?.$playbackSpeed
            .receive(on: DispatchQueue.main)
            .sink { [weak self] speed in
                guard let self else { return }
                guard abs(self.playbackSpeed - speed) > 0.0001 else { return }
                self.playbackSpeed = speed
            }
            .store(in: &cancellables)
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
