import Foundation

@MainActor
final class TopicsViewModel: ObservableObject {
    @Published var topics: [Topic] = [] {
        didSet {
            topicsVersion &+= 1
            updateHasChanges()
        }
    }
    @Published var errorMessage: String?
    @Published var isLoading: Bool = false
    @Published var entitlements: Entitlements?
    @Published private(set) var hasChanges: Bool = false
    private let defaultMaxActiveTopics: Int = 5

    private let topicService: TopicProviding
    private let entitlementsService: EntitlementsProviding?
    private let onFatalAuthError: ((String) -> Void)?
    private var originalTopics: [Topic] = []
    private var topicsVersion: Int = 0

    var activeTopics: [Topic] {
        topics.filter { $0.isActive }.sorted { $0.orderIndex < $1.orderIndex }
    }

    var inactiveTopics: [Topic] {
        topics.filter { !$0.isActive }.sorted { $0.orderIndex < $1.orderIndex }
    }

    var canAddActiveTopic: Bool {
        activeTopics.count < maxActiveTopics
    }

    var maxActiveTopics: Int {
        entitlements?.limits.maxActiveTopics ?? defaultMaxActiveTopics
    }

    init(
        topicService: TopicProviding,
        entitlementsService: EntitlementsProviding? = nil,
        initialTopics: [Topic] = [],
        onFatalAuthError: ((String) -> Void)? = nil
    ) {
        self.topicService = topicService
        self.entitlementsService = entitlementsService
        self.onFatalAuthError = onFatalAuthError
        applyPrefetchedTopics(initialTopics)
    }

    func load() async {
        let requestVersion = topicsVersion
        isLoading = true
        errorMessage = nil
        var lastError: String?
        defer { isLoading = false }
        for attempt in 1...3 {
            do {
                await refreshEntitlements()
                let fetched = try await topicService.fetchTopics()
                let sorted = fetched.sorted { $0.orderIndex < $1.orderIndex }
                guard requestVersion == topicsVersion else { return } // Drop stale responses when local edits occurred mid-request.
                originalTopics = sorted
                topics = sorted
                hasChanges = false
                errorMessage = nil
                return
            } catch let apiError as APIError {
                if case .unauthorized = apiError {
                    // AppViewModel handles logout/navigation on 401s; skip showing an overlay here.
                    return
                }
                lastError = apiError.localizedDescription
            } catch {
                lastError = error.localizedDescription
            }

            if attempt >= 3 {
                let message = lastError ?? "Unable to reach our authentication service. Please retry or sign in again."
                errorMessage = message
                onFatalAuthError?(message)
            }
        }
    }

    func addTopic(text: String, isActive: Bool = true) async {
        errorMessage = nil
        if isActive && !canAddActiveTopic {
            errorMessage = "You can only have up to \(maxActiveTopics) active topics."
            return
        }

        do {
            var topic = try await topicService.createTopic(originalText: text)
            if !isActive && topic.isActive {
                topic = try await topicService.updateTopic(topic.withActiveState(false))
            }
            topics = reorderList(afterAppending: topic)
            originalTopics = topics
            hasChanges = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteTopic(at offsets: IndexSet, undoManager: UndoManager?) async {
        errorMessage = nil
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
        originalTopics = topics
        hasChanges = false
    }

    func deleteTopic(_ topic: Topic, undoManager: UndoManager?) async {
        errorMessage = nil
        guard let index = topics.firstIndex(where: { $0.id == topic.id }) ?? topics.firstIndex(of: topic) else { return }

        registerUndoForDeletion([DeletedTopicSnapshot(topic: topic, index: index)], undoManager: undoManager)

        if let id = topic.id {
            try? await topicService.deleteTopic(id: id)
        }
        topics.remove(at: index)
        originalTopics = topics
        hasChanges = false
    }

    func activateTopic(_ topic: Topic) async {
        errorMessage = nil
        let updatedTopic = topic.withActiveState(true)
        guard canActivate(topic: updatedTopic) else {
            errorMessage = "You can only have up to \(maxActiveTopics) active topics."
            return
        }
        replaceTopic(updatedTopic)
        applyOrder(active: activeTopics, inactive: inactiveTopics)
        await saveChanges()
    }

    func deactivateTopic(_ topic: Topic) async {
        errorMessage = nil
        let updatedTopic = topic.withActiveState(false)
        replaceTopic(updatedTopic)
        applyOrder(active: activeTopics, inactive: inactiveTopics)
        await saveChanges()
    }

    func moveActiveTopics(from offsets: IndexSet, to destination: Int) async {
        errorMessage = nil
        reorderActiveTopicsInMemory(from: offsets, to: destination)
        await saveChanges()
    }

    func reorderActiveTopicsInMemory(from offsets: IndexSet, to destination: Int) {
        var reordered = activeTopics
        reordered.move(fromOffsets: offsets, toOffset: destination)
        applyOrder(active: reordered, inactive: inactiveTopics)
    }

    func persistActiveTopicOrder() async {
        errorMessage = nil
        await saveChanges()
    }

    func saveChanges() async {
        errorMessage = nil
        let topicsToUpdate = changedTopics()
        guard !topicsToUpdate.isEmpty else { return }

        guard activeTopics.count <= maxActiveTopics else {
            errorMessage = "You can only have up to \(maxActiveTopics) active topics."
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            var updatedTopics = topics
            for topic in topicsToUpdate {
                let updated = try await topicService.updateTopic(topic)
                if let index = updatedTopics.firstIndex(where: { $0.id == updated.id }) {
                    updatedTopics[index] = updated
                }
                updateBaseline(with: updated)
            }
            topics = updatedTopics
            originalTopics = updatedTopics
            hasChanges = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateTopic(_ topic: Topic) async {
        errorMessage = nil
        await updateTopic(topic, enforceActiveLimit: false)
    }

    func updateTopicWithLimit(_ topic: Topic) async {
        errorMessage = nil
        await updateTopic(topic, enforceActiveLimit: true)
    }

    func applyPrefetchedTopics(_ prefetched: [Topic]) {
        guard topics.isEmpty, prefetched.isEmpty == false else { return }
        let sorted = prefetched.sorted { $0.orderIndex < $1.orderIndex }
        originalTopics = sorted
        topics = sorted
        hasChanges = false
    }

    private func updateTopic(_ topic: Topic, enforceActiveLimit: Bool) async {
        if enforceActiveLimit, topic.isActive, !canActivate(topic: topic) {
            errorMessage = "You can only have up to \(maxActiveTopics) active topics."
            return
        }

        do {
            let updated = try await topicService.updateTopic(topic)
            if let index = topics.firstIndex(where: { $0.id == updated.id }) {
                topics[index] = updated
            }
            updateBaseline(with: updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func changedTopics() -> [Topic] {
        let originalByID = Dictionary(uniqueKeysWithValues: originalTopics.compactMap { topic in
            topic.id.map { ($0, topic) }
        })

        return topics.compactMap { topic in
            guard let id = topic.id else { return nil }
            guard let original = originalByID[id] else { return topic }
            return topic == original ? nil : topic
        }
    }

    private func updateHasChanges() {
        hasChanges = !changedTopics().isEmpty
    }

    func refreshEntitlements() async {
        guard let entitlementsService else { return }
        do {
            entitlements = try await entitlementsService.fetchEntitlements()
        } catch {
            // Ignore failures to avoid blocking UI; limits fall back to defaults.
        }
    }

    private func updateBaseline(with topic: Topic) {
        guard let id = topic.id else { return }

        if let index = originalTopics.firstIndex(where: { $0.id == id }) {
            originalTopics[index] = topic
        } else {
            originalTopics.append(topic)
        }

        updateHasChanges()
    }

    private func canActivate(topic: Topic) -> Bool {
        guard let id = topic.id else {
            return activeTopics.count < maxActiveTopics
        }

        let wasActive = topics.first(where: { $0.id == id })?.isActive ?? false
        if wasActive && topic.isActive {
            return true
        }

        let currentlyActive = topics.filter { $0.isActive && $0.id != id }.count
        return currentlyActive < maxActiveTopics
    }

    private func applyOrder(active: [Topic], inactive: [Topic]) {
        let combined = active + inactive
        topics = combined.enumerated().map { index, topic in
            var updated = topic
            updated.orderIndex = index
            return updated
        }
    }

    private func reorderList(afterAppending topic: Topic) -> [Topic] {
        let updated = (topics + [topic]).sorted { $0.orderIndex < $1.orderIndex }
        return updated.enumerated().map { index, topic in
            var updatedTopic = topic
            updatedTopic.orderIndex = index
            return updatedTopic
        }
    }

    private func replaceTopic(_ topic: Topic) {
        if let index = topics.firstIndex(where: { $0.id == topic.id }) {
            topics[index] = topic
        } else {
            topics.append(topic)
        }
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

        var updatedTopics = topics
        for (snapshot, restored) in zip(sorted, recreated) {
            let insertIndex = min(snapshot.index, updatedTopics.count)
            updatedTopics.insert(restored, at: insertIndex)
        }

        updatedTopics = updatedTopics.enumerated().map { index, topic in
            var updated = topic
            updated.orderIndex = index
            return updated
        }

        topics = updatedTopics
        await saveChanges()

        guard errorMessage == nil else { return }

        let redoSnapshots: [DeletedTopicSnapshot] = recreated.compactMap { restored in
            guard let index = topics.firstIndex(where: { $0.id == restored.id }) else { return nil }
            return DeletedTopicSnapshot(topic: restored, index: index)
        }
        registerUndoForDeletion(redoSnapshots, undoManager: undoManager)
    }
}

private extension Topic {
    func withActiveState(_ isActive: Bool) -> Topic {
        Topic(id: id, originalText: originalText, orderIndex: orderIndex, isActive: isActive)
    }
}

private struct DeletedTopicSnapshot {
    let topic: Topic
    let index: Int
}
