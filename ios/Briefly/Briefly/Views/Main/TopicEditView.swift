import SwiftUI

struct TopicEditView: View {
    @ObservedObject var viewModel: TopicsViewModel
    @State private var topic: Topic
    @Environment(\.dismiss) private var dismiss
    @Environment(\.undoManager) private var undoManager
    @FocusState private var isFieldFocused: Bool
    @State private var alertMessage: String?
    private let isNew: Bool
    private let wasActive: Bool

    init(viewModel: TopicsViewModel, topic: Topic, isNew: Bool = false) {
        self.viewModel = viewModel
        _topic = State(initialValue: topic)
        self.isNew = isNew
        self.wasActive = topic.isActive
    }

    var body: some View {
        List {
            Section {
                topicField
            }
            .listRowBackground(Color.brieflySurface)

            Section {
                Toggle("Active", isOn: $topic.isActive)
                    .tint(.brieflyPrimary)

                if activationWouldExceedLimit {
                    Text("You already have \(viewModel.maxActiveTopics) active Briefs. Deactivate one before adding another.")
                        .font(.footnote)
                        .foregroundColor(.brieflyTextMuted)
                }
            }
            .listRowBackground(Color.brieflySurface)

            if !isNew {
                Section {
                    Button(role: .destructive) {
                        Task { await deleteTopic() }
                    } label: {
                        Text("Delete Brief")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .tint(.brieflyDestructive)
                }
                .listRowBackground(Color.brieflySurface)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .listRowBackground(Color.brieflyBackground)
        .navigationTitle(isNew ? "Add Brief" : "Edit Brief")
        .navigationBarTitleDisplayMode(.inline)
        .background(Color.brieflyBackground)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    Task { await saveTopic() }
                }
                .disabled(topic.originalText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                isFieldFocused = true
            }
        }
        .onChange(of: viewModel.errorMessage) { message in
            alertMessage = message
        }
        .alert("Error", isPresented: Binding(
            get: { alertMessage != nil },
            set: { presented in
                if !presented {
                    alertMessage = nil
                    viewModel.errorMessage = nil
                }
            }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(alertMessage ?? "")
        }
    }

    private var topicField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Brief")
                .font(.footnote.weight(.semibold))
                .foregroundColor(.brieflyTextMuted)

            TextField("Brief", text: $topic.originalText, axis: .vertical)
                .frame(minHeight: topicFieldMinHeight, alignment: .topLeading)
                .focused($isFieldFocused)
                .inputFieldStyle()
        }
    }

    private var activationWouldExceedLimit: Bool {
        topic.isActive && !wasActive && !viewModel.canAddActiveTopic
    }

    private func saveTopic() async {
        let trimmed = topic.originalText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            alertMessage = "Brief text cannot be empty."
            return
        }

        topic.originalText = trimmed
        if isNew {
            await viewModel.addTopic(text: trimmed, isActive: topic.isActive)
        } else {
            await viewModel.updateTopicWithLimit(topic)
        }

        guard viewModel.errorMessage == nil else {
            alertMessage = viewModel.errorMessage
            return
        }

        dismiss()
    }

    private func deleteTopic() async {
        await viewModel.deleteTopic(topic, undoManager: undoManager)
        guard viewModel.errorMessage == nil else {
            alertMessage = viewModel.errorMessage
            return
        }
        dismiss()
    }
}

private extension TopicEditView {
    var topicFieldMinHeight: CGFloat {
        UIFont.preferredFont(forTextStyle: .body).lineHeight * 5
    }
}
