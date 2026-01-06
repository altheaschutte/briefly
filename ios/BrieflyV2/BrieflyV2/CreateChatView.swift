import SwiftUI
import Combine
import Speech
import AVFoundation

struct ChatMessage: Identifiable, Equatable {
    enum Role {
        case user
        case assistant
    }

    let id: UUID
    let role: Role
    var text: String

    init(id: UUID = UUID(), role: Role, text: String) {
        self.id = id
        self.role = role
        self.text = text
    }
}

@MainActor
final class CreateChatViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = [
        ChatMessage(role: .assistant, text: "Hi! Share what you want to create and I'll draft it for you.")
    ]
    @Published var inputText: String = ""
    @Published var isStreaming = false
    @Published var isRecording = false
    @Published var recordingError: String?
    @Published var streamingError: String?

    private let speechTranscriber = SpeechTranscriber()
    private var streamingMessageID: UUID?
    private let chatService: ProducerChatService
    private var threadId: String?

    init(chatService: ProducerChatService) {
        self.chatService = chatService
    }

    func startNewChat() {
        stopRecordingIfNeeded()
        isStreaming = false
        streamingError = nil
        streamingMessageID = nil
        threadId = nil
        inputText = ""
        messages = [ChatMessage(role: .assistant, text: "Hi! Share what you want to create and I'll draft it for you.")]
    }

    func sendMessage() {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return }
        messages.append(ChatMessage(role: .user, text: trimmed))
        inputText = ""
        startStreaming(prompt: trimmed)
    }

    func toggleRecording() {
        if isRecording {
            stopRecording()
        } else {
            Task { await startRecording() }
        }
    }

    func stopRecordingIfNeeded() {
        if isRecording {
            stopRecording()
        }
    }

    private func startRecording() async {
        do {
            try await speechTranscriber.requestAuthorization()
            try speechTranscriber.startTranscribing { [weak self] text in
                Task { @MainActor in
                    self?.inputText = text
                }
            }
            isRecording = true
            recordingError = nil
        } catch {
            recordingError = error.localizedDescription
            isRecording = false
        }
    }

    private func stopRecording() {
        speechTranscriber.stopTranscribing()
        isRecording = false
    }

    private func startStreaming(prompt: String) {
        isStreaming = true
        streamingError = nil

        let assistantMessage = ChatMessage(role: .assistant, text: "")
        streamingMessageID = assistantMessage.id
        messages.append(assistantMessage)

        let history = messages.dropLast() // exclude placeholder assistant message
        if threadId == nil {
            threadId = UUID().uuidString
        }
        let activeThreadId = threadId

        Task { [weak self] in
            guard let self else { return }
            do {
                for try await event in chatService.stream(
                    userMessage: prompt,
                    threadId: activeThreadId,
                    messages: Array(history)
                ) {
                    switch event.kind {
                    case .delta(let text):
                        await MainActor.run { [weak self] in
                            self?.appendStreamingChunk(text)
                        }
                    case .thread(let id):
                        await MainActor.run { [weak self] in
                            self?.threadId = id
                        }
                    }
                }
            } catch {
                await MainActor.run { [weak self] in
                    self?.streamingError = error.localizedDescription
                }
            }
            await MainActor.run { [weak self] in
                self?.endStreaming()
            }
        }
    }

    private func appendStreamingChunk(_ chunk: String) {
        guard let streamingMessageID else { return }
        guard let index = messages.firstIndex(where: { $0.id == streamingMessageID }) else { return }
        messages[index].text.append(chunk)
    }

    private func endStreaming() {
        isStreaming = false
        streamingMessageID = nil
    }
}

struct CreateChatView: View {
    @StateObject var viewModel: CreateChatViewModel
    @Namespace private var scrollSpace

    init(service: ProducerChatService) {
        _viewModel = StateObject(wrappedValue: CreateChatViewModel(chatService: service))
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12, pinnedViews: []) {
                        ForEach(viewModel.messages) { message in
                            messageBubble(for: message)
                                .id(message.id)
                        }
                        if viewModel.isStreaming {
                            HStack {
                                ProgressView()
                                    .tint(.brieflyPrimary)
                                Text("Streaming response…")
                                    .font(.caption)
                                    .foregroundStyle(Color.brieflyTextSecondary)
                                Spacer()
                            }
                            .padding(.horizontal, 12)
                        } else if let error = viewModel.streamingError {
                            HStack {
                                Image(systemName: "exclamationmark.triangle")
                                    .foregroundStyle(Color.brieflyDestructive)
                                Text(error)
                                    .font(.caption)
                                    .foregroundStyle(Color.brieflyDestructive)
                                Spacer()
                            }
                            .padding(.horizontal, 12)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .background(Color.brieflyBackground)
                .onChange(of: viewModel.messages) { _ in
                    withAnimation(.easeOut(duration: 0.2)) {
                        if let lastID = viewModel.messages.last?.id {
                            proxy.scrollTo(lastID, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            composer
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(.thinMaterial)
        }
        .navigationTitle("Create")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    viewModel.startNewChat()
                } label: {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .foregroundStyle(Color.brieflyPrimary)
                }
                .accessibilityLabel("Start a new chat")
            }

            if let error = viewModel.recordingError {
                ToolbarItem(placement: .navigationBarLeading) {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(Color.brieflyDestructive)
                }
            }
        }
        .onDisappear {
            viewModel.stopRecordingIfNeeded()
        }
    }

    private var composer: some View {
        HStack(spacing: 10) {
            Button {
                viewModel.toggleRecording()
            } label: {
                Image(systemName: viewModel.isRecording ? "stop.fill" : "mic.fill")
                    .foregroundStyle(viewModel.isRecording ? Color.brieflyDestructive : Color.brieflyPrimary)
                    .padding(10)
                    .background(
                        Circle()
                            .fill(.thinMaterial)
                            .overlay(
                                Circle()
                                    .stroke(viewModel.isRecording ? Color.brieflyDestructive : Color.brieflyPrimary, lineWidth: 1)
                            )
                            .shadow(color: Color.black.opacity(0.06), radius: 8, x: 0, y: 4)
                    )
            }

            TextField("Type a prompt…", text: $viewModel.inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .padding(.vertical, 12)
                .padding(.horizontal, 14)
                .background(glassFieldBackground())

            Button {
                viewModel.sendMessage()
            } label: {
                Image(systemName: "paperplane.fill")
                    .foregroundStyle(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color.brieflyTextSecondary : Color.brieflyPrimary)
                    .padding(10)
            }
            .disabled(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    @ViewBuilder
    private func messageBubble(for message: ChatMessage) -> some View {
        let isUser = message.role == .user

        HStack(alignment: .top) {
            if isUser { Spacer(minLength: 40) }

            Text(message.text.isEmpty && viewModel.isStreaming ? "…" : message.text)
                .font(.body)
                .foregroundStyle(Color.brieflyTextPrimary)
                .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
                .padding(.vertical, 6)

            if !isUser { Spacer(minLength: 40) }
        }
    }

    private func glassFieldBackground(cornerRadius: CGFloat = 16) -> some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.white.opacity(0.05))
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.18), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.16), radius: 14, x: 0, y: 10)
    }
}

@MainActor
final class SpeechTranscriber {
    private let speechRecognizer = SFSpeechRecognizer()
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    func requestAuthorization() async throws {
        let authStatus = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }

        guard authStatus == .authorized else {
            throw NSError(domain: "Speech", code: 1, userInfo: [NSLocalizedDescriptionKey: "Speech recognition permission not granted."])
        }
    }

    func startTranscribing(onUpdate: @escaping (String) -> Void) throws {
        stopTranscribing()

        let audioSession = AVAudioSession.sharedInstance()
        guard audioSession.isInputAvailable else {
            throw NSError(domain: "Speech", code: 2, userInfo: [NSLocalizedDescriptionKey: "No audio input available. Try using a physical device or check microphone settings."])
        }

        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.inputFormat(forBus: 0)
        guard recordingFormat.sampleRate > 0, recordingFormat.channelCount > 0 else {
            throw NSError(domain: "Speech", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unable to access a valid microphone format. Try running on a device with a working mic."])
        }

        request = SFSpeechAudioBufferRecognitionRequest()
        request?.shouldReportPartialResults = true

        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        task = speechRecognizer?.recognitionTask(with: request ?? SFSpeechAudioBufferRecognitionRequest()) { [weak self] result, error in
            guard let self else { return }
            if let result {
                onUpdate(result.bestTranscription.formattedString)
            }

            if result?.isFinal == true || error != nil {
                self.stopTranscribing()
            }
        }
    }

    func stopTranscribing() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
    }
}
