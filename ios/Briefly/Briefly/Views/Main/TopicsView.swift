import SwiftUI

struct TopicsView: View {
    @ObservedObject var viewModel: TopicsViewModel
    @State private var newTopicText: String = ""
    @Environment(\.undoManager) private var undoManager

    var body: some View {
        List {
            Section {
                ForEach($viewModel.topics) { $topic in
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Topic", text: $topic.originalText, axis: .vertical)
                            .font(.subheadline)
                            .inputFieldStyle()
                        HStack(spacing: 8) {
                            Text("Active")
                                .foregroundColor(.brieflyTextMuted)
                            Toggle("", isOn: $topic.isActive)
                                .labelsHidden()
                                .toggleStyle(.switch)
                        }
                    }
                    .padding(.vertical, 6)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            Task { await viewModel.deleteTopic(topic, undoManager: undoManager) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        .tint(.brieflyDestructive)
                    }
                }
                .listRowBackground(Color.brieflyBackground)

                if !viewModel.topics.isEmpty {
                    Button {
                        Task { await viewModel.saveChanges() }
                    } label: {
                        Text("Save changes")
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                    .disabled(!viewModel.hasChanges || viewModel.isLoading)
                }
            } header: {
                topicsHeader("Your topics")
            }
            .listRowBackground(Color.brieflyBackground)

            Section {
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
                .foregroundColor(.white)
                .cornerRadius(10)
            } header: {
                topicsHeader("Add topic")
            }
        }
        .scrollContentBackground(.hidden)
        .listStyle(.plain)
        .listRowBackground(Color.brieflyBackground)
        .background(Color.brieflyBackground)
        .navigationTitle("Topics")
        .onAppear {
            Task { await viewModel.load() }
        }
        .refreshable {
            await viewModel.load()
        }
        .background(Color.brieflyBackground)
    }
}

private struct TopicsSectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundColor(.brieflyTextMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
    }
}

private func topicsHeader(_ title: String) -> some View {
    ZStack {
        Color.brieflyBackground
        TopicsSectionHeader(title: title)
            .padding(.horizontal)
            .padding(.vertical, 6)
    }
    .listRowInsets(EdgeInsets())
}
