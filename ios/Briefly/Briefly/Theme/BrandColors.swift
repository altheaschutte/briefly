import SwiftUI

extension Color {
    // Raw palette
    static let warmGrey = Color(hex: 0xF3EFEA)
    static let mediumWarmGrey = Color(hex: 0xE2DFDB)
    static let darkerWarmGrey = Color(hex: 0x9F9A95)
    static let offBlack = Color(hex: 0x2E2E2E)
    static let gold = Color(hex: 0xA2845E)

    // Semantic surfaces
    static let brieflyBackground = Color.white
    static let brieflySurface = Color.warmGrey
    static let brieflyDarkSurface = Color(hex: 0x383838)
    static let brieflyDeepBackground = Color(hex: 0x282828)

    // Accent (gold)
    static let brieflyPrimary = Color.gold
    static let brieflySecondary = Color.offBlack
    static let brieflyAccentStrong = Color.gold
    static let brieflyAccentSoft = Color.gold

    // Text
    static let brieflyTextPrimary = Color.offBlack
    static let brieflyTextSecondary = Color(hex: 0x757575)
    static let brieflyTextMuted = Color(hex: 0x8A8A8E)

    // Borders + pills
    static let brieflyBorder = Color.mediumWarmGrey
    static let brieflyClassificationPillText = Color(hex: 0x858486)
    static let brieflyDurationBackground = Color.mediumWarmGrey
    static let brieflyListenedBackground = Color(hex: 0xA2845E, alpha: 0.18)
    static let brieflyProgressTrackBackground = Color(hex: 0xE9E9EA)

    // Tab bar
    static let brieflyTabBarBackground = Color.offBlack
    static let brieflyTabBarInactive = Color(hex: 0xB3B3B3)

    // Status
    static let brieflyDestructive = Color(hex: 0xC13232)
}

private extension Color {
    init(hex: Int, alpha: Double = 1.0) {
        let red = Double((hex >> 16) & 0xff) / 255.0
        let green = Double((hex >> 8) & 0xff) / 255.0
        let blue = Double(hex & 0xff) / 255.0
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}
