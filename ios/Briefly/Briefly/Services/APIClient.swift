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
    private let session: URLSession

    init(baseURL: URL, session: URLSession = .shared, tokenProvider: (() -> String?)? = nil) {
        self.baseURL = baseURL
        self.session = session
        self.tokenProvider = tokenProvider
    }

    func request<T: Decodable>(_ endpoint: APIEndpoint, decoder: JSONDecoder = JSONDecoder()) async throws -> T {
        decoder.dateDecodingStrategy = .iso8601
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

        switch httpResponse.statusCode {
        case 200..<300:
            return data
        case 401:
            throw APIError.unauthorized
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
}
