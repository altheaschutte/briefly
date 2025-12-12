import Foundation
import AVFoundation

@MainActor
final class OnboardingVoiceService: NSObject, ObservableObject {
    @Published var transcript: String = ""
    @Published var isRecording: Bool = false
    @Published var errorMessage: String?

    private let audioEngine = AVAudioEngine()
    private let audioSession = AVAudioSession.sharedInstance()
    private var websocketTask: URLSessionWebSocketTask?
    private let streamURL: URL
    private let decoder = JSONDecoder()

    init(streamURL: URL) {
        self.streamURL = streamURL
    }

    func startRecording() async {
        do {
            try await requestPermission()
            try configureSession()
            guard connectWebSocket() else {
                throw NSError(domain: "OnboardingVoiceService", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unable to connect to the voice service."])
            }
            try startEngine()
            isRecording = true
            listenForTranscription()
        } catch {
            errorMessage = error.localizedDescription
            stopRecording()
        }
    }

    func stopRecording() {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        websocketTask?.cancel(with: .goingAway, reason: nil)
        websocketTask = nil
        isRecording = false
    }

    func clearTranscript() {
        transcript = ""
    }

    private func requestPermission() async throws {
        let granted = await withCheckedContinuation { continuation in
            audioSession.requestRecordPermission { allowed in
                continuation.resume(returning: allowed)
            }
        }
        guard granted else { throw NSError(domain: "OnboardingVoiceService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Microphone access is required."]) }
    }

    private func configureSession() throws {
        try audioSession.setCategory(.record, mode: .spokenAudio, options: [.duckOthers])
        try audioSession.setActive(true)
    }

    private func connectWebSocket() -> Bool {
        guard let wsURL = webSocketURL(from: streamURL) else {
            errorMessage = "Invalid WebSocket URL"
            return false
        }
        let task = URLSession(configuration: .default).webSocketTask(with: wsURL)
        websocketTask = task
        task.resume()
        return true
    }

    private func startEngine() throws {
        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)

        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            if let data = self.pcmData(from: buffer) {
                let message = URLSessionWebSocketTask.Message.data(data)
                self.websocketTask?.send(message) { error in
                    if let error {
                        DispatchQueue.main.async {
                            self.errorMessage = error.localizedDescription
                            self.stopRecording()
                        }
                    }
                }
            }
        }

        audioEngine.prepare()
        try audioEngine.start()
    }

    private func listenForTranscription() {
        websocketTask?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                switch message {
                case .string(let string):
                    Task { @MainActor in
                        self.transcript = string
                    }
                case .data(let data):
                    if let text = self.decodeTranscript(from: data) {
                        Task { @MainActor in self.transcript = text }
                    }
                @unknown default:
                    break
                }
                self.listenForTranscription()
            case .failure(let error):
                Task { @MainActor in
                    self.errorMessage = error.localizedDescription
                    self.stopRecording()
                }
            }
        }
    }

    private func pcmData(from buffer: AVAudioPCMBuffer) -> Data? {
        guard let channelData = buffer.floatChannelData?[0] else { return nil }
        let frameLength = Int(buffer.frameLength)
        let bytes = UnsafeBufferPointer(start: channelData, count: frameLength)
        return Data(buffer: bytes)
    }

    private func decodeTranscript(from data: Data) -> String? {
        if let text = String(data: data, encoding: .utf8) {
            return text
        }
        struct TranscriptMessage: Decodable { let transcript: String }
        if let message = try? decoder.decode(TranscriptMessage.self, from: data) {
            return message.transcript
        }
        return nil
    }

    // WebSocket tasks must use ws/wss; convert from http/https if needed.
    private func webSocketURL(from url: URL) -> URL? {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }
        switch components.scheme?.lowercased() {
        case "http":
            components.scheme = "ws"
        case "https":
            components.scheme = "wss"
        case "ws", "wss":
            break
        default:
            return nil
        }
        return components.url
    }
}
