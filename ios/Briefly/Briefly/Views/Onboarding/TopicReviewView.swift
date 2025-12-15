import SwiftUI

struct TopicReviewView: View {
    @ObservedObject var viewModel: OnboardingViewModel
    @State private var newText: String = ""
    let onConfirm: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text("Review topics")
                .font(.title3.bold())
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Edit, remove, or add topics before we generate your first episode.")
                .foregroundColor(.brieflyTextMuted)
                .frame(maxWidth: .infinity, alignment: .leading)

            if viewModel.isPollingTopics {
                ProgressView("Fetching topics from your transcript…")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let error = viewModel.errorMessage {
                InlineErrorText(message: error)
            }

            List {
                ForEach($viewModel.topics) { $topic in
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Topic", text: $topic.originalText, axis: .vertical)
                            .font(.headline)
                            .inputFieldStyle()
                        Toggle("Active", isOn: $topic.isActive)
                            .toggleStyle(SwitchToggleStyle(tint: .brieflyPrimary))
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
                .listRowBackground(Color.brieflyBackground)

                Section(header: Text("Add topic")) {
                    TextField("Topic", text: $newText, axis: .vertical)
                        .inputFieldStyle()
                        .padding(8)
                    Button("Add topic") {
                        guard !newText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                        Task {
                            await viewModel.addTopic(text: newText)
                            newText = ""
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 4)
                    .background(Color.brieflySecondary)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
                .listRowBackground(Color.brieflyBackground)
            }
            .scrollContentBackground(.hidden)
            .listStyle(.plain)
            .listRowBackground(Color.brieflyBackground)
            .background(Color.brieflyBackground)

            Button(action: onConfirm) {
                Text("Confirm Topics")
                    .frame(maxWidth: .infinity)
                    .padding()
            }
            .background(Color.brieflyPrimary)
            .foregroundColor(.white)
            .cornerRadius(12)
            .padding(.bottom, 8)
        }
        .padding()
        .background(Color.brieflyBackground)
        .onAppear {
            if viewModel.topics.isEmpty {
                Task { await viewModel.fetchTopicsWithPolling() }
            }
        }
    }
}
