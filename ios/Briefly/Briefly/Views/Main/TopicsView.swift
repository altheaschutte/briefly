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
                        HStack(spacing: 8) {
                            Text("Active")
                                .foregroundColor(.secondary)
                            Toggle("", isOn: $topic.isActive)
                                .labelsHidden()
                                .toggleStyle(.switch)
                        }
                    }
                    .padding(.vertical, 6)
                }
                .onDelete { indexSet in
                    Task { await viewModel.deleteTopic(at: indexSet) }
                }

                if !viewModel.topics.isEmpty {
                    Button {
                        Task { await viewModel.saveChanges() }
                    } label: {
                        Text("Save changes")
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                    .disabled(!viewModel.hasChanges || viewModel.isLoading)
                }
            }

            Section(header: Text("Add topic")) {
                TextField("Topic", text: $newTopicText, axis: .vertical)
                    .inputFieldStyle()
                    .padding(.vertical, 6)
                Button("Add") {
                    guard !newTopicText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                    Task {
                        await viewModel.addTopic(text: newTopicText)
                        newTopicText = ""
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .background(Color.brieflySecondary)
                .foregroundColor(Color.brieflyPrimary)
                .cornerRadius(10)
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
