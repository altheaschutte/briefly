import Foundation
import os.log
import UserNotifications
#if os(iOS)
import UIKit
#endif

@MainActor
final class PushNotificationManager: NSObject, ObservableObject {
    private let notificationService: NotificationService
    private let log = OSLog(subsystem: "com.briefly.app", category: "Push")
    private let storedTokenKey = "push_device_token"

    init(notificationService: NotificationService) {
        self.notificationService = notificationService
    }

    func registerForPushNotifications() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()

        switch settings.authorizationStatus {
        case .notDetermined:
            do {
                let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
                guard granted else {
                    os_log("Push permission not granted", log: log, type: .info)
                    return
                }
            } catch {
                os_log("Push permission request failed: %{public}@", log: log, type: .error, error.localizedDescription)
                return
            }
        case .denied:
            os_log("Push permission denied", log: log, type: .info)
            return
        default:
            break
        }

        #if os(iOS)
        UIApplication.shared.registerForRemoteNotifications()
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
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await registerDeviceTokenWithBackend(token) }
    }

    func didFailToRegister(error: Error) {
        os_log("Remote notification registration failed: %{public}@", log: log, type: .error, error.localizedDescription)
    }

    func registerDeviceTokenWithBackend(_ token: String) async {
        guard token.isEmpty == false else { return }
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
