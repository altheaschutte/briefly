import Foundation
#if os(iOS)
import UIKit
import UserNotifications
#endif

#if os(iOS)
final class AppDelegate: NSObject, UIApplicationDelegate {
    static weak var pushManager: PushNotificationManager?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        BrieflyApp.configureAppearance()
        UNUserNotificationCenter.current().delegate = Self.pushManager
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Self.pushManager?.didRegisterForRemoteNotifications(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Self.pushManager?.didFailToRegister(error: error)
    }
}
#endif
