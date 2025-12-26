import SwiftUI
import Combine

private enum TopicRoute: Hashable {
    case edit(Topic)
    case create
}

struct SetupView: View {
    @ObservedObject var topicsViewModel: TopicsViewModel
    @ObservedObject private var appViewModel: AppViewModel
    @StateObject private var creationViewModel: EpisodeCreationViewModel
    @Environment(\.openURL) private var openURL
    @Environment(\.undoManager) private var undoManager
    @State private var bannerMessage: String?
    @State private var editingTopic: Topic?
    @State private var showActiveLimitAlert: Bool = false

    init(topicsViewModel: TopicsViewModel, appViewModel: AppViewModel) {
        _topicsViewModel = ObservedObject(wrappedValue: topicsViewModel)
        _appViewModel = ObservedObject(wrappedValue: appViewModel)
        _creationViewModel = StateObject(
            wrappedValue: EpisodeCreationViewModel(
                episodeService: appViewModel.episodeService,
                entitlementsService: appViewModel.entitlementsService
            )
        )
    }

    var body: some View {
        List {
            createPageDescription

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
            Task { @MainActor in
                if let prefetched = appViewModel.prefetchedTopics {
                    topicsViewModel.applyPrefetchedTopics(prefetched)
                }

                if topicsViewModel.topics.isEmpty {
                    await topicsViewModel.load()
                } else {
                    await topicsViewModel.refreshEntitlements()
                }

                creationViewModel.updateLimitState(with: topicsViewModel.entitlements)
            }
            Task { await creationViewModel.resumeInFlightIfNeeded() }
        }
        .refreshable {
            await topicsViewModel.load()
            await MainActor.run {
                creationViewModel.updateLimitState(with: topicsViewModel.entitlements)
            }
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
        .onChange(of: topicsViewModel.entitlements) { entitlements in
            creationViewModel.updateLimitState(with: entitlements)
        }
        .onReceive(appViewModel.$prefetchedTopics.compactMap { $0 }) { topics in
            topicsViewModel.applyPrefetchedTopics(topics)
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
        .alert("Active topic limit reached", isPresented: $showActiveLimitAlert) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("You can have up to \(topicsViewModel.maxActiveTopics) active topics on your plan.")
        }
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

    private var createPageDescription: some View {
        Section {
            Text("Add up to \(topicsViewModel.maxActiveTopics) active topics for your podcast, then generate. We'll source the content and notify you when it's ready.")
                .font(.subheadline)
                .foregroundColor(.brieflyTextMuted)
                .padding(.vertical, 4)
        }
        .listRowBackground(Color.brieflyBackground)
        .listRowSeparator(.hidden)
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
                    let isFirst = topicsViewModel.activeTopics.first?.id == topic.id
                    let isLast = topicsViewModel.activeTopics.last?.id == topic.id
                    topicRow(topic: topic, isActive: true, isFirst: isFirst, isLast: isLast)
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

    private func topicRow(topic: Topic, isActive: Bool, isFirst: Bool = false, isLast: Bool = false) -> some View {
        let isInactiveAtLimit = !isActive && !topicsViewModel.canAddActiveTopic
        return HStack(alignment: .center, spacing: 16) {
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
            if isActive {
                VStack(spacing: 6) {
                    Button {
                        moveActiveTopic(topic, direction: .up)
                    } label: {
                        Image(systemName: "chevron.up")
                    }
                    .buttonStyle(.borderless)
                    .disabled(isFirst)
                    Button {
                        moveActiveTopic(topic, direction: .down)
                    } label: {
                        Image(systemName: "chevron.down")
                    }
                    .buttonStyle(.borderless)
                    .disabled(isLast)
                }
                .tint(.brieflyTextMuted)
            }
            Button {
                if isActive {
                    Task { await topicsViewModel.deactivateTopic(topic) }
                } else if topicsViewModel.canAddActiveTopic {
                    Task { await topicsViewModel.activateTopic(topic) }
                } else {
                    showActiveLimitAlert = true
                }
            } label: {
                Image(systemName: isActive ? "minus.circle" : "plus.circle.fill")
                    .foregroundStyle(
                        isActive
                        ? Color.brieflyAccentSoft
                        : (isInactiveAtLimit ? Color.brieflyTextMuted : Color.brieflyPrimary)
                    )
                    .font(.title3)
            }
            .buttonStyle(.borderless)
            .opacity(isInactiveAtLimit ? 0.5 : 1)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 8)
        .listRowInsets(EdgeInsets(top: 8, leading: 14, bottom: 8, trailing: 16))
        .listRowSeparator(.visible)
        .listRowBackground(Color.brieflySurface)
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task { await topicsViewModel.deleteTopic(topic, undoManager: undoManager) }
            } label: {
                Label("Delete", systemImage: "trash")
            }
            .tint(.brieflyDestructive)
        }
    }
}

private extension SetupView {
    enum MoveDirection {
        case up, down
    }

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

    func moveActiveTopic(_ topic: Topic, direction: MoveDirection) {
        guard let fromIndex = topicsViewModel.activeTopics.firstIndex(where: { isSame($0, as: topic) }) else { return }
        let count = topicsViewModel.activeTopics.count

        let destination: Int
        switch direction {
        case .up:
            destination = max(fromIndex - 1, 0)
        case .down:
            destination = min(count, fromIndex + 2)
        }

        withAnimation {
            topicsViewModel.reorderActiveTopicsInMemory(from: IndexSet(integer: fromIndex), to: destination)
        }
        Task { await topicsViewModel.persistActiveTopicOrder() }
    }

    func isSame(_ lhs: Topic, as rhs: Topic) -> Bool {
        if let l = lhs.id, let r = rhs.id {
            return l == r
        }
        return lhs.originalText == rhs.originalText
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
            if shouldShowManageAccount {
                openURL(APIConfig.manageAccountURL)
            } else {
                Task { await creationViewModel.generateEpisode() }
            }
        } label: {
            Label(generateButtonTitle, systemImage: generateButtonIcon)
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

    private var generateButtonTitle: String {
        shouldShowManageAccount ? "Manage account" : "Generate episode"
    }

    private var generateButtonIcon: String {
        shouldShowManageAccount ? "person.crop.circle" : "sparkles"
    }

    private var shouldShowManageAccount: Bool {
        (topicsViewModel.entitlements?.isGenerationUsageExhausted ?? false) || creationViewModel.isAtGenerationLimit
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
    @Published var isAtGenerationLimit: Bool = false

    private let episodeService: EpisodeProviding
    private let entitlementsService: EntitlementsProviding?
    private let targetPreference = TargetDurationPreference()
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
        isAtGenerationLimit = false
        isGenerating = true
        pollTask?.cancel()

        do {
            let duration = await preferredTargetDuration()
            let creation = try await episodeService.requestEpisodeGeneration(targetDurationMinutes: duration)
            let episode = try await episodeService.fetchEpisode(id: creation.episodeId)
            inProgressEpisode = episode
            beginPolling(for: creation.episodeId)
        } catch let apiError as APIError {
            switch apiError {
            case .statusCode(let code) where code == 403:
                errorMessage = "You've hit your plan limit. Manage your subscription on the web."
                isAtGenerationLimit = true
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

    private func preferredTargetDuration() async -> Int {
        let stored = targetPreference.value
        guard let entitlementsService else { return stored }
        do {
            let entitlements = try await entitlementsService.fetchEntitlements()
            return min(stored, entitlements.limits.maxEpisodeMinutes)
        } catch {
            return stored
        }
    }

    func updateLimitState(with entitlements: Entitlements?) {
        guard let entitlements else { return }
        isAtGenerationLimit = entitlements.isGenerationUsageExhausted
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
