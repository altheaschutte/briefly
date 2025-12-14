import SwiftUI
import UniformTypeIdentifiers

private enum TopicRoute: Hashable {
    case edit(Topic)
    case create
}

struct SetupView: View {
    @ObservedObject var topicsViewModel: TopicsViewModel
    @StateObject private var creationViewModel: EpisodeCreationViewModel
    @State private var bannerMessage: String?
    @State private var draggingTopic: Topic?
    @State private var editingTopic: Topic?

    init(topicsViewModel: TopicsViewModel, appViewModel: AppViewModel) {
        _topicsViewModel = ObservedObject(wrappedValue: topicsViewModel)
        _creationViewModel = StateObject(wrappedValue: EpisodeCreationViewModel(episodeService: appViewModel.episodeService))
    }

    var body: some View {
        List {
            if let episode = creationViewModel.inProgressEpisode {
                creationStatusSection(episode: episode)
            }

            if topicsViewModel.topics.isEmpty {
                emptyState
            } else {
                activeTopicsSection
                inactiveTopicsSection
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .navigationTitle("Create")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            Task { await topicsViewModel.load() }
            Task { await creationViewModel.resumeInFlightIfNeeded() }
        }
        .refreshable {
            await topicsViewModel.load()
            await creationViewModel.refreshCurrentEpisode()
        }
        .sheet(item: $editingTopic) { topic in
            NavigationStack {
                TopicEditView(viewModel: topicsViewModel, topic: topic)
            }
        }
        .onChange(of: topicsViewModel.errorMessage) { message in
            handleErrorChange(message)
        }
        .onChange(of: creationViewModel.errorMessage) { message in
            handleErrorChange(message)
        }
        .navigationDestination(for: TopicRoute.self) { route in
            switch route {
            case .edit(let topic):
                TopicEditView(viewModel: topicsViewModel, topic: topic)
            case .create:
                TopicEditView(
                    viewModel: topicsViewModel,
                    topic: Topic(id: nil,
                                 originalText: "",
                                 orderIndex: topicsViewModel.topics.count,
                                 isActive: topicsViewModel.canAddActiveTopic),
                    isNew: true
                )
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                NavigationLink(value: TopicRoute.create) {
                    Label("Add topic", systemImage: "plus")
                        .labelStyle(.iconOnly)
                }
                .accessibilityLabel("Add topic")
            }
        }
        .safeAreaInset(edge: .bottom) {
            bottomActions
        }
        .overlay(alignment: .top) { bannerView }
        .overlay {
            if let message = topicsViewModel.errorMessage,
               topicsViewModel.topics.isEmpty,
               topicsViewModel.isLoading == false {
                FullScreenErrorView(
                    title: "Couldn't load your topics",
                    message: message,
                    actionTitle: "Retry"
                ) {
                    Task { await topicsViewModel.load() }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Set up your Briefly")
                .font(.headline)
            Text("Add a few topics so we can personalize the episode we generate for you.")
                .foregroundColor(.secondary)
            Text("Use the + button above to add your first topic.")
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 12)
    }

    private func creationStatusSection(episode: Episode) -> some View {
        Section(header: Text(statusHeader(for: episode))) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 12) {
                    statusIcon(for: episode)
                        .frame(width: 24, height: 24)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(episode.displayTitle.isEmpty ? "Personalized episode" : episode.displayTitle)
                            .font(.headline)
                        Text(statusLabel(for: episode.status))
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Spacer(minLength: 8)
                }

                if isFailed(status: episode.status), let error = episode.errorMessage {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.footnote)
                } else {
                    Text(statusDescription(for: episode.status))
                        .foregroundColor(.secondary)
                        .font(.footnote)
                }
            }
            .padding(.vertical, 6)
        }
    }

    private var activeTopicsSection: some View {
        Section(header: Text("Active topics")) {
            if topicsViewModel.activeTopics.isEmpty {
                Text("No active topics yet.")
                    .foregroundColor(.secondary)
            } else {
                ForEach(topicsViewModel.activeTopics) { topic in
                    topicRow(topic: topic, isActive: true)
                        .onDrag {
                            draggingTopic = topic
                            return NSItemProvider(object: NSString(string: topicDragIdentifier(for: topic)))
                        }
                        .onDrop(
                            of: [UTType.text],
                            delegate: ActiveTopicDropDelegate(
                                target: topic,
                                current: $draggingTopic,
                                viewModel: topicsViewModel
                            )
                        )
                }
            }
        }
    }

    private var inactiveTopicsSection: some View {
        Section(header: Text("Inactive topics"),
                footer: inactiveFooter) {
            if topicsViewModel.inactiveTopics.isEmpty {
                Text("No inactive topics.")
                    .foregroundColor(.secondary)
            } else {
                ForEach(topicsViewModel.inactiveTopics) { topic in
                    topicRow(topic: topic, isActive: false)
                }
            }
        }
    }

    private var inactiveFooter: some View {
        Group {
            if !topicsViewModel.canAddActiveTopic && !topicsViewModel.inactiveTopics.isEmpty {
                Text("You can have up to \(topicsViewModel.maxActiveTopics) active topics.")
                    .foregroundColor(.secondary)
            }
        }
    }

    private func statusHeader(for episode: Episode) -> String {
        if isFailed(status: episode.status) {
            return "Episode failed"
        }
        if let status = episode.status, status.lowercased() == "ready" {
            return "Episode ready"
        }
        return "Episode in progress"
    }

    private func statusLabel(for status: String?) -> String {
        guard let status else { return "Queued" }
        return status.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func statusDescription(for status: String?) -> String {
        switch status?.lowercased() {
        case "queued":
            return "We queued your episode and are getting things ready."
        case "rewriting_queries":
            return "Polishing your topic prompts for better results."
        case "retrieving_content":
            return "Pulling in the latest info for your topics."
        case "generating_script":
            return "Writing your personalized Briefly script."
        case "generating_audio":
            return "Recording and stitching together the audio."
        case "ready":
            return "Your episode is ready in the library."
        case "failed":
            return "We hit a snag creating this episode."
        default:
            return "Creating your episode..."
        }
    }

    private func isFailed(status: String?) -> Bool {
        status?.lowercased() == "failed"
    }

    @ViewBuilder
    private func statusIcon(for episode: Episode) -> some View {
        switch episode.status?.lowercased() {
        case "ready":
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
                .font(.title3)
        case "failed":
            Image(systemName: "xmark.octagon.fill")
                .foregroundColor(.red)
                .font(.title3)
        default:
            ProgressView()
        }
    }

    private func topicDragIdentifier(for topic: Topic) -> String {
        topic.id?.uuidString ?? topic.originalText
    }

    private func topicRow(topic: Topic, isActive: Bool) -> some View {
        HStack(alignment: .center, spacing: 16) {
            GripDots()
                .padding(.trailing, 4)
            Button {
                editingTopic = topic
            } label: {
                Text(topic.originalText)
                    .lineLimit(2)
                    .truncationMode(.tail)
                    .foregroundColor(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            Spacer(minLength: 10)
            Button {
                Task {
                    if isActive {
                        await topicsViewModel.deactivateTopic(topic)
                    } else {
                        await topicsViewModel.activateTopic(topic)
                    }
                }
            } label: {
                Image(systemName: isActive ? "minus.circle" : "plus.circle.fill")
                    .foregroundStyle(isActive ? Color(.systemGray2) : Color.brieflyPrimary)
                    .font(.title3)
            }
            .buttonStyle(.borderless)
            .disabled(!isActive && !topicsViewModel.canAddActiveTopic)
        }
        .padding(.vertical, 8)
        .listRowInsets(EdgeInsets(top: 8, leading: 14, bottom: 8, trailing: 16))
        .listRowSeparator(.visible)
    }
}

private extension SetupView {
    @ViewBuilder
    var bannerView: some View {
        if let bannerMessage {
            ErrorBanner(
                message: bannerMessage,
                actionTitle: "Retry",
                action: { Task { await topicsViewModel.load() } },
                onDismiss: { hideBanner(message: bannerMessage) }
            )
            .transition(.move(edge: .top).combined(with: .opacity))
            .padding(.top, 8)
        }
    }

    func handleErrorChange(_ message: String?) {
        guard let message else {
            hideBanner()
            return
        }
        if topicsViewModel.topics.isEmpty && topicsViewModel.isLoading == false {
            hideBanner()
        } else {
            showBanner(message)
        }
    }

    func showBanner(_ message: String) {
        withAnimation {
            bannerMessage = message
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            hideBanner(message: message)
        }
    }

    func hideBanner(message: String? = nil) {
        guard message == nil || message == bannerMessage else { return }
        withAnimation {
            bannerMessage = nil
        }
    }

    @ViewBuilder
    var bottomActions: some View {
        VStack(spacing: 12) {
            Button {
                Task { await creationViewModel.generateEpisode() }
            } label: {
                generateEpisodeLabel
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .buttonStyle(.borderedProminent)
            .disabled(creationViewModel.hasActiveGeneration)

            if creationViewModel.hasActiveGeneration {
                Text("Finish the current episode before starting another.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let error = creationViewModel.errorMessage {
                InlineErrorText(message: error)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
        .shadow(color: Color.black.opacity(0.08), radius: 8, y: -2)
    }

    @ViewBuilder
    var generateEpisodeLabel: some View {
        if creationViewModel.hasActiveGeneration {
            HStack(spacing: 10) {
                ProgressView()
                Text("Creating episode...")
                    .font(.headline)
            }
        } else {
            Label("Generate episode", systemImage: "sparkles")
                .font(.headline)
        }
    }
}

@MainActor
final class EpisodeCreationViewModel: ObservableObject {
    @Published var inProgressEpisode: Episode?
    @Published var errorMessage: String?
    @Published var isGenerating: Bool = false

    private let episodeService: EpisodeProviding
    private var pollTask: Task<Void, Never>?
    private let pollInterval: UInt64 = 2_000_000_000

    init(episodeService: EpisodeProviding) {
        self.episodeService = episodeService
    }

    deinit {
        pollTask?.cancel()
    }

    var hasActiveGeneration: Bool {
        isGenerating || isEpisodeInFlight
    }

    private var isEpisodeInFlight: Bool {
        guard let status = inProgressEpisode?.status else { return false }
        return Self.isTerminal(status) == false
    }

    func generateEpisode() async {
        guard hasActiveGeneration == false else { return }
        errorMessage = nil
        isGenerating = true
        pollTask?.cancel()

        do {
            let creation = try await episodeService.requestEpisodeGeneration()
            let episode = try await episodeService.fetchEpisode(id: creation.episodeId)
            inProgressEpisode = episode
            beginPolling(for: creation.episodeId)
        } catch {
            errorMessage = error.localizedDescription
            isGenerating = false
            inProgressEpisode = nil
        }
    }

    func resumeInFlightIfNeeded() async {
        guard hasActiveGeneration == false else { return }
        errorMessage = nil

        do {
            let episodes = try await episodeService.fetchEpisodes()
            if let pending = episodes.first(where: { Self.isTerminal($0.status) == false }) {
                inProgressEpisode = pending
                isGenerating = true
                beginPolling(for: pending.id)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshCurrentEpisode() async {
        guard let current = inProgressEpisode else { return }
        errorMessage = nil
        do {
            let episode = try await episodeService.fetchEpisode(id: current.id)
            inProgressEpisode = episode
            if Self.isTerminal(episode.status) {
                isGenerating = false
            }
        } catch {
            errorMessage = error.localizedDescription
            isGenerating = false
        }
    }

    private func beginPolling(for episodeId: UUID) {
        pollTask?.cancel()
        let service = episodeService
        let interval = pollInterval
        pollTask = Task.detached { [weak self, service, interval] in
            guard let self else { return }

            while !Task.isCancelled {
                do {
                    let episode = try await service.fetchEpisode(id: episodeId)
                    let isDone = Self.isTerminal(episode.status)

                    await MainActor.run {
                        self.inProgressEpisode = episode
                        if isDone {
                            self.isGenerating = false
                        }
                    }

                    if isDone { break }
                    try await Task.sleep(nanoseconds: interval)
                } catch {
                    await MainActor.run {
                        self.errorMessage = error.localizedDescription
                        self.isGenerating = false
                    }
                    break
                }
            }
        }
    }

    nonisolated private static func isTerminal(_ status: String?) -> Bool {
        guard let status else { return false }
        switch status.lowercased() {
        case "ready", "failed":
            return true
        default:
            return false
        }
    }
}

private struct GripDots: View {
    private let dotSize: CGFloat = 3
    private let spacing: CGFloat = 3

    var body: some View {
        HStack(spacing: spacing) {
            ForEach(0..<2, id: \.self) { _ in
                VStack(spacing: spacing) {
                    ForEach(0..<3, id: \.self) { _ in
                        Circle()
                            .frame(width: dotSize, height: dotSize)
                    }
                }
            }
        }
        .foregroundColor(.secondary)
        .frame(width: (dotSize * 2) + spacing, alignment: .leading)
        .accessibilityHidden(true)
    }
}

@MainActor
private struct ActiveTopicDropDelegate: DropDelegate {
    let target: Topic
    @Binding var current: Topic?
    let viewModel: TopicsViewModel

    func dropEntered(info: DropInfo) {
        guard let current, current != target else { return }
        guard let fromIndex = viewModel.activeTopics.firstIndex(of: current),
              let toIndex = viewModel.activeTopics.firstIndex(of: target) else { return }

        let destination = toIndex > fromIndex ? toIndex + 1 : toIndex
        withAnimation {
            viewModel.reorderActiveTopicsInMemory(from: IndexSet(integer: fromIndex), to: destination)
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        guard current != nil else { return false }
        Task { await viewModel.persistActiveTopicOrder() }
        current = nil
        return true
    }
}
