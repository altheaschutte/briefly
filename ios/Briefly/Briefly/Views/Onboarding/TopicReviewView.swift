import SwiftUI

struct TopicReviewView: View {
    @ObservedObject var viewModel: OnboardingViewModel
    @State private var newTitle: String = ""
    @State private var newDescription: String = ""
    let onConfirm: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text("Review topics")
                .font(.title3.bold())
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Edit, remove, or add topics before we generate your first episode.")
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            if viewModel.isPollingTopics {
                ProgressView("Fetching topics from your transcript…")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let error = viewModel.errorMessage {
                Text(error).foregroundColor(.red)
            }

            List {
                ForEach($viewModel.topics) { $topic in
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Topic title", text: $topic.title)
                            .font(.headline)
                        TextField("Description", text: $topic.description)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        Toggle("Active", isOn: $topic.isActive)
                            .toggleStyle(SwitchToggleStyle(tint: .blue))
                        Button("Save") {
                            Task { await viewModel.updateTopic(topic) }
                        }
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    .padding(8)
                }
                .onDelete { indexSet in
                    viewModel.deleteTopic(at: indexSet)
                }

                Section(header: Text("Add topic")) {
                    TextField("Title", text: $newTitle)
                    TextField("Description", text: $newDescription)
                    Button("Add topic") {
                        guard !newTitle.isEmpty, !newDescription.isEmpty else { return }
                        Task {
                            await viewModel.addTopic(title: newTitle, description: newDescription)
                            newTitle = ""
                            newDescription = ""
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)

            Button(action: onConfirm) {
                Text("Confirm Topics")
                    .frame(maxWidth: .infinity)
                    .padding()
            }
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(12)
            .padding(.bottom, 8)
        }
        .padding()
        .onAppear {
            if viewModel.topics.isEmpty {
                Task { await viewModel.fetchTopicsWithPolling() }
            }
        }
    }
}
