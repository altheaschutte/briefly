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

    func deleteTopic(at offsets: IndexSet, undoManager: UndoManager?) async {
        let snapshots = offsets.compactMap { index -> DeletedTopicSnapshot? in
            guard topics.indices.contains(index) else { return nil }
            return DeletedTopicSnapshot(topic: topics[index], index: index)
        }
        guard snapshots.isEmpty == false else { return }

        registerUndoForDeletion(snapshots, undoManager: undoManager)

        for snapshot in snapshots {
            if let id = snapshot.topic.id {
                try? await topicService.deleteTopic(id: id)
            }
        }
        topics.remove(atOffsets: IndexSet(snapshots.map { $0.index }))
    }

    func deleteTopic(_ topic: Topic, undoManager: UndoManager?) async {
        guard let index = topics.firstIndex(where: { $0.id == topic.id }) ?? topics.firstIndex(of: topic) else { return }
        await deleteTopic(at: IndexSet(integer: index), undoManager: undoManager)
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

    private func registerUndoForDeletion(_ snapshots: [DeletedTopicSnapshot], undoManager: UndoManager?) {
        guard let undoManager, snapshots.isEmpty == false else { return }
        undoManager.registerUndo(withTarget: self) { target in
            Task { await target.restoreDeletedTopics(snapshots, undoManager: undoManager) }
        }
        undoManager.setActionName("Delete Topic")
    }

    private func restoreDeletedTopics(_ snapshots: [DeletedTopicSnapshot], undoManager: UndoManager?) async {
        errorMessage = nil
        let sorted = snapshots.sorted { $0.index < $1.index }

        var recreated: [Topic] = []
        for snapshot in sorted {
            do {
                var restored = try await topicService.createTopic(originalText: snapshot.topic.originalText)
                restored.isActive = snapshot.topic.isActive
                restored.orderIndex = snapshot.topic.orderIndex
                recreated.append(restored)
            } catch {
                errorMessage = error.localizedDescription
                return
            }
        }

        var updated = topics
        for (snapshot, restored) in zip(sorted, recreated) {
            let insertIndex = min(snapshot.index, updated.count)
            updated.insert(restored, at: insertIndex)
        }

        updated = updated.enumerated().map { index, topic in
            var topic = topic
            topic.orderIndex = index
            return topic
        }

        topics = updated
        await persistOrderChanges(for: updated)

        guard errorMessage == nil else { return }

        let redoSnapshots: [DeletedTopicSnapshot] = recreated.compactMap { restored in
            guard let index = topics.firstIndex(where: { $0.id == restored.id }) else { return nil }
            return DeletedTopicSnapshot(topic: restored, index: index)
        }
        registerUndoForDeletion(redoSnapshots, undoManager: undoManager)
    }

    private func persistOrderChanges(for topics: [Topic]) async {
        for topic in topics {
            guard topic.id != nil else { continue }
            do {
                _ = try await topicService.updateTopic(topic)
            } catch {
                errorMessage = error.localizedDescription
                return
            }
        }
    }
}

private struct DeletedTopicSnapshot {
    let topic: Topic
    let index: Int
}
