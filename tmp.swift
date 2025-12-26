import Foundation
import SwiftUI

struct Topic: Identifiable, Equatable {
    var id: UUID?
    var originalText: String
    var orderIndex: Int
    var isActive: Bool
}

@MainActor
final class VM: ObservableObject {
    @Published var topics: [Topic]
    init(topics: [Topic]) { self.topics = topics }
    var activeTopics: [Topic] { topics.filter { $0.isActive }.sorted { $0.orderIndex < $1.orderIndex } }
    var inactiveTopics: [Topic] { topics.filter { !$0.isActive }.sorted { $0.orderIndex < $1.orderIndex } }
    func reorderActiveTopicsInMemory(from offsets: IndexSet, to destination: Int) {
        var reordered = activeTopics
        reordered.move(fromOffsets: offsets, toOffset: destination)
        applyOrder(active: reordered, inactive: inactiveTopics)
    }
    private func applyOrder(active: [Topic], inactive: [Topic]) {
        let combined = active + inactive
        topics = combined.enumerated().map { index, topic in
            var updated = topic
            updated.orderIndex = index
            return updated
        }
    }
}

Task { @MainActor in
    let initial = [
        Topic(id: UUID(), originalText: "A", orderIndex: 0, isActive: true),
        Topic(id: UUID(), originalText: "B", orderIndex: 1, isActive: true),
        Topic(id: UUID(), originalText: "C", orderIndex: 2, isActive: true)
    ]
    let vm = VM(topics: initial)
    print("start", vm.activeTopics.map { "\($0.originalText):\($0.orderIndex)" })
    vm.reorderActiveTopicsInMemory(from: IndexSet(integer: 0), to: 2)
    print("after", vm.activeTopics.map { "\($0.originalText):\($0.orderIndex)" })
    exit(0)
}

dispatchMain()
