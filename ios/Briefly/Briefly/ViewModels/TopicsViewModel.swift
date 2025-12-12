import Foundation

@MainActor
final class TopicsViewModel: ObservableObject {
    @Published var topics: [Topic] = []
    @Published var errorMessage: String?
    @Published var isLoading: Bool = false

    private let topicService: TopicProviding

    init(topicService: TopicProviding) {
        self.topicService = topicService
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            topics = try await topicService.fetchTopics()
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

    func deleteTopic(at offsets: IndexSet) async {
        for index in offsets {
            if let id = topics[index].id {
                try? await topicService.deleteTopic(id: id)
            }
        }
        topics.remove(atOffsets: offsets)
    }
}
