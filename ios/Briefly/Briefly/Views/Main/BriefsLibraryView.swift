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
            ForEach(orderedTopics) { topic in
                topicRow(topic: topic)
            }
        }
        .listStyle(.plain)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Color.clear.frame(height: 120)
        }
        .scrollContentBackground(.hidden)
        .listRowBackground(Color.brieflyBackground)
        .background(Color.brieflyBackground)
        .navigationTitle("Brief Library")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                NavigationLink {
                    CreateBriefView(topicsViewModel: topicsViewModel)
                } label: {
                    Label("New", systemImage: "plus")
                        .font(.system(size: 17, weight: .semibold))
                        .labelStyle(.titleAndIcon)
                        .foregroundStyle(Color.offBlack)
                }
                .tint(.offBlack)
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

    private func topicRow(topic: Topic) -> some View {
        let isActive = topic.isActive
        let isInactiveAtLimit = !isActive && !topicsViewModel.canAddActiveTopic
        let classificationLabels = classificationLabels(from: topic.classificationShortLabel)

        return HStack(alignment: .center, spacing: 14) {
            Button {
                editingTopic = topic
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(topic.displayTitle)
                        .font(.callout.weight(.semibold))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(topic.originalText)
                        .font(.footnote)
                        .foregroundColor(.brieflyTextMuted)
                        .lineLimit(2)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if classificationLabels.isEmpty == false {
                        classificationPills(for: classificationLabels)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)

            Spacer(minLength: 12)

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
                        ? Color.offBlack
                        : (isInactiveAtLimit ? Color.brieflyTextMuted : Color.offBlack)
                    )
                    .font(.system(size: 22, weight: .semibold))
            }
            .buttonStyle(.borderless)
            .opacity(isInactiveAtLimit ? 0.5 : 1)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 8)
        .listRowInsets(EdgeInsets(top: 8, leading: 20, bottom: 8, trailing: 20))
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
            .font(.system(size: 13, weight: .semibold))
            .italic()
            .foregroundColor(.brieflyClassificationPillText)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.warmGrey)
            .clipShape(Capsule())
            .accessibilityLabel("Classification \(label)")
    }

    private func classificationPills(for labels: [String]) -> some View {
        HStack(spacing: 8) {
            ForEach(labels, id: \.self) { label in
                classificationPill(label: label)
            }
        }
        .padding(.top, 2)
    }

    private func classificationLabels(from rawLabel: String?) -> [String] {
        guard let rawLabel = rawLabel?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              rawLabel.isEmpty == false else { return [] }

        let normalized = rawLabel.replacingOccurrences(of: "/", with: ",")
        let components = normalized
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.isEmpty == false }

        if components.isEmpty {
            return [rawLabel]
        }
        return components
    }
}
