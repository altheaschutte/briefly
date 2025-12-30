import SwiftUI

extension Color {
    // Core palette (dark-mode only)
    static let brieflyBackground = Color(hex: 0x132A3B)
    static let brieflySurface = Color(hex: 0x1F3A4E)

    // Accents
    static let brieflyPrimary = Color(hex: 0xFFA563) // brightest CTA accent, white text on top
    static let brieflySecondary = Color(hex: 0x37A8AE) // secondary accent for buttons and chips
    static let brieflyAccentStrong = Color(hex: 0x2A7997)
    static let brieflyAccentSoft = Color(hex: 0x93C8C2)

    // UI helpers
    static let brieflyDurationBackground = Color(hex: 0x2A7997, alpha: 0.3)
    static let brieflyListenedBackground = Color(hex: 0xFFA563, alpha: 0.3)
    static let brieflyTextMuted = Color.white.opacity(0.78)
    static let brieflyBorder = Color.white.opacity(0.12)
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
