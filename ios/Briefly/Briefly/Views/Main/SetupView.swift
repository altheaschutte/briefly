import SwiftUI
import Combine

enum TopicRoute: Hashable {
    case edit(Topic)
    case create
    case library
}

struct SetupView: View {
    @ObservedObject var topicsViewModel: TopicsViewModel
    @ObservedObject private var appViewModel: AppViewModel
    @StateObject private var creationViewModel: EpisodeCreationViewModel
    @Binding private var isShowingCreateBrief: Bool
    @EnvironmentObject private var episodeGenerationStatus: EpisodeGenerationStatusCenter
    @Environment(\.openURL) private var openURL
    @Environment(\.undoManager) private var undoManager
    @Environment(\.scenePhase) private var scenePhase
    @State private var bannerMessage: String?
    @State private var editingTopic: Topic?
    @State private var showActiveLimitAlert: Bool = false
    @State private var isShowingSeedSheet: Bool = false
    @State private var showsNavigationTitle: Bool = false
    @State private var scrollOffsetBaseline: CGFloat?

    init(topicsViewModel: TopicsViewModel, appViewModel: AppViewModel, isShowingCreateBrief: Binding<Bool>) {
        _topicsViewModel = ObservedObject(wrappedValue: topicsViewModel)
        _appViewModel = ObservedObject(wrappedValue: appViewModel)
        _creationViewModel = StateObject(
            wrappedValue: EpisodeCreationViewModel(
                episodeService: appViewModel.episodeService,
                entitlementsService: appViewModel.entitlementsService
            )
        )
        _isShowingCreateBrief = isShowingCreateBrief
    }

    var body: some View {
        List {
            BriefsScrollOffsetReader()
                .frame(height: 1)
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)

            briefsHeader

            if topicsViewModel.activeTopics.isEmpty {
                activeTopicsEmptyState
            } else {
                activeTopicsSection
            }

            actionButtonsSection
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .listRowBackground(Color.brieflyBackground)
        .background(Color.brieflyBackground)
        .coordinateSpace(name: BriefsScrollOffsetPreferenceKey.coordinateSpaceName)
        .onPreferenceChange(BriefsScrollOffsetPreferenceKey.self) { offset in
            let baseline = max(scrollOffsetBaseline ?? offset, offset)
            if baseline != scrollOffsetBaseline {
                scrollOffsetBaseline = baseline
            }

            let shouldShowTitle = offset < baseline - 8
            if shouldShowTitle != showsNavigationTitle {
                withAnimation(.easeInOut(duration: 0.15)) {
                    showsNavigationTitle = shouldShowTitle
                }
            }
        }
        .navigationTitle(showsNavigationTitle ? "Create Episode" : "")
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
        .sheet(isPresented: $isShowingSeedSheet) {
            NavigationStack {
                BriefSeedView(topicsViewModel: topicsViewModel)
            }
        }
        .onChange(of: topicsViewModel.errorMessage) { message in
            handleErrorChange(message)
        }
        .onChange(of: creationViewModel.errorMessage) { message in
            handleErrorChange(message)
        }
        .onChange(of: creationViewModel.inProgressEpisode) { _, episode in
            guard let episode else { return }
            let status = episode.status?.lowercased()
            if status != "ready", status != "failed" {
                episodeGenerationStatus.trackEpisode(id: episode.id, status: episode.status)
            }
        }
        .onChange(of: topicsViewModel.entitlements) { entitlements in
            creationViewModel.updateLimitState(with: entitlements)
        }
        .onReceive(appViewModel.$prefetchedTopics.compactMap { $0 }) { topics in
            topicsViewModel.applyPrefetchedTopics(topics)
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase != .active else { return }
            Task { await creationViewModel.fireQueuedGenerationIfNeeded() }
        }
        .navigationDestination(for: TopicRoute.self) { route in
            switch route {
            case .edit(let topic):
                TopicEditView(viewModel: topicsViewModel, topic: topic)
            case .create:
                CreateBriefView(topicsViewModel: topicsViewModel)
            case .library:
                BriefsLibraryView(topicsViewModel: topicsViewModel)
            }
        }
        .navigationDestination(isPresented: $isShowingCreateBrief) {
            CreateBriefView(topicsViewModel: topicsViewModel)
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                NavigationLink(value: TopicRoute.create) {
                    Image(systemName: "plus")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(Color.offBlack)
                }
                .tint(.offBlack)
                .accessibilityLabel("Create Brief")
            }
        }
        .overlay(alignment: .top) { bannerView }
        .overlay {
            if let message = topicsViewModel.errorMessage,
               topicsViewModel.topics.isEmpty,
               topicsViewModel.isLoading == false {
                FullScreenErrorView(
                    title: "Couldn't load your Briefs",
                    message: message,
                    actionTitle: "Retry"
                ) {
                    Task { await topicsViewModel.load() }
                }
            }
        }
        .background(Color.brieflyBackground)
        .alert("Active Brief limit reached", isPresented: $showActiveLimitAlert) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("You can have up to \(topicsViewModel.maxActiveTopics) active Briefs on your plan.")
        }
    }

    private var activeTopicsEmptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("No active Briefs yet.")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.brieflyTextPrimary)
            Text("Add a Brief to start generating episodes.")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(Color.brieflyTextSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Color.brieflyBackground)
    }

    private var briefsHeader: some View {
        VStack(alignment: .center, spacing: 10) {
            Text("Create Episode")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(Color.offBlack)

            Text("Select up to \(topicsViewModel.maxActiveTopics) briefs and generate your episode.")
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(Color.brieflyTextSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)

            Divider()
                .overlay(Color.mediumWarmGrey)
                .padding(.top, 8)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Color.brieflyBackground)
    }

    private var activeTopicsSection: some View {
        ForEach(topicsViewModel.activeTopics) { topic in
            topicRow(topic: topic, isActive: true)
        }
        .onMove { indexSet, destination in
            withAnimation {
                topicsViewModel.reorderActiveTopicsInMemory(from: indexSet, to: destination)
            }
            Task { await topicsViewModel.persistActiveTopicOrder() }
        }
    }

    private func generationProgressLabel(for status: String?) -> String {
        switch status?.lowercased() {
        case "queued":
            return "Queued…"
        case "rewriting_queries":
            return "Rewriting queries…"
        case "retrieving_content":
            return "Retrieving content…"
        case "generating_script":
            return "Generating script…"
        case "generating_audio":
            return "Generating audio…"
        default:
            return "Generating…"
        }
    }

    private func topicRow(topic: Topic, isActive: Bool) -> some View {
        let isInactiveAtLimit = !isActive && !topicsViewModel.canAddActiveTopic
        let classificationLabels = classificationLabels(from: topic.classificationShortLabel)

        return HStack(alignment: .top, spacing: 16) {
            Button {
                editingTopic = topic
            } label: {
                VStack(alignment: .leading, spacing: 8) {
                    Text(topic.displayTitle)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.brieflyTextPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(topic.originalText)
                        .font(.system(size: 15, weight: .regular))
                        .foregroundColor(.brieflyTextPrimary)
                        .lineLimit(3)
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
            .padding(.top, 4)
            .opacity(isInactiveAtLimit ? 0.5 : 1)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 12)
        .listRowInsets(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20))
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

    private var actionButtonsSection: some View {
        VStack(spacing: 12) {
            addBriefButton

            if creationViewModel.isGenerationQueued {
                undoGenerateEpisodeButton
            } else {
                generateEpisodeButton
            }

            if let error = creationViewModel.errorMessage {
                InlineErrorText(message: error)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Color.brieflyBackground)
    }

    private var addBriefButton: some View {
        NavigationLink(value: TopicRoute.library) {
            HStack(spacing: 12) {
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .semibold))
                Text("Add Briefs")
                    .font(.system(size: 17, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color.warmGrey)
            .foregroundColor(.offBlack)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add Brief")
    }

    private var generateEpisodeButton: some View {
        let isGenerateDisabled = creationViewModel.hasActiveGeneration
            || (!shouldShowManageAccount && hasActiveTopics == false)
        let isBusy = creationViewModel.hasActiveGeneration
        let backgroundColor: Color = isGenerateDisabled ? .mediumWarmGrey : .offBlack
        let foregroundColor: Color = {
            if isBusy { return .white }
            if isGenerateDisabled { return .brieflyTextMuted }
            return .white
        }()

        return Button {
            guard isGenerateDisabled == false else { return }
            if shouldShowManageAccount {
                openURL(APIConfig.manageAccountURL)
            } else {
                creationViewModel.queueEpisodeGeneration()
            }
        } label: {
            Group {
                if isBusy {
                    HStack(spacing: 10) {
                        BrieflySpinnerIcon()
                        Text(generationProgressLabel(for: creationViewModel.inProgressEpisode?.status))
                    }
                } else {
                    Label(generateButtonTitle, systemImage: generateButtonIcon)
                }
            }
            .font(.system(size: 17, weight: .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(backgroundColor)
            .foregroundColor(foregroundColor)
            .tint(foregroundColor)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isGenerateDisabled)
    }

    private struct BrieflySpinnerIcon: View {
        @State private var isAnimating = false

        var body: some View {
            Image("BrieflySpinner")
                .resizable()
                .scaledToFit()
                .frame(width: 18, height: 18)
                .rotationEffect(.degrees(isAnimating ? 360 : 0))
                .animation(.linear(duration: 0.9).repeatForever(autoreverses: false), value: isAnimating)
                .onAppear { isAnimating = true }
        }
    }

    private var undoGenerateEpisodeButton: some View {
        Button {
            creationViewModel.cancelQueuedGeneration()
        } label: {
            HStack(spacing: 10) {
                ProgressView()
                    .tint(.white)
                Text("Starting… Tap to undo")
            }
            .font(.system(size: 17, weight: .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color.darkerWarmGrey)
            .foregroundColor(.white)
            .tint(.white)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Starting episode generation. Tap to undo.")
    }

    private var generateButtonTitle: String {
        shouldShowManageAccount ? "Manage account" : "Generate Episode"
    }

    private var generateButtonIcon: String {
        shouldShowManageAccount ? "person.crop.circle" : "sparkles"
    }

    private var shouldShowManageAccount: Bool {
        (topicsViewModel.entitlements?.isGenerationUsageExhausted ?? false) || creationViewModel.isAtGenerationLimit
    }

    private var hasActiveTopics: Bool {
        topicsViewModel.activeTopics.isEmpty == false
    }

}

private struct BriefsScrollOffsetPreferenceKey: PreferenceKey {
    static let coordinateSpaceName = "briefsScroll"
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct BriefsScrollOffsetReader: View {
    var body: some View {
        GeometryReader { proxy in
            Color.clear.preference(
                key: BriefsScrollOffsetPreferenceKey.self,
                value: proxy.frame(in: .named(BriefsScrollOffsetPreferenceKey.coordinateSpaceName)).minY
            )
        }
    }
}

@MainActor
final class EpisodeCreationViewModel: ObservableObject {
    @Published var inProgressEpisode: Episode?
    @Published var errorMessage: String?
    @Published var isGenerating: Bool = false
    @Published var isAtGenerationLimit: Bool = false
    @Published var isGenerationQueued: Bool = false

    private let episodeService: EpisodeProviding
    private let entitlementsService: EntitlementsProviding?
    private let targetPreference = TargetDurationPreference()
    private var pollTask: Task<Void, Never>?
    private var queueTask: Task<Void, Never>?
    private var queuedPreviousEpisode: Episode?
    private var queuedPreviousErrorMessage: String?
    private let pollInterval: UInt64 = 2_000_000_000
    private let queueDelayNanoseconds: UInt64 = 5_000_000_000

    init(episodeService: EpisodeProviding, entitlementsService: EntitlementsProviding? = nil) {
        self.episodeService = episodeService
        self.entitlementsService = entitlementsService
    }

    deinit {
        pollTask?.cancel()
        queueTask?.cancel()
    }

    var hasActiveGeneration: Bool {
        isGenerating || isEpisodeInFlight
    }

    private var isEpisodeInFlight: Bool {
        guard let status = inProgressEpisode?.status else { return false }
        return Self.isTerminal(status) == false
    }

    func queueEpisodeGeneration() {
        guard hasActiveGeneration == false else { return }
        guard isGenerationQueued == false else { return }
        queuedPreviousEpisode = inProgressEpisode
        queuedPreviousErrorMessage = errorMessage

        errorMessage = nil
        isAtGenerationLimit = false

        inProgressEpisode = nil
        isGenerationQueued = true

        queueTask?.cancel()
        queueTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await Task.sleep(nanoseconds: self.queueDelayNanoseconds)
            } catch {
                return
            }
            await self.fireQueuedGenerationIfNeeded(cancelPendingDelay: false)
        }
    }

    func cancelQueuedGeneration() {
        guard isGenerationQueued else { return }
        queueTask?.cancel()
        queueTask = nil
        isGenerationQueued = false
        inProgressEpisode = queuedPreviousEpisode
        errorMessage = queuedPreviousErrorMessage
        queuedPreviousEpisode = nil
        queuedPreviousErrorMessage = nil
    }

    func fireQueuedGenerationIfNeeded(cancelPendingDelay: Bool = true) async {
        guard isGenerationQueued else { return }
        if cancelPendingDelay {
            queueTask?.cancel()
        }
        queueTask = nil
        isGenerationQueued = false
        queuedPreviousEpisode = nil
        queuedPreviousErrorMessage = nil
        await generateEpisode()
    }

    func generateEpisode() async {
        guard hasActiveGeneration == false else { return }
        errorMessage = nil
        isAtGenerationLimit = false
        isGenerating = true
        inProgressEpisode = nil
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
