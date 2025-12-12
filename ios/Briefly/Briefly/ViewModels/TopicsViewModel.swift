import Foundation

@MainActor
final class TopicsViewModel: ObservableObject {
    @Published var topics: [Topic] = [] {
        didSet { updateHasChanges() }
    }
    @Published var errorMessage: String?
    @Published var isLoading: Bool = false
    @Published private(set) var hasChanges: Bool = false
    let maxActiveTopics: Int = 5

    private let topicService: TopicProviding
    private var originalTopics: [Topic] = []

    var activeTopics: [Topic] {
        topics.filter { $0.isActive }.sorted { $0.orderIndex < $1.orderIndex }
    }

    var inactiveTopics: [Topic] {
        topics.filter { !$0.isActive }.sorted { $0.orderIndex < $1.orderIndex }
    }

    var canAddActiveTopic: Bool {
        activeTopics.count < maxActiveTopics
    }

    init(topicService: TopicProviding) {
        self.topicService = topicService
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let fetched = try await topicService.fetchTopics()
            let sorted = fetched.sorted { $0.orderIndex < $1.orderIndex }
            originalTopics = sorted
            topics = sorted
            hasChanges = false
        } catch {
            errorMessage = error.localizedDescription
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

    func deleteTopic(at offsets: IndexSet) async {
        errorMessage = nil
        for index in offsets {
            if let id = topics[index].id {
                try? await topicService.deleteTopic(id: id)
            }
        }
        topics.remove(atOffsets: offsets)
        originalTopics = topics
        hasChanges = false
    }

    func deleteTopic(_ topic: Topic) async {
        guard let id = topic.id else { return }
        errorMessage = nil
        do {
            try await topicService.deleteTopic(id: id)
            topics.removeAll { $0.id == id }
            originalTopics = topics
            hasChanges = false
        } catch {
            errorMessage = error.localizedDescription
        }
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
}

private extension Topic {
    func withActiveState(_ isActive: Bool) -> Topic {
        Topic(id: id, originalText: originalText, orderIndex: orderIndex, isActive: isActive)
    }
}
