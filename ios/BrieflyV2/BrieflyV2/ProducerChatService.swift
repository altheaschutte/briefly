import Foundation

struct ProducerStreamEvent {
    enum Kind {
        case delta(String)
        case thread(String)
    }
    let kind: Kind
}

struct ProducerChatService {
    let baseURL: URL
    var tokenProvider: (() -> String?)?

    func stream(
        userMessage: String,
        threadId: String?,
        messages: [ChatMessage]
    ) -> AsyncThrowingStream<ProducerStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    var request = URLRequest(url: baseURL.appendingPathComponent("/producer/chat/stream"))
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    if let token = tokenProvider?(), token.isEmpty == false {
                        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                    }

                    let payload: [String: Any] = [
                        "userMessage": userMessage,
                        "threadId": threadId as Any,
                        "messages": messages.map { ["role": $0.role == .user ? "user" : "assistant", "content": $0.text] }
                    ].compactMapValues { $0 }

                    request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    if let http = response as? HTTPURLResponse,
                       let threadHeader = http.value(forHTTPHeaderField: "x-thread-id"),
                       threadHeader.isEmpty == false {
                        continuation.yield(.init(kind: .thread(threadHeader)))
                    }

                    for try await line in bytes.lines {
                        guard line.hasPrefix("data:") else { continue }
                        let dataLine = line.dropFirst("data:".count).trimmingCharacters(in: .whitespaces)
                        if dataLine.isEmpty || dataLine == "[DONE]" { continue }
                        if let jsonData = dataLine.data(using: .utf8),
                           let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
                            if let type = json["type"] as? String {
                                switch type {
                                case "text-delta", "text":
                                    if let text = json["text"] as? String {
                                        continuation.yield(.init(kind: .delta(text)))
                                    }
                                case "message":
                                    if let message = json["message"] as? [String: Any],
                                       let content = message["content"] as? String {
                                        continuation.yield(.init(kind: .delta(content)))
                                    }
                                default:
                                    break
                                }
                            }
                        } else {
                            // Fallback: treat raw line as text
                            continuation.yield(.init(kind: .delta(dataLine)))
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }
}
