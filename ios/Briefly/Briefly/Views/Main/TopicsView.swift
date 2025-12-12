import SwiftUI

struct TopicsView: View {
    @ObservedObject var viewModel: TopicsViewModel
    @State private var newTitle: String = ""
    @State private var newDescription: String = ""

    var body: some View {
        List {
            Section(header: Text("Your topics")) {
                ForEach($viewModel.topics) { $topic in
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Title", text: $topic.title)
                            .font(.headline)
                        TextField("Description", text: $topic.description)
                            .font(.subheadline)
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
                TextField("Title", text: $newTitle)
                TextField("Description", text: $newDescription)
                Button("Add") {
                    guard !newTitle.isEmpty, !newDescription.isEmpty else { return }
                    Task {
                        await viewModel.addTopic(title: newTitle, description: newDescription)
                        newTitle = ""
                        newDescription = ""
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
