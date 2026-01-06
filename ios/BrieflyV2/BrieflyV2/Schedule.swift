import Foundation

enum ScheduleFrequency: String, Codable, CaseIterable, Identifiable {
    case daily
    case every2Days = "every_2_days"
    case every3Days = "every_3_days"
    case every4Days = "every_4_days"
    case every5Days = "every_5_days"
    case every6Days = "every_6_days"
    case weekly

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .daily: return "Daily"
        case .every2Days: return "Every 2 days"
        case .every3Days: return "Every 3 days"
        case .every4Days: return "Every 4 days"
        case .every5Days: return "Every 5 days"
        case .every6Days: return "Every 6 days"
        case .weekly: return "Weekly"
        }
    }
}

enum ScheduleRunStatus: String, Codable {
    case queued
    case success
    case skipped
    case failed

    var displayName: String {
        switch self {
        case .queued: return "Queued"
        case .success: return "Success"
        case .skipped: return "Skipped"
        case .failed: return "Failed"
        }
    }
}

struct Schedule: Codable, Identifiable {
    let id: String
    let frequency: ScheduleFrequency
    let localTimeMinutes: Int
    let timezone: String
    let isActive: Bool
    let nextRunAt: Date?
    let lastRunAt: Date?
    let lastStatus: ScheduleRunStatus?
    let lastError: String?
    let targetDurationMinutes: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case frequency
        case localTimeMinutes = "local_time_minutes"
        case timezone
        case isActive = "is_active"
        case nextRunAt = "next_run_at"
        case lastRunAt = "last_run_at"
        case lastStatus = "last_status"
        case lastError = "last_error"
        case targetDurationMinutes = "target_duration_minutes"
    }
}

struct ScheduleRun: Codable, Identifiable {
    let id: String
    let scheduleId: String
    let userId: String
    let runAt: Date
    let status: ScheduleRunStatus
    let message: String?
    let episodeId: String?
    let durationSeconds: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case scheduleId = "schedule_id"
        case userId = "user_id"
        case runAt = "run_at"
        case status
        case message
        case episodeId = "episode_id"
        case durationSeconds = "duration_seconds"
    }
}
