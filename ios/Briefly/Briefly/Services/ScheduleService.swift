import Foundation

final class ScheduleService {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func listSchedules() async throws -> [Schedule] {
        let endpoint = APIEndpoint(path: "/schedules", method: .get)
        return try await apiClient.request(endpoint)
    }

    func createSchedule(localTimeMinutes: Int,
                        frequency: ScheduleFrequency,
                        timezone: String,
                        targetDurationMinutes: Int? = nil) async throws -> Schedule {
        let body: [String: AnyEncodable] = [
            "local_time_minutes": AnyEncodable(localTimeMinutes),
            "frequency": AnyEncodable(frequency.rawValue),
            "timezone": AnyEncodable(timezone),
            "target_duration_minutes": AnyEncodable(targetDurationMinutes)
        ]
        let endpoint = APIEndpoint(path: "/schedules", method: .post, body: AnyEncodable(body))
        return try await apiClient.request(endpoint)
    }

    func updateSchedule(id: String,
                        localTimeMinutes: Int?,
                        frequency: ScheduleFrequency?,
                        timezone: String?,
                        isActive: Bool?,
                        targetDurationMinutes: Int? = nil) async throws -> Schedule {
        var body: [String: AnyEncodable] = [:]
        if let localTimeMinutes {
            body["local_time_minutes"] = AnyEncodable(localTimeMinutes)
        }
        if let frequency {
            body["frequency"] = AnyEncodable(frequency.rawValue)
        }
        if let timezone {
            body["timezone"] = AnyEncodable(timezone)
        }
        if let isActive {
            body["is_active"] = AnyEncodable(isActive)
        }
        if let targetDurationMinutes {
            body["target_duration_minutes"] = AnyEncodable(targetDurationMinutes)
        }
        let endpoint = APIEndpoint(path: "/schedules/\(id)", method: .patch, body: AnyEncodable(body))
        return try await apiClient.request(endpoint)
    }

    func deleteSchedule(id: String) async throws {
        let endpoint = APIEndpoint(path: "/schedules/\(id)", method: .delete)
        try await apiClient.requestVoid(endpoint)
    }

    func listRuns(scheduleId: String) async throws -> [ScheduleRun] {
        let endpoint = APIEndpoint(path: "/schedules/\(scheduleId)/runs", method: .get)
        return try await apiClient.request(endpoint)
    }

    func bootstrap(timezone: String, localTimeMinutes: Int) async throws -> [Schedule] {
        let body: [String: AnyEncodable] = [
            "timezone": AnyEncodable(timezone),
            "local_time_minutes": AnyEncodable(localTimeMinutes)
        ]
        let endpoint = APIEndpoint(path: "/schedules/bootstrap", method: .post, body: AnyEncodable(body))
        return try await apiClient.request(endpoint)
    }

    func completeOnboarding(timezone: String,
                            localTimeMinutes: Int,
                            frequency: ScheduleFrequency = .daily) async throws -> Schedule {
        let body: [String: AnyEncodable] = [
            "timezone": AnyEncodable(timezone),
            "local_time_minutes": AnyEncodable(localTimeMinutes),
            "frequency": AnyEncodable(frequency.rawValue)
        ]
        let endpoint = APIEndpoint(path: "/onboarding/complete", method: .post, body: AnyEncodable(body))
        struct Response: Decodable {
            let schedule: Schedule?
        }
        let response: Response = try await apiClient.request(endpoint)
        if let schedule = response.schedule {
            return schedule
        }
        throw APIError.invalidResponse
    }

    func updateTimezone(_ timezone: String) async throws {
        let endpoint = APIEndpoint(path: "/me/profile",
                                   method: .patch,
                                   body: AnyEncodable(["timezone": AnyEncodable(timezone)]))
        _ = try await apiClient.requestData(endpoint)
    }
}
