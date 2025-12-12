import Foundation
import Combine

enum OnboardingStep: String, Hashable, Codable {
    case welcome
    case voice
    case manual
    case review
    case generate
}

@MainActor
final class OnboardingViewModel: ObservableObject {
    @Published var transcript: String = ""
    @Published var isRecording: Bool = false
    @Published var isSubmitting: Bool = false
    @Published var isProcessingAudio: Bool = false
    @Published var isPollingTopics: Bool = false
    @Published var topics: [Topic] = []
    @Published var errorMessage: String?
    @Published var currentStep: OnboardingStep = .voice
    private var cancellables = Set<AnyCancellable>()
    private let topicService: TopicProviding
    private let episodeService: EpisodeProviding
    private let voiceService: OnboardingVoiceService

    init(topicService: TopicProviding, episodeService: EpisodeProviding, voiceService: OnboardingVoiceService) {
        self.topicService = topicService
        self.episodeService = episodeService
        self.voiceService = voiceService
        bindVoice()
    }

    func startVoiceCapture() {
        Task {
            await voiceService.startRecording()
        }
    }

    func stopVoiceCapture() {
        voiceService.stopRecording()
    }

    func clearTranscript() {
        voiceService.clearTranscript()
        transcript = ""
    }

    func submitTranscript() async {
        guard !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Please capture or enter what you want to hear about."
            return
        }
        if isProcessingAudio {
            errorMessage = "Finishing your transcription, please wait…"
            return
        }
        isSubmitting = true
        errorMessage = nil
        do {
            if voiceService.completion == nil {
                // Manual entry path: create a topic directly
                _ = try await topicService.createTopic(originalText: transcript)
            }
            await fetchTopicsWithPolling()
            currentStep = .review
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }

    func saveManualTranscript(_ text: String) async {
        transcript = text
        await submitTranscript()
    }

    func fetchTopicsWithPolling() async {
        isPollingTopics = true
        defer { isPollingTopics = false }
        do {
            topics = try await topicService.fetchTopics()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteTopic(at offsets: IndexSet) {
        for index in offsets {
            if let id = topics[index].id {
                Task { try? await topicService.deleteTopic(id: id) }
            }
        }
        topics.remove(atOffsets: offsets)
    }

    func updateTopic(_ topic: Topic) async {
        do {
            let updated = try await topicService.updateTopic(topic)
            if let index = topics.firstIndex(where: { $0.id == updated.id }) {
                topics[index] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addTopic(text: String) async {
        do {
            let topic = try await topicService.createTopic(originalText: text)
            topics.append(topic)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func generateFirstEpisode() async -> Episode? {
        do {
            return try await episodeService.generateEpisode()
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    private func bindVoice() {
        voiceService.$transcript
            .receive(on: RunLoop.main)
            .assign(to: &$transcript)

        voiceService.$isRecording
            .receive(on: RunLoop.main)
            .assign(to: &$isRecording)

        voiceService.$isUploading
            .receive(on: RunLoop.main)
            .assign(to: &$isProcessingAudio)

        voiceService.$errorMessage
            .receive(on: RunLoop.main)
            .sink { [weak self] message in
                self?.errorMessage = message
            }
            .store(in: &cancellables)

        voiceService.$completion
            .compactMap { $0 }
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                Task { await self?.fetchTopicsWithPolling() }
            }
            .store(in: &cancellables)
    }
}
