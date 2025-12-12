import SwiftUI

struct TopicsView: View {
    @ObservedObject var viewModel: TopicsViewModel
    @State private var newTopicText: String = ""

    var body: some View {
        List {
            Section(header: Text("Your topics")) {
                ForEach($viewModel.topics) { $topic in
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Topic", text: $topic.originalText, axis: .vertical)
                            .font(.subheadline)
                            .inputFieldStyle()
                        Toggle("Active", isOn: $topic.isActive)
                            .toggleStyle(.switch)
                        Button("Save") {
                            Task { await viewModel.updateTopic(topic) }
                        }
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    .padding(.vertical, 6)
                }
                .onDelete { indexSet in
                    Task { await viewModel.deleteTopic(at: indexSet) }
                }
            }

            Section(header: Text("Add topic")) {
                TextField("Topic", text: $newTopicText, axis: .vertical)
                    .inputFieldStyle()
                Button("Add") {
                    guard !newTopicText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                    Task {
                        await viewModel.addTopic(text: newTopicText)
                        newTopicText = ""
                    }
                }
            }
        }
        .navigationTitle("Topics")
        .onAppear {
            Task { await viewModel.load() }
        }
        .refreshable {
            await viewModel.load()
        }
    }
}
