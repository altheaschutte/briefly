import Foundation

struct Entitlements: Codable {
    struct Limits: Codable {
        let minutesPerMonth: Int?
        let maxActiveTopics: Int
        let maxEpisodeMinutes: Int
        let scheduleEnabled: Bool
    }

    let tier: String
    let status: String
    let limits: Limits
    let periodStart: Date?
    let periodEnd: Date?
    let secondsUsed: Double?
    let secondsLimit: Double?
    let secondsRemaining: Double?
    let cancelAtPeriodEnd: Bool?

    var usedMinutes: Int {
        guard let secondsUsed else { return 0 }
        return Int(secondsUsed / 60)
    }

    var limitMinutes: Int? {
        guard let secondsLimit else { return nil }
        return Int(secondsLimit / 60)
    }

    var remainingMinutes: Int? {
        guard let secondsRemaining else { return nil }
        return Int(max(0, secondsRemaining) / 60)
    }

    var isGenerationUsageExhausted: Bool {
        guard let secondsRemaining else { return false }
        return secondsRemaining <= 0
    }
}
