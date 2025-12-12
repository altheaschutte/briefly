import Foundation
import AVFoundation

struct OnboardingCompletion: Equatable {
    let transcript: String
    let topics: [String]
    let createdTopicIds: [UUID]
}

@MainActor
final class OnboardingVoiceService: NSObject, ObservableObject {
    @Published var transcript: String = ""
    @Published var isRecording: Bool = false
    @Published var isUploading: Bool = false
    @Published var errorMessage: String?
    @Published var completion: OnboardingCompletion?

    private let streamURL: URL
    private let tokenProvider: () -> String?
    private var recorder: AVAudioRecorder?
    private var uploadTask: URLSessionUploadTask?
    private var session: URLSession?
    private var incomingBuffer = Data()
    private var currentRecordingURL: URL?

    init(streamURL: URL, tokenProvider: @escaping () -> String?) {
        self.streamURL = streamURL
        self.tokenProvider = tokenProvider
    }

    func startRecording() async {
        resetState()
        do {
            try await requestPermission()
            try configureSession()
            let url = try startRecorder()
            currentRecordingURL = url
            isRecording = true
        } catch {
            errorMessage = error.localizedDescription
            stopRecording()
        }
    }

    func stopRecording() {
        guard isRecording else { return }
        recorder?.stop()
        recorder = nil
        isRecording = false
        if let fileURL = currentRecordingURL {
            uploadRecording(fileURL)
        }
    }

    func clearTranscript() {
        transcript = ""
        completion = nil
        errorMessage = nil
    }

    // MARK: - Recording

    private func requestPermission() async throws {
        let granted = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { allowed in
                continuation.resume(returning: allowed)
            }
        }
        guard granted else {
            throw NSError(domain: "OnboardingVoiceService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Microphone access is required."])
        }
    }

    private func configureSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true)
    }

    private func startRecorder() throws -> URL {
        let filename = "onboarding-\(UUID().uuidString).m4a"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder?.prepareToRecord()
        recorder?.record()
        return url
    }

    // MARK: - Upload + SSE

    private func uploadRecording(_ fileURL: URL) {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            errorMessage = "No recording found to upload."
            return
        }
        var request = URLRequest(url: streamURL)
        request.httpMethod = "POST"
        request.setValue("audio/m4a", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let token = tokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 300
        configuration.timeoutIntervalForResource = 300
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        self.session = session

        isUploading = true
        incomingBuffer = Data()
        uploadTask = session.uploadTask(with: request, fromFile: fileURL)
        uploadTask?.resume()
    }

    private func resetState() {
        transcript = ""
        completion = nil
        errorMessage = nil
        isRecording = false
        isUploading = false
        incomingBuffer = Data()
        currentRecordingURL = nil
        uploadTask?.cancel()
        uploadTask = nil
        session?.invalidateAndCancel()
        session = nil
    }
}

// MARK: - URLSessionDataDelegate

extension OnboardingVoiceService: URLSessionDataDelegate {
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        incomingBuffer.append(data)
        processBuffer()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        isUploading = false
        if let error {
            errorMessage = error.localizedDescription
        }
        if let url = currentRecordingURL {
            try? FileManager.default.removeItem(at: url)
        }
        currentRecordingURL = nil
    }

    private func processBuffer() {
        let separator = Data("\n\n".utf8)
        while let range = incomingBuffer.range(of: separator) {
            let chunk = incomingBuffer.subdata(in: 0..<range.lowerBound)
            incomingBuffer.removeSubrange(0..<range.upperBound)
            handleEventChunk(chunk)
        }
    }

    private func handleEventChunk(_ data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        var eventName: String = "message"
        var dataLines: [String] = []

        text.split(separator: "\n").forEach { line in
            if line.hasPrefix("event:") {
                eventName = line.replacingOccurrences(of: "event:", with: "").trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(line.replacingOccurrences(of: "data:", with: "").trimmingCharacters(in: .whitespaces))
            }
        }

        let payload = dataLines.joined(separator: "\n")
        switch eventName {
        case "transcript":
            if let data = payload.data(using: .utf8),
               let message = try? JSONDecoder().decode(TranscriptMessage.self, from: data) {
                transcript = message.transcript
            } else if payload.isEmpty == false {
                transcript = payload
            }
        case "session":
            break
        case "completed":
            handleCompletion(payload: payload)
        case "error":
            errorMessage = payload.isEmpty ? "Transcription failed." : payload
        default:
            if payload.isEmpty == false {
                transcript = payload
            }
        }
    }

    private func handleCompletion(payload: String) {
        guard let data = payload.data(using: .utf8),
              let message = try? JSONDecoder().decode(CompletionMessage.self, from: data) else {
            return
        }
        isUploading = false
        transcript = message.transcript
        let ids = message.createdTopicIds.compactMap { UUID(uuidString: $0) }
        let result = OnboardingCompletion(transcript: message.transcript, topics: message.topics, createdTopicIds: ids)
        completion = result
    }
}

// MARK: - DTOs

private struct TranscriptMessage: Decodable {
    let sessionId: String?
    let transcript: String

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case transcript
    }
}

private struct CompletionMessage: Decodable {
    let sessionId: String?
    let transcript: String
    let topics: [String]
    let createdTopicIds: [String]

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case transcript
        case topics
        case createdTopicIds = "created_topic_ids"
    }
}
