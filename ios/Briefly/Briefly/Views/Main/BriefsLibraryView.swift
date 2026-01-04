import SwiftUI

struct BriefsLibraryView: View {
    @ObservedObject var topicsViewModel: TopicsViewModel
    @Environment(\.undoManager) private var undoManager
    @State private var showActiveLimitAlert: Bool = false
    @State private var editingTopic: Topic?

    private var orderedTopics: [Topic] {
        topicsViewModel.topics.sorted { $0.orderIndex < $1.orderIndex }
    }

    var body: some View {
        List {
            libraryHeader

            ForEach(orderedTopics) { topic in
                topicRow(topic: topic)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .listRowBackground(Color.brieflyBackground)
        .background(Color.brieflyBackground)
        .navigationTitle("Briefs Library")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                NavigationLink(value: TopicRoute.create) {
                    Image(systemName: "plus")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Color.offBlack)
                }
                .accessibilityLabel("Create Brief")
            }
        }
        .sheet(item: $editingTopic) { topic in
            NavigationStack {
                TopicEditView(viewModel: topicsViewModel, topic: topic)
            }
        }
        .alert("Active Brief limit reached", isPresented: $showActiveLimitAlert) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("You can have up to \(topicsViewModel.maxActiveTopics) active Briefs on your plan.")
        }
    }

    private var libraryHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("All Briefs")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Color.offBlack)
            Text("Tap + to activate, – to deactivate. Ordered by creation.")
                .font(.system(size: 14))
                .foregroundStyle(Color.brieflyTextSecondary)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Color.brieflyBackground)
    }

    private func topicRow(topic: Topic) -> some View {
        let isActive = topic.isActive
        let isInactiveAtLimit = !isActive && !topicsViewModel.canAddActiveTopic

        return HStack(alignment: .center, spacing: 16) {
            Button {
                editingTopic = topic
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(topic.displayTitle)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.brieflyTextPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(topic.originalText)
                        .font(.footnote)
                        .foregroundColor(.brieflyTextMuted)
                        .lineLimit(2)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let pillLabel = topic.classificationShortLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
                       pillLabel.isEmpty == false {
                        classificationPill(label: pillLabel)
                            .padding(.top, 4)
                    }
                }
            }
            .buttonStyle(.plain)

            Spacer(minLength: 10)

            Button {
                if isActive {
                    Task { await topicsViewModel.deactivateTopic(topic) }
                } else if topicsViewModel.canAddActiveTopic {
                    Task { await topicsViewModel.activateTopic(topic) }
                } else {
                    showActiveLimitAlert = true
                }
            } label: {
                Image(systemName: isActive ? "minus.circle.fill" : "plus.circle.fill")
                    .foregroundStyle(
                        isActive
                        ? Color.brieflySecondary
                        : (isInactiveAtLimit ? Color.brieflyTextMuted : Color.brieflySecondary)
                    )
                    .font(.title3)
            }
            .buttonStyle(.borderless)
            .opacity(isInactiveAtLimit ? 0.5 : 1)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 10)
        .listRowInsets(EdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 16))
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task { await topicsViewModel.deleteTopic(topic, undoManager: undoManager) }
            } label: {
                Label("Delete", systemImage: "trash")
            }
            .tint(.brieflyDestructive)
        }
    }

    private func classificationPill(label: String) -> some View {
        Text(label)
            .font(.system(size: 12))
            .italic()
            .foregroundColor(.brieflyClassificationPillText)
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .background(Color.warmGrey)
            .clipShape(Capsule())
            .accessibilityLabel("Classification \(label)")
    }
}
