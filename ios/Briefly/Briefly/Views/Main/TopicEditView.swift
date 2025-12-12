import SwiftUI

struct TopicEditView: View {
    @ObservedObject var viewModel: TopicsViewModel
    @State private var topic: Topic
    @Environment(\.dismiss) private var dismiss
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
        Form {
            Section(header: Text("Topic")) {
                TextField("Topic", text: $topic.originalText, axis: .vertical)
                    .focused($isFieldFocused)
            }

            Section {
                Toggle("Active", isOn: $topic.isActive)
                    .tint(.blue)
                if activationWouldExceedLimit {
                    Text("You already have \(viewModel.maxActiveTopics) active topics. Deactivate one before adding another.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
            }

            if !isNew {
                Section {
                    Button(role: .destructive) {
                        Task { await deleteTopic() }
                    } label: {
                        Label("Delete topic", systemImage: "trash")
                    }
                }
            }
        }
        .navigationTitle(isNew ? "Add Topic" : "Edit Topic")
        .navigationBarTitleDisplayMode(.inline)
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

    private var activationWouldExceedLimit: Bool {
        topic.isActive && !wasActive && !viewModel.canAddActiveTopic
    }

    private func saveTopic() async {
        let trimmed = topic.originalText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            alertMessage = "Topic text cannot be empty."
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
        await viewModel.deleteTopic(topic)
        guard viewModel.errorMessage == nil else {
            alertMessage = viewModel.errorMessage
            return
        }
        dismiss()
    }
}
