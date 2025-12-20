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
    @State private var editingTopic: Topic?
    @State private var draggingTopic: Topic?

    init(topicsViewModel: TopicsViewModel, appViewModel: AppViewModel) {
        _topicsViewModel = ObservedObject(wrappedValue: topicsViewModel)
        _creationViewModel = StateObject(
            wrappedValue: EpisodeCreationViewModel(
                episodeService: appViewModel.episodeService,
                entitlementsService: appViewModel.entitlementsService
            )
        )
    }

    var body: some View {
        List {
            Section {
                PlanSummaryView(entitlements: topicsViewModel.entitlements ?? creationViewModel.entitlements)
            } header: {
                setupPaddedHeader("Plan & limits")
            }
            .listRowBackground(Color.brieflyBackground)

            if let episode = creationViewModel.inProgressEpisode,
               creationViewModel.hasActiveGeneration == false {
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
        .listRowBackground(Color.brieflyBackground)
        .background(Color.brieflyBackground)
        .navigationTitle("Create")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            Task { await topicsViewModel.load() }
            Task { await creationViewModel.resumeInFlightIfNeeded() }
            Task { await creationViewModel.refreshEntitlements() }
        }
        .refreshable {
            await topicsViewModel.load()
            await creationViewModel.refreshCurrentEpisode()
            await creationViewModel.refreshEntitlements()
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
        .background(Color.brieflyBackground)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Set up your Briefly")
                .font(.headline)
            Text("Add a few topics so we can personalize the episode we generate for you.")
                .foregroundColor(.brieflyTextMuted)
            Text("Use the + button above to add your first topic.")
                .foregroundColor(.brieflyTextMuted)
        }
        .padding(.vertical, 12)
    }

    private func creationStatusSection(episode: Episode) -> some View {
        Section(header: setupPaddedHeader(statusHeader(for: episode))) {
            statusCardContent(for: episode)
        }
        .listRowBackground(Color.brieflyBackground)
    }

   private var activeTopicsSection: some View {
    Section {
        if topicsViewModel.activeTopics.isEmpty {
                Text("No active topics yet.")
                    .foregroundColor(.brieflyTextMuted)
            } else {
                ForEach(topicsViewModel.activeTopics) { topic in
                    topicRow(topic: topic, isActive: true)
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
        } header: {
            setupPaddedHeader("Active topics")
        }
    .textCase(nil)
}

    private var inactiveTopicsSection: some View {
        Section {
            if topicsViewModel.inactiveTopics.isEmpty {
                Text("No inactive topics.")
                    .foregroundColor(.brieflyTextMuted)
            } else {
                ForEach(topicsViewModel.inactiveTopics) { topic in
                    topicRow(topic: topic, isActive: false)
                }
            }
        } header: {
            setupPaddedHeader("Inactive topics")
        } footer: {
            inactiveFooter
        }
        .textCase(nil)
        .listRowBackground(Color.brieflyBackground)
    }

    private var inactiveFooter: some View {
        Group {
            if !topicsViewModel.canAddActiveTopic && !topicsViewModel.inactiveTopics.isEmpty {
                Text("You can have up to \(topicsViewModel.maxActiveTopics) active topics.")
                    .foregroundColor(.brieflyTextMuted)
            }
        }
    }

    private func statusCardContent(for episode: Episode) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                statusIcon(for: episode)
                    .frame(width: 24, height: 24)
                VStack(alignment: .leading, spacing: 4) {
                    Text(statusTitle(for: episode))
                        .font(.headline)
                    Text(statusDescription(for: episode.status))
                        .font(.subheadline)
                        .foregroundColor(.brieflyTextMuted)
                }
                Spacer(minLength: 8)
            }

            if isFailed(status: episode.status), let error = episode.errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.footnote)
            }
        }
        .padding(.vertical, 6)
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

    private func statusTitle(for episode: Episode) -> String {
        if let status = episode.status?.lowercased(),
           status == "ready" || status == "failed" {
            let title = episode.displayTitle
            return title.isEmpty ? "Personalized episode" : title
        }

        if let number = episode.episodeNumber, number > 0 {
            return "Generating episode \(number)"
        }
        return "Generating episode"
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
            if isActive {
                GripDots()
                    .padding(.trailing, 4)
                    .contentShape(Rectangle())
                    .onDrag {
                        draggingTopic = topic
                        return NSItemProvider(object: NSString(string: topicDragIdentifier(for: topic)))
                    }
            }
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
                    .foregroundStyle(isActive ? Color.brieflyAccentSoft : Color.brieflyPrimary)
                    .font(.title3)
            }
            .buttonStyle(.borderless)
            .disabled(!isActive && !topicsViewModel.canAddActiveTopic)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 8)
        .listRowInsets(EdgeInsets(top: 8, leading: 14, bottom: 8, trailing: 16))
        .listRowSeparator(.visible)
        .listRowBackground(Color.brieflySurface)
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
            if creationViewModel.hasActiveGeneration {
                generationStatusBottomCard
            } else {
                generateEpisodeButton
            }

            if let error = creationViewModel.errorMessage {
                InlineErrorText(message: error)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.brieflyBackground)
        .shadow(color: Color.black.opacity(0.08), radius: 8, y: -2)
    }

    private var generateEpisodeButton: some View {
        Button {
            Task { await creationViewModel.generateEpisode() }
        } label: {
            Label("Generate episode", systemImage: "sparkles")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.brieflyPrimary)
                .foregroundColor(.white)
                .tint(.white)
                .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var generationStatusBottomCard: some View {
        if let episode = creationViewModel.inProgressEpisode {
            generationStatusCard(episode: episode)
        } else {
            generationStatusPlaceholder
        }
    }

    private func generationStatusCard(episode: Episode) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(statusHeader(for: episode))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.brieflyTextMuted)
            statusCardContent(for: episode)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.brieflySurface)
        .cornerRadius(12)
    }

    private var generationStatusPlaceholder: some View {
        HStack(spacing: 10) {
            ProgressView()
            Text("Creating episode...")
                .font(.headline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.brieflySurface)
        .cornerRadius(12)
    }
}

@MainActor
final class EpisodeCreationViewModel: ObservableObject {
    @Published var inProgressEpisode: Episode?
    @Published var errorMessage: String?
    @Published var isGenerating: Bool = false
    @Published var entitlements: Entitlements?

    private let episodeService: EpisodeProviding
    private let entitlementsService: EntitlementsProviding?
    private var pollTask: Task<Void, Never>?
    private let pollInterval: UInt64 = 2_000_000_000

    init(episodeService: EpisodeProviding, entitlementsService: EntitlementsProviding? = nil) {
        self.episodeService = episodeService
        self.entitlementsService = entitlementsService
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
        } catch let apiError as APIError {
            switch apiError {
            case .statusCode(let code) where code == 403:
                errorMessage = "You've hit your plan limit. Manage your subscription on the web."
            default:
                errorMessage = apiError.localizedDescription
            }
            isGenerating = false
            inProgressEpisode = nil
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

    func refreshEntitlements() async {
        guard let entitlementsService else { return }
        do {
            entitlements = try await entitlementsService.fetchEntitlements()
        } catch {
            // Keep silent; UI falls back to defaults.
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
        .foregroundColor(.brieflyTextMuted)
        .frame(width: (dotSize * 2) + spacing, alignment: .leading)
        .accessibilityHidden(true)
    }
}

private struct PlanSummaryView: View {
    let entitlements: Entitlements?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(planTitle)
                .font(.headline)
            Text(usageLine)
                .foregroundColor(.brieflyTextMuted)
            Text(limitsLine)
                .foregroundColor(.brieflyTextMuted)
            Text("Subscriptions can't be purchased in the app. Manage your plan on the web.")
                .font(.footnote)
                .foregroundColor(.brieflyTextMuted)
        }
        .padding(.vertical, 6)
    }

    private var planTitle: String {
        guard let entitlements else { return "Free plan" }
        return entitlements.tier.capitalized + " plan"
    }

    private var usageLine: String {
        guard let entitlements else { return "Usage resets monthly. You have 20 free minutes." }
        let used = entitlements.usedMinutes
        if let limit = entitlements.limitMinutes {
            return "\(used) of \(limit) minutes used this period"
        }
        return "\(used) minutes used this period"
    }

    private var limitsLine: String {
        guard let entitlements else { return "Max 1 active topic • Up to 5-minute episodes" }
        return "Max \(entitlements.limits.maxActiveTopics) active topics • Up to \(entitlements.limits.maxEpisodeMinutes)-minute episodes"
    }
}

private struct SetupSectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundColor(.brieflyTextMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
    }
}

private func setupPaddedHeader(_ title: String) -> some View {
    ZStack {
        Color.brieflyBackground
        SetupSectionHeader(title: title)
            .padding(.horizontal)
            .padding(.vertical, 6)
    }
    .listRowInsets(EdgeInsets())
}

private struct ActiveTopicDropDelegate: DropDelegate {
    let target: Topic
    @Binding var current: Topic?
    let viewModel: TopicsViewModel

    func validateDrop(info: DropInfo) -> Bool {
        info.hasItemsConforming(to: [UTType.text])
    }

    func dropEntered(info: DropInfo) {
        guard let current else { return }
        guard !isSame(current, as: target) else { return }
        guard let fromIndex = index(for: current),
              let toIndex = index(for: target) else { return }

        let destination = toIndex > fromIndex ? toIndex + 1 : toIndex
        withAnimation {
            viewModel.reorderActiveTopicsInMemory(from: IndexSet(integer: fromIndex), to: destination)
            if let updatedCurrent = viewModel.activeTopics.first(where: { isSame($0, as: current) }) {
                self.current = updatedCurrent
            }
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

    private func index(for topic: Topic) -> Int? {
        viewModel.activeTopics.firstIndex { isSame($0, as: topic) }
    }

    private func isSame(_ lhs: Topic, as rhs: Topic) -> Bool {
        if let l = lhs.id, let r = rhs.id {
            return l == r
        }
        return lhs.originalText == rhs.originalText
    }
}
