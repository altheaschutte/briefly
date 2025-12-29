import Foundation

struct APIEndpoint {
    let path: String
    let method: HTTPMethod
    var queryItems: [URLQueryItem]? = nil
    var body: AnyEncodable? = nil
    var headers: [String: String] = [:]
    var requiresAuth: Bool = true
}

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case patch = "PATCH"
}

enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case statusCode(Int)
    case decoding(Error)
    case unauthorized
    case unknown

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "The endpoint URL is invalid."
        case .invalidResponse:
            return "The server response was not valid."
        case .statusCode(let code):
            return "Request failed with status code \(code)."
        case .decoding(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .unauthorized:
            return "You need to log in again."
        case .unknown:
            return "Something went wrong. Please try again."
        }
    }
}

struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void

    init<T: Encodable>(_ value: T) {
        encodeFunc = value.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}

final class APIClient {
    let baseURL: URL
    var tokenProvider: (() -> String?)?
    var unauthorizedHandler: ((String?) -> Void)?
    private let session: URLSession

    init(baseURL: URL, session: URLSession = .shared, tokenProvider: (() -> String?)? = nil) {
        self.baseURL = baseURL
        self.session = session
        self.tokenProvider = tokenProvider
    }

    func request<T: Decodable>(_ endpoint: APIEndpoint, decoder: JSONDecoder = JSONDecoder()) async throws -> T {
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)

            if let date = APIClient.iso8601WithFractionalSeconds.date(from: string) {
                return date
            }
            if let date = APIClient.iso8601Basic.date(from: string) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid date format: \(string)",
            )
        }
        let data = try await requestData(endpoint)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func requestData(_ endpoint: APIEndpoint) async throws -> Data {
        let request = try buildRequest(from: endpoint)
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        let errorMessage = APIClient.extractErrorMessage(from: data)

        switch httpResponse.statusCode {
        case 200..<300:
            return data
        case 401:
            unauthorizedHandler?(errorMessage)
            throw APIError.unauthorized
        case 503 where errorMessage?.lowercased().contains("authentication service") == true:
            unauthorizedHandler?(errorMessage)
            throw APIError.statusCode(httpResponse.statusCode)
        default:
            throw APIError.statusCode(httpResponse.statusCode)
        }
    }

    func requestVoid(_ endpoint: APIEndpoint) async throws {
        _ = try await requestData(endpoint)
    }

    private func buildRequest(from endpoint: APIEndpoint) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(endpoint.path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL
        }
        components.queryItems = endpoint.queryItems
        guard let url = components.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        endpoint.headers.forEach { key, value in
            request.setValue(value, forHTTPHeaderField: key)
        }

        if endpoint.requiresAuth, let token = tokenProvider?() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = endpoint.body {
            request.httpBody = try JSONEncoder().encode(body)
        }

        return request
    }

    private static func extractErrorMessage(from data: Data) -> String? {
        guard data.isEmpty == false else { return nil }
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let message = json["message"] as? String ?? json["error"] as? String {
            return message
        }
        if let string = String(data: data, encoding: .utf8), string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
            return string
        }
        return nil
    }
}

private extension APIClient {
    static let iso8601Basic: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
