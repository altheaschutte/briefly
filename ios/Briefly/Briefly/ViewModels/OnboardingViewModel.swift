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
    @Published var entitlements: Entitlements?
    @Published var reachedUsageLimit: Bool = false
    private var cancellables = Set<AnyCancellable>()
    private let topicService: TopicProviding
    private let episodeService: EpisodeProviding
    private let voiceService: OnboardingVoiceService
    private let entitlementsService: EntitlementsProviding?

    init(topicService: TopicProviding,
         episodeService: EpisodeProviding,
         voiceService: OnboardingVoiceService,
         entitlementsService: EntitlementsProviding? = nil) {
        self.topicService = topicService
        self.episodeService = episodeService
        self.voiceService = voiceService
        self.entitlementsService = entitlementsService
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
        errorMessage = nil
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
        errorMessage = nil
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
        errorMessage = nil
        do {
            let topic = try await topicService.createTopic(originalText: text)
            topics.append(topic)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func generateFirstEpisode() async -> Episode? {
        errorMessage = nil
        updateUsageLimitFlag(with: entitlements)
        do {
            let episode = try await episodeService.generateEpisode()
            reachedUsageLimit = false
            return episode
        } catch let apiError as APIError {
            if case .statusCode(let code) = apiError, code == 403 {
                errorMessage = "You've hit your plan limit. Manage your subscription on the web."
                reachedUsageLimit = true
            } else {
                errorMessage = apiError.localizedDescription
            }
            return nil
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func refreshEntitlements() async {
        guard let entitlementsService else { return }
        do {
            let fetched = try await entitlementsService.fetchEntitlements()
            entitlements = fetched
            updateUsageLimitFlag(with: fetched)
        } catch {
            // Ignore failures; we fall back to existing state.
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

    private func updateUsageLimitFlag(with entitlements: Entitlements?) {
        guard let entitlements else { return }
        reachedUsageLimit = entitlements.isGenerationUsageExhausted
    }
}
