//
//  BrieflyV2App.swift
//  BrieflyV2
//
//  Created by Balaji Venkatesh on 20/06/25.
//

import SwiftUI
import UIKit
import UserNotifications

@main
struct BrieflyV2App: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var appViewModel: AppViewModel
    @StateObject private var pushManager: PushNotificationManager

    init() {
        let viewModel = AppViewModel()
        _appViewModel = StateObject(wrappedValue: viewModel)
        _pushManager = StateObject(wrappedValue: viewModel.pushManager)
        AppDelegate.pushManager = viewModel.pushManager
        configureTabBarAppearance()
        UNUserNotificationCenter.current().delegate = viewModel.pushManager
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appViewModel)
                .environmentObject(appViewModel.audioPlayer)
                .environmentObject(appViewModel.playbackHistory)
                .environmentObject(pushManager)
        }
    }

    private func configureTabBarAppearance() {
        let activeColor = UIColor(Color.brieflyTabBarActive)
        let inactiveColor = UIColor(Color.brieflyTabBarInactive)

        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()

        [
            appearance.stackedLayoutAppearance,
            appearance.inlineLayoutAppearance,
            appearance.compactInlineLayoutAppearance
        ].forEach { itemAppearance in
            itemAppearance.normal.iconColor = inactiveColor
            itemAppearance.normal.titleTextAttributes = [.foregroundColor: inactiveColor]
            itemAppearance.selected.iconColor = activeColor
            itemAppearance.selected.titleTextAttributes = [.foregroundColor: activeColor]
        }

        UITabBar.appearance().standardAppearance = appearance
        if #available(iOS 15.0, *) {
            UITabBar.appearance().scrollEdgeAppearance = appearance
        }
        UITabBar.appearance().tintColor = activeColor
        UITabBar.appearance().unselectedItemTintColor = inactiveColor
    }
}
