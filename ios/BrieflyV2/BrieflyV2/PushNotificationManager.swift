import Combine
import Foundation
import os.log
import UserNotifications
#if os(iOS)
import UIKit
#endif

private struct NotificationPreference {
    private let storageKey = "notifications_enabled_preference"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var value: Bool {
        get {
            guard defaults.object(forKey: storageKey) != nil else { return true }
            return defaults.bool(forKey: storageKey)
        }
        set {
            defaults.set(newValue, forKey: storageKey)
        }
    }
}

@MainActor
final class PushNotificationManager: NSObject, ObservableObject {
    private let notificationService: NotificationService
    private let log = OSLog(subsystem: "com.briefly.brieflyv2", category: "Push")
    private let storedTokenKey = "push_device_token"
    private var notificationPreference = NotificationPreference()

    @Published var userPreferenceAllowsNotifications: Bool {
        didSet { notificationPreference.value = userPreferenceAllowsNotifications }
    }

    init(notificationService: NotificationService) {
        self.notificationService = notificationService
        userPreferenceAllowsNotifications = notificationPreference.value
        super.init()
    }

    func registerForPushNotifications() async {
        guard userPreferenceAllowsNotifications else {
            os_log("Push registration skipped; user disabled notifications in settings", log: log, type: .info)
            return
        }

        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()

        let needsAuthorizationRequest: Bool
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            needsAuthorizationRequest = false
        case .notDetermined, .denied:
            needsAuthorizationRequest = true
        @unknown default:
            needsAuthorizationRequest = true
        }

        if needsAuthorizationRequest {
            do {
                let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
                userPreferenceAllowsNotifications = granted
                guard granted else {
                    os_log("Push permission not granted", log: log, type: .info)
                    return
                }
            } catch {
                os_log("Push permission request failed: %{public}@", log: log, type: .error, error.localizedDescription)
                return
            }
        } else {
            userPreferenceAllowsNotifications = true
        }

        #if os(iOS)
        UIApplication.shared.registerForRemoteNotifications()
        #endif
    }

    func isSystemAuthorizedForPush() async -> Bool {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        default:
            return false
        }
    }

    func disablePushNotifications() async {
        userPreferenceAllowsNotifications = false
        await unregisterCurrentDevice()
        #if os(iOS)
        UIApplication.shared.unregisterForRemoteNotifications()
        #endif
    }

    func unregisterCurrentDevice() async {
        guard let token = storedToken else { return }
        do {
            try await notificationService.unregisterDevice(token: token)
            storedToken = nil
        } catch {
            os_log("Failed to unregister device token: %{public}@", log: log, type: .error, error.localizedDescription)
        }
    }

    func didRegisterForRemoteNotifications(deviceToken: Data) {
        guard userPreferenceAllowsNotifications else { return }
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await registerDeviceTokenWithBackend(token) }
    }

    func didFailToRegister(error: Error) {
        os_log("Remote notification registration failed: %{public}@", log: log, type: .error, error.localizedDescription)
    }

    func registerDeviceTokenWithBackend(_ token: String) async {
        guard token.isEmpty == false else { return }
        guard userPreferenceAllowsNotifications else { return }
        do {
            try await notificationService.registerDevice(token: token, platform: "ios")
            storedToken = token
        } catch {
            os_log("Register device token failed: %{public}@", log: log, type: .error, error.localizedDescription)
        }
    }

    private var storedToken: String? {
        get { UserDefaults.standard.string(forKey: storedTokenKey) }
        set { UserDefaults.standard.setValue(newValue, forKey: storedTokenKey) }
    }
}

extension PushNotificationManager: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }
}
