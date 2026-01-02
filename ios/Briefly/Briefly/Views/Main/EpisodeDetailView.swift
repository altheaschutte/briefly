import SwiftUI
import UIKit
import ImageIO

	struct EpisodeDetailView: View {
	    let episodeId: UUID
	    let onCreateEpisode: (() -> Void)?
	    @EnvironmentObject private var appViewModel: AppViewModel
	    @EnvironmentObject private var audioManager: AudioPlayerManager
	    @EnvironmentObject private var playbackHistory: PlaybackHistory
        @EnvironmentObject private var episodeGenerationStatus: EpisodeGenerationStatusCenter
	    @Environment(\.dismiss) private var dismiss
	    @Environment(\.openURL) private var openURL
    @State private var detailedEpisode: Episode
    @State private var segments: [EpisodeSegment]
    @State private var sources: [EpisodeSource]
    @State private var isLoading: Bool = false
    @State private var errorMessage: String?
    @State private var hasLoaded: Bool = false
    @State private var isShowingShareSheet: Bool = false
    @State private var shareItems: [Any] = []
    @State private var isDownloading: Bool = false
    @State private var showDeleteConfirmation: Bool = false
    @State private var actionAlert: ActionAlert?
    @State private var isDeleting: Bool = false
    @State private var scrollToScript: Bool = false
	    @State private var showActionsSheet: Bool = false
	    @State private var showSpeedSheet: Bool = false
	    @State private var actionsSheetDetent: PresentationDetent = .large
	    @State private var isCreatingDiveDeeper: Bool = false
	    @State private var creatingDiveDeeperSeedID: UUID?
	    @State private var queuedDiveDeeperSeedID: UUID?
	    @State private var queuedDiveDeeperTask: Task<Void, Never>?
	    @State private var requestedDiveDeeperSeedIDs = Set<UUID>()
	    @State private var createdDiveDeeperEpisode: Episode?
	    @State private var navigateToDiveDeeperEpisode: Bool = false

	    init(episodeId: UUID, initialEpisode: Episode? = nil, onCreateEpisode: (() -> Void)? = nil) {
	        self.episodeId = episodeId
	        self.onCreateEpisode = onCreateEpisode
	        let seed = initialEpisode ?? Episode(id: episodeId, title: "Episode", summary: "")
	        _detailedEpisode = State(initialValue: seed)
	        _segments = State(initialValue: seed.segments ?? [])
	        _sources = State(initialValue: seed.sources ?? [])
	    }

    init(episode: Episode, onCreateEpisode: (() -> Void)? = nil) {
        self.init(episodeId: episode.id, initialEpisode: episode, onCreateEpisode: onCreateEpisode)
    }

	    var body: some View {
	        ZStack {
	            NavigationLink(
	                destination: Group {
	                    if let createdDiveDeeperEpisode {
	                        EpisodeDetailView(episode: createdDiveDeeperEpisode, onCreateEpisode: onCreateEpisode)
	                    } else {
	                        EmptyView()
	                    }
	                },
	                isActive: $navigateToDiveDeeperEpisode
	            ) { EmptyView() }
	            .hidden()

	            ScrollViewReader { proxy in
	                ScrollView {
	                    VStack(alignment: .leading, spacing: 16) {
	                        header
	                        playbackControls
//                    actionRow
	                        diveDeeperSection
	                            .padding(.top, 8)
	                        if let script = scriptContent {
	                            scriptSection(title: script.title, body: script.body)
	                                .padding(.top, 8)
	                                .id(scriptSectionID)
	                        }
	                        if let topics = detailedEpisode.topics, topics.isEmpty == false {
	                            topicsSection(topics)
	                        }
	                        segmentsSection
	                        if let errorMessage {
	                            InlineErrorText(message: errorMessage)
	                                .padding(.top, 4)
	                            Button("Retry") {
	                                Task { await loadDetailsIfNeeded(force: true) }
	                            }
	                            .font(.footnote.weight(.semibold))
	                            .padding(.top, 2)
	                        }
	                    }
	                    .padding()
	                }
	                .onChange(of: scrollToScript) { target in
	                    guard target else { return }
	                    withAnimation {
	                        proxy.scrollTo(scriptSectionID, anchor: .top)
	                    }
	                    scrollToScript = false
	                }
	            }
	        }
	        .background(Color.brieflyBackground)
	        .navigationTitle("Episode")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showActionsSheet = true
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .imageScale(.large)
                        .accessibilityLabel("More actions")
                }
            }
	        }
	        .task(id: episodeId) {
	            await loadDetailsIfNeeded()
	        }
	        .onDisappear {
	            queuedDiveDeeperTask?.cancel()
	            queuedDiveDeeperTask = nil
	            queuedDiveDeeperSeedID = nil
	        }
        .safeAreaInset(edge: .bottom) {
            playerBarInset
        }
        .sheet(isPresented: $showSpeedSheet) {
            PlaybackSpeedSheet(selectedSpeed: audioManager.playbackSpeed) { speed in
                audioManager.setPlaybackSpeed(speed)
            }
            .presentationDetents([.medium, .large])
            .presentationCornerRadius(26)
            .presentationBackground(Color.brieflySurface)
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $isShowingShareSheet) {
            ShareSheet(activityItems: shareItems)
        }
        .sheet(isPresented: $showActionsSheet) {
            actionsSheet
                .presentationDetents([.medium, .large], selection: $actionsSheetDetent)
                .presentationCornerRadius(26)
                .presentationBackground(Color.brieflySurface)
                .presentationDragIndicator(.visible)
        }
        .onChange(of: showActionsSheet) { isShowing in
            if isShowing {
                actionsSheetDetent = .large
            }
        }
        .alert(item: $actionAlert) { alert in
            Alert(
                title: Text(alert.title),
                message: Text(alert.message),
                dismissButton: .default(Text("OK"))
            )
        }
        .confirmationDialog("Delete this episode?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task { await deleteEpisode() }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This will remove the episode and stop playback if it's playing.")
        }
    }
}

private extension EpisodeDetailView {
    var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            coverImageHero
                .padding(.bottom, 12)
            Text(detailedEpisode.displayTitle)
                .font(.title.bold())
            if let date = detailedEpisode.displayDate {
                Text(date.formatted(date: .abbreviated, time: .shortened))
                    .foregroundColor(.brieflyTextMuted)
            }
            summaryText
        }
    }

    var summaryText: some View {
        Text(detailedEpisode.summary)
            .foregroundColor(.primary)
            .multilineTextAlignment(.leading)
    }

    var coverImageHero: some View {
        let heroSize = min(UIScreen.main.bounds.width - 80, 260)

        return coverArtwork
            .frame(width: heroSize, height: heroSize)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: Color.black.opacity(0.18), radius: 22, x: 0, y: 14)
            .frame(maxWidth: .infinity)
    }

    var coverArtwork: some View {
        let heroSize = min(UIScreen.main.bounds.width - 80, 260)
        let maxPixelSize = Int(ceil(heroSize * UIScreen.main.scale))

        return ZStack {
            Color.brieflySurface

            if let url = detailedEpisode.coverImageURL {
                CachedAsyncImage(url: url, maxPixelSize: maxPixelSize) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    SkeletonBlock()
                } failure: {
                    fallbackArtwork
                }
            } else {
                fallbackArtwork
            }
        }
    }

    var fallbackArtwork: some View {
        Image(systemName: "waveform.circle.fill")
                .font(.system(size: 42, weight: .semibold))
                .foregroundColor(Color.brieflySecondary)
    }

    private var actionsSheet: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                actionsHeader

                Divider()
                    .overlay(Color.brieflyBorder)

                VStack(spacing: 10) {
                    ForEach(actionItems) { item in
                        actionRow(item)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 18)
            .padding(.top, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.brieflySurface)
    }

    private var actionsHeader: some View {
        HStack(alignment: .center, spacing: 12) {
            coverArtwork
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.brieflyBorder, lineWidth: 1)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(detailedEpisode.displayTitle)
                    .font(.headline)
                    .foregroundColor(.white)
                    .lineLimit(2)
                Text(detailedEpisode.subtitle)
                    .font(.subheadline)
                    .foregroundColor(.brieflyTextMuted)
                    .lineLimit(2)
            }
            Spacer()
        }
    }

    private func actionRow(_ item: EpisodeActionItem) -> some View {
        Button(role: item.role) {
            performActionAndDismiss(item.action)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: item.icon)
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 32, height: 32)
                    .foregroundColor(item.role == .destructive ? Color.brieflyDestructive : .white)
                    .background(
                        Circle()
                            .fill(Color.white.opacity(0.06))
                    )
                Text(item.title)
                    .font(.body.weight(.semibold))
                    .foregroundColor(item.role == .destructive ? Color.brieflyDestructive : .white)
                Spacer()
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(Color.white.opacity(0.04))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
        .disabled(item.isDisabled)
        .opacity(item.isDisabled ? 0.55 : 1)
    }

    private var actionItems: [EpisodeActionItem] {
        [
            EpisodeActionItem(id: "share", title: "Share episode", icon: "square.and.arrow.up", role: nil, isDisabled: false) {
                shareEpisode()
            },
//            EpisodeActionItem(id: "download", title: isDownloading ? "Downloading…" : "Download", icon: "arrow.down.circle", role: nil, isDisabled: isDownloading || detailedEpisode.audioURL == nil) {
//                downloadEpisode()
//            },
            EpisodeActionItem(id: "script", title: "View script", icon: "doc.text", role: nil, isDisabled: scriptContent == nil) {
                viewScript()
            },
            EpisodeActionItem(id: "feedback", title: "Feedback", icon: "ellipsis.bubble", role: nil, isDisabled: false) {
                sendFeedback()
            },
            EpisodeActionItem(id: "report", title: "Report", icon: "exclamationmark.bubble", role: nil, isDisabled: false) {
                reportEpisode()
            },
            EpisodeActionItem(id: "delete", title: "Delete", icon: "trash", role: .destructive, isDisabled: isDeleting) {
                showDeleteConfirmation = true
            }
        ]
    }

    private func performActionAndDismiss(_ action: @escaping () -> Void) {
        showActionsSheet = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
            action()
        }
    }

//    var actionRow: some View {
//        HStack(spacing: 12) {
//            secondaryActionButton(systemName: "note.text") // transcript
//            secondaryActionButton(systemName: "plus") // add/bookmark
//            secondaryActionButton(systemName: "square.and.arrow.up") // share
//            secondaryActionButton(systemName: "mic.fill") // talk to producer
//            secondaryActionButton(systemName: "ellipsis") // more
//        }
//        .frame(maxWidth: .infinity, alignment: .center)
//        .padding(.horizontal, 4)
//    }

    private var primaryPlayButton: some View {
        Button(action: togglePlayback) {
            Image(systemName: isCurrentlyPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 28, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 72, height: 72)
                .background(
                    Circle()
                        .fill(Color.brieflyPrimary)
                        .shadow(color: Color.black.opacity(0.12), radius: 10, x: 0, y: 6)
                )
        }
        .buttonStyle(.plain)
    }

    private var speedButton: some View {
        Button {
            showSpeedSheet = true
        } label: {
            Text(audioManager.playbackSpeed.playbackSpeedLabel)
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(.white)
                .frame(width: 44, height: 48)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Playback speed")
        .accessibilityValue(audioManager.playbackSpeed.playbackSpeedLabel)
    }

    var playbackControls: some View {
        VStack(spacing: 14) {
            playbackScrubber
            if UIDevice.current.userInterfaceIdiom == .phone {
                HStack(spacing: 24) {
                    skipButton(icon: "gobackward.10", direction: -10)
                    primaryPlayButton
                    skipButton(icon: "goforward.10", direction: 10)
                }
                .frame(maxWidth: .infinity)
                .overlay(alignment: .trailing) {
                    speedButton
                        .padding(.trailing, 4)
                }
            } else {
                HStack(spacing: 24) {
                    speedButton
                    skipButton(icon: "gobackward.10", direction: -10)
                    primaryPlayButton
                    skipButton(icon: "goforward.10", direction: 10)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var playbackScrubber: some View {
        VStack(spacing: 6) {
            Slider(value: Binding(
                get: { displayedProgress },
                set: { newValue in seek(toProgress: newValue) }
            ))
            .tint(.brieflyPrimary)
            HStack {
                Text(timeString(displayedCurrentTime))
                Spacer()
                Text(timeString(displayedDuration))
            }
            .font(.caption2)
            .foregroundColor(.brieflyTextMuted)
        }
    }

    private func skipButton(icon: String, direction: Double) -> some View {
        Button(action: { skip(seconds: direction) }) {
            Image(systemName: icon)
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(.primary)
                .frame(width: 48, height: 48)
                .background(
                    Circle()
                        .fill(Color.brieflySurface)
                )
        }
        .buttonStyle(.plain)
    }

    private func skip(seconds: Double) {
        let duration = displayedDuration
        let base = isDetailEpisodeCurrent ? audioManager.currentTimeSeconds : 0
        let clampedTarget: Double
        if duration > 0 {
            clampedTarget = max(0, min(base + seconds, duration))
        } else {
            clampedTarget = max(0, base + seconds)
        }
        if isDetailEpisodeCurrent {
            audioManager.seek(toSeconds: clampedTarget)
        } else {
            audioManager.play(episode: detailedEpisode, from: clampedTarget)
        }
    }

    private func secondaryActionButton(systemName: String) -> some View {
        Button(action: { /* TODO: Wire up action */ }) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.brieflyTextMuted)
                .frame(width: 36, height: 36)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    func showNotesSection(_ notes: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Show notes")
                .font(.headline)
            markdownText(notes)
                .font(.body)
                .foregroundColor(.brieflyTextMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
        .background(Color.brieflySurface)
        .cornerRadius(12)
    }

	    func topicsSection(_ topics: [Topic]) -> some View {
	        VStack(alignment: .leading, spacing: 8) {
	            Text("Topics")
	                .font(.headline)
	            ForEach(topics) { topic in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(topic.displayTitle)
                            .font(.body.bold())
                            .foregroundColor(.primary)
                        Text(topic.originalText)
                            .font(.body)
                            .foregroundColor(.brieflyTextMuted)
                            .lineLimit(2)
                            .truncationMode(.tail)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color.brieflySurface)
                    .cornerRadius(10)
	            }
	        }
	    }

	    private struct DiveDeeperDisplayItem: Identifiable {
	        let id: UUID
	        let seed: SegmentDiveDeeperSeed
	        let isUnlocked: Bool
	        let unlockTimeSeconds: Double?
	    }

	    private var diveDeeperSection: some View {
	        let items = diveDeeperDisplayItems()
	        return VStack(alignment: .leading, spacing: 10) {
	            HStack {
	                Text("Dive deeper")
	                    .font(.headline)
	            }

	            if items.isEmpty {
                    if isLoading && hasLoaded == false {
                        Text("Loading dive deeper items…")
                            .font(.footnote)
                            .foregroundColor(.brieflyTextMuted)
                    } else {
                        Text("No dive deeper items yet.")
                            .font(.footnote)
                            .foregroundColor(.brieflyTextMuted)
                    }
	            } else {
                    VStack(spacing: 12) {
                        ForEach(items) { item in
                            diveDeeperRow(item)
                        }
                    }
	            }
	        }
	    }

	    private func diveDeeperRow(_ item: DiveDeeperDisplayItem) -> some View {
            let isQueued = queuedDiveDeeperSeedID == item.seed.id
            let isSending = creatingDiveDeeperSeedID == item.seed.id
            let isRequested = requestedDiveDeeperSeedIDs.contains(item.seed.id)
            let isDisabled = item.isUnlocked == false || isQueued || isSending || isRequested

	        return Button {
	            guard item.isUnlocked else { return }
                guard isRequested == false else { return }
                queueDiveDeeperEpisode(seed: item.seed)
	        } label: {
	            HStack(alignment: .center, spacing: 12) {
                    Text(item.seed.title)
                        .font(.callout.weight(.regular))
                        .foregroundColor(.brieflyPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if isQueued || isSending || isRequested {
                        ProgressView()
                            .tint(.brieflyPrimary)
                    } else {
                        Image(systemName: "sparkles")
                            .font(.callout.weight(.semibold))
                            .foregroundColor(.brieflyPrimary)
                    }
	            }
                .contentShape(Rectangle())
	        }
	        .buttonStyle(.plain)
	        .disabled(isDisabled)
            .opacity(isDisabled ? 0.45 : 1)
	    }

    var segmentsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Segments")
                    .font(.headline)
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.8)
                }
            }
            if segments.isEmpty && isLoading {
                Text("Loading segments...")
                    .foregroundColor(.brieflyTextMuted)
            } else if segments.isEmpty {
                Text("No segments available yet.")
                    .foregroundColor(.brieflyTextMuted)
            } else {
                VStack(spacing: 10) {
                    ForEach(segments.sorted(by: { $0.orderIndex < $1.orderIndex })) { segment in
                        segmentCard(segment)
                    }
                }
            }
        }
    }

    func segmentCard(_ segment: EpisodeSegment) -> some View {
        let isActive = isSegmentActive(segment)
        return VStack(alignment: .leading, spacing: 10) {
            Button {
                playSegment(segment)
            } label: {
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 6) {
                        if segment.startTimeSeconds != nil || segment.durationSeconds != nil {
                            HStack(spacing: 6) {
                                if let start = segment.startTimeSeconds {
                                    Text(timeString(start))
                                }
                                if let duration = segment.durationSeconds {
                                    Text("• \(durationLabel(duration))")
                                }
                            }
                            .font(.caption)
                            .foregroundColor(.brieflyTextMuted)
                        }

                        Text(segment.title?.nonEmpty ?? "Segment \(segment.orderIndex + 1)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.primary)
                            .lineLimit(2)
                    }

                    Spacer()

                    Image(systemName: "play.circle.fill")
                        .font(.title3)
                        .foregroundColor(.brieflyPrimary)
                }
            }
            .buttonStyle(.plain)
            .contentShape(Rectangle())

            if segment.sources.isEmpty == false {
                sourcesList(segment.sources)
            } else {
                Text("Sources will appear here when available.")
                    .font(.footnote)
                    .foregroundColor(.brieflyTextMuted)
            }
        }
        .padding()
        .background(isActive ? Color.brieflySurface.opacity(0.9) : Color.brieflySurface)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isActive ? Color.brieflyPrimary.opacity(0.6) : Color.clear, lineWidth: 1.5)
        )
    }

    func scriptSection(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            markdownText(body)
                .font(.body)
                .foregroundColor(.brieflyTextMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
        .background(Color.brieflySurface)
        .cornerRadius(12)
    }

    func sourcesList(_ list: [EpisodeSource]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.element.id) { index, source in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "link")
                            .font(.caption)
                            .foregroundColor(.brieflyPrimary)
                            .padding(.top, 2)
                        if let url = source.url {
                            Link(destination: url) {
                                sourceLabel(for: source)
                                    .font(.footnote)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        } else {
                            sourceLabel(for: source)
                                .font(.footnote)
                                .lineLimit(1)
                                .truncationMode(.tail)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.vertical, 6)

                if index < list.count - 1 {
                    Divider()
                        .padding(.leading, 20)
                        .padding(.trailing, 4)
                }
            }
        }
    }

    private func sourceLabel(for source: EpisodeSource) -> Text {
        guard let host = source.displayHost else {
            return Text(source.displayTitle)
                .foregroundColor(.brieflyTextMuted)
        }

        let hostText = Text(host)
            .foregroundColor(.primary)

        guard let path = source.displayPath else {
            return hostText
        }

        let pathText = Text(path)
            .foregroundColor(Color.white.opacity(0.6))

        return hostText + pathText
    }

    @MainActor
    func loadDetailsIfNeeded(force: Bool = false) async {
        if hasLoaded && force == false { return }

        if force == false, let cached = await appViewModel.episodeService.cachedEpisode(id: episodeId) {
            applyEpisode(cached)
            hasLoaded = true
            errorMessage = nil
            return
        }

        isLoading = true
        defer { isLoading = false }
        do {
            let latest = try await appViewModel.episodeService.fetchEpisodeCached(id: episodeId, forceRefresh: force)
            applyEpisode(latest)
            errorMessage = nil
            hasLoaded = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func applyEpisode(_ episode: Episode) {
        detailedEpisode = episode
        segments = (episode.segments ?? []).sorted(by: { $0.orderIndex < $1.orderIndex })
        sources = episode.sources ?? []

        let status = episode.status?.lowercased()
        if status != "ready", status != "failed" {
            episodeGenerationStatus.trackEpisode(id: episode.id, status: episode.status)
        }
    }

    func togglePlayback() {
        if audioManager.currentEpisode?.id == detailedEpisode.id {
            if audioManager.isPlaying {
                audioManager.pause()
            } else {
                audioManager.resume()
            }
        } else {
            audioManager.play(episode: detailedEpisode)
        }
    }

    func playSegment(_ segment: EpisodeSegment) {
        guard let start = segment.startTimeSeconds else {
            audioManager.play(episode: detailedEpisode)
            return
        }
        audioManager.play(episode: detailedEpisode, from: start)
    }

    var isCurrentlyPlaying: Bool {
        audioManager.currentEpisode?.id == detailedEpisode.id && audioManager.isPlaying
    }

    private var isDetailEpisodeCurrent: Bool {
        audioManager.currentEpisode?.id == detailedEpisode.id
    }

    private var displayedDuration: Double {
        if isDetailEpisodeCurrent {
            let duration = audioManager.durationSeconds
            if duration.isFinite && duration > 0 {
                return duration
            }
        }
        return detailedEpisode.durationDisplaySeconds ?? 0
    }

    private var displayedCurrentTime: Double {
        if isDetailEpisodeCurrent {
            let current = audioManager.currentTimeSeconds
            return current.isFinite ? current : 0
        }
        return 0
    }

    private var displayedProgress: Double {
        let duration = displayedDuration
        guard duration > 0 else { return 0 }
        return max(0, min(displayedCurrentTime / duration, 1))
    }

    private func diveDeeperDisplayItems() -> [DiveDeeperDisplayItem] {
        let seeds = detailedEpisode.diveDeeperSeeds ?? []
        guard seeds.isEmpty == false else { return [] }

        let seedsBySegmentId: [UUID: SegmentDiveDeeperSeed] = Dictionary(
            uniqueKeysWithValues: seeds.compactMap { seed in
                guard let segmentId = seed.segmentId else { return nil }
                return (segmentId, seed)
            }
        )

        var ordered: [DiveDeeperDisplayItem] = []
        let orderedSegments = segments.sorted(by: { $0.orderIndex < $1.orderIndex })
        for segment in orderedSegments {
            guard let seed = seedsBySegmentId[segment.id] else { continue }
            ordered.append(
                DiveDeeperDisplayItem(
                    id: seed.id,
                    seed: seed,
                    isUnlocked: true,
                    unlockTimeSeconds: nil
                )
            )
        }

        let includedSegmentIds = Set(ordered.compactMap { $0.seed.segmentId })
        let remainingSeeds = seeds
            .filter { seed in
                guard let segmentId = seed.segmentId else { return true }
                return includedSegmentIds.contains(segmentId) == false
            }
            .sorted(by: { lhs, rhs in
                let left = lhs.position ?? Int.max
                let right = rhs.position ?? Int.max
                if left != right { return left < right }
                return lhs.title < rhs.title
            })

        for seed in remainingSeeds {
            ordered.append(
                DiveDeeperDisplayItem(
                    id: seed.id,
                    seed: seed,
                    isUnlocked: true,
                    unlockTimeSeconds: nil
                )
            )
        }

        return ordered
    }

    @MainActor
    private func createDiveDeeperEpisode(seed: SegmentDiveDeeperSeed) async {
        guard isCreatingDiveDeeper == false else { return }
        isCreatingDiveDeeper = true
        creatingDiveDeeperSeedID = seed.id
        defer {
            isCreatingDiveDeeper = false
            creatingDiveDeeperSeedID = nil
        }

        do {
            let creation = try await appViewModel.episodeService.requestDiveDeeperEpisode(
                parentEpisodeID: detailedEpisode.id,
                seedID: seed.id,
                targetDurationMinutes: nil
            )
            episodeGenerationStatus.trackEpisode(id: creation.episodeId, status: creation.status)
            requestedDiveDeeperSeedIDs.insert(seed.id)
            let created = try await appViewModel.episodeService.fetchEpisode(id: creation.episodeId)
            episodeGenerationStatus.trackEpisode(id: created.id, status: created.status)
            createdDiveDeeperEpisode = created
            navigateToDiveDeeperEpisode = true
        } catch {
            actionAlert = ActionAlert(title: "Couldn't create deep dive", message: error.localizedDescription)
        }
    }

    @MainActor
    fileprivate func queueDiveDeeperEpisode(seed: SegmentDiveDeeperSeed) {
        guard queuedDiveDeeperSeedID == nil else { return }
        guard requestedDiveDeeperSeedIDs.contains(seed.id) == false else { return }
        guard isCreatingDiveDeeper == false else { return }

        queuedDiveDeeperTask?.cancel()
        queuedDiveDeeperTask = nil

        queuedDiveDeeperSeedID = seed.id
        queuedDiveDeeperTask = Task { @MainActor in
            do {
                try await Task.sleep(nanoseconds: 5_000_000_000)
            } catch {
                return
            }
            guard queuedDiveDeeperSeedID == seed.id else { return }
            queuedDiveDeeperSeedID = nil
            queuedDiveDeeperTask = nil
            await createDiveDeeperEpisode(seed: seed)
        }
    }

    @MainActor
    fileprivate func cancelQueuedDiveDeeperEpisode() {
        queuedDiveDeeperTask?.cancel()
        queuedDiveDeeperTask = nil
        queuedDiveDeeperSeedID = nil
    }

    private func seek(toProgress progress: Double) {
        let duration = displayedDuration
        guard duration > 0 else {
            audioManager.play(episode: detailedEpisode)
            return
        }
        let clamped = max(0, min(progress, 1))
        let targetSeconds = clamped * duration
        if isDetailEpisodeCurrent {
            audioManager.seek(toSeconds: targetSeconds)
        } else {
            audioManager.play(episode: detailedEpisode, from: targetSeconds)
        }
    }

    func timeString(_ seconds: Double?) -> String {
        guard let seconds, seconds.isFinite else { return "--:--" }
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%02d:%02d", minutes, secs)
    }

    func durationLabel(_ seconds: Double) -> String {
        let minutes = max(Int(round(seconds / 60)), 1)
        return "\(minutes)m"
    }

    func markdownText(_ text: String) -> some View {
        let blocks = parseMarkdownBlocks(from: text)

        return VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .paragraph(let body):
                    markdownInline(body)
                case .list(let items):
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(items.indices, id: \.self) { index in
                            HStack(alignment: .top, spacing: 8) {
                                Text("•")
                                    .padding(.top, 2)
                                markdownInline(items[index])
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
            }
        }
    }

    func isSegmentActive(_ segment: EpisodeSegment) -> Bool {
        guard audioManager.currentEpisode?.id == detailedEpisode.id,
              let start = segment.startTimeSeconds else { return false }
        let end = start + (segment.durationSeconds ?? 0)
        let position = audioManager.currentTimeSeconds
        return position >= start && (segment.durationSeconds == nil || position < end)
    }

    var scriptContent: (title: String, body: String)? {
        if let notes = detailedEpisode.showNotes?.trimmingCharacters(in: .whitespacesAndNewlines),
           notes.isEmpty == false {
            return ("Show notes", notes)
        }
        if let transcript = detailedEpisode.transcript?.trimmingCharacters(in: .whitespacesAndNewlines),
           transcript.isEmpty == false {
            return ("Transcript", transcript)
        }
        return nil
    }

    func shareEpisode() {
        var items: [Any] = []
        if let url = detailedEpisode.audioURL {
            items.append(url)
        }
        items.append(detailedEpisode.displayTitle)
        items.append(detailedEpisode.subtitle)
        shareItems = items
        isShowingShareSheet = true
    }

    func downloadEpisode() {
        guard isDownloading == false else { return }
        isDownloading = true
        Task {
            defer { Task { @MainActor in isDownloading = false } }

            let audioURL: URL?
            if let direct = detailedEpisode.audioURL {
                audioURL = direct
            } else {
                audioURL = await appViewModel.episodeService.fetchSignedAudioURL(for: detailedEpisode.id)
            }

            guard let resolvedURL = audioURL else {
                await MainActor.run {
                    actionAlert = ActionAlert(title: "Download unavailable", message: "Audio is not ready yet.")
                }
                return
            }
            do {
                let (tempURL, _) = try await URLSession.shared.download(from: resolvedURL)
                let sanitized = sanitizedFileName(from: detailedEpisode.displayTitle)
                let destination = FileManager.default.temporaryDirectory.appendingPathComponent("\(sanitized).mp3")
                try? FileManager.default.removeItem(at: destination)
                try FileManager.default.moveItem(at: tempURL, to: destination)
                await MainActor.run {
                    shareItems = [destination]
                    isShowingShareSheet = true
                }
            } catch {
                await MainActor.run {
                    actionAlert = ActionAlert(title: "Download failed", message: error.localizedDescription)
                }
            }
        }
    }

    func viewScript() {
        guard scriptContent != nil else {
            actionAlert = ActionAlert(title: "No script yet", message: "Script will appear once the episode is ready.")
            return
        }
        scrollToScript = true
    }

    func sendFeedback() {
        let title = detailedEpisode.displayTitle
        let subject = "Feedback on \"\(title)\""
        openMail(subject: subject)
    }

    func reportEpisode() {
        let title = detailedEpisode.displayTitle
        let subject = "Report episode \"\(title)\""
        openMail(subject: subject)
    }

    func openMail(subject: String) {
        guard let encoded = subject.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "mailto:support@briefly.fm?subject=\(encoded)") else {
            actionAlert = ActionAlert(title: "Could not start email", message: "Mail app is not available.")
            return
        }
        openURL(url)
    }

    func deleteEpisode() async {
        guard isDeleting == false else { return }
        await MainActor.run { isDeleting = true }
        do {
            try await appViewModel.episodeService.deleteEpisode(id: detailedEpisode.id)
            await MainActor.run {
                if audioManager.currentEpisode?.id == detailedEpisode.id {
                    audioManager.stop()
                }
                appViewModel.prefetchedEpisodes?.removeAll { $0.id == detailedEpisode.id }
                isDeleting = false
                dismiss()
            }
        } catch {
            await MainActor.run {
                isDeleting = false
                actionAlert = ActionAlert(title: "Delete failed", message: error.localizedDescription)
            }
        }
    }

    func sanitizedFileName(from title: String) -> String {
        let invalid = CharacterSet.alphanumerics.union(.init(charactersIn: " _-")).inverted
        let cleaned = title.components(separatedBy: invalid).joined(separator: " ").replacingOccurrences(of: "  ", with: " ")
        return cleaned.isEmpty ? "episode" : cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var scriptSectionID: String { "script-section" }
}

private extension EpisodeDetailView {
    @ViewBuilder
    var playerBarInset: some View {
        let showsDiveDeeperUndo = queuedDiveDeeperSeedID != nil
        let showsPlayerBar = audioManager.currentEpisode?.id != nil && audioManager.currentEpisode?.id != detailedEpisode.id

        if showsDiveDeeperUndo || showsPlayerBar {
            VStack(spacing: 0) {
                if showsDiveDeeperUndo {
                    undoDiveDeeperButton
                }
                if showsPlayerBar {
                    PlayerBarView(onCreateEpisode: onCreateEpisode)
                        .padding(.vertical, 8)
                }
            }
            .background(Color.brieflyBackground)
            .shadow(color: Color.black.opacity(0.08), radius: 8, y: -2)
        }
    }

    private var undoDiveDeeperButton: some View {
        Button {
            cancelQueuedDiveDeeperEpisode()
        } label: {
            HStack(spacing: 10) {
                ProgressView()
                    .tint(.white)
                Text("Starting… Tap to undo")
            }
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.brieflySurface)
            .foregroundColor(.white)
            .tint(.white)
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .accessibilityLabel("Starting dive deeper. Tap to undo.")
    }

    func parseMarkdownBlocks(from text: String) -> [MarkdownBlock] {
        let lines = text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: .newlines)
        var blocks: [MarkdownBlock] = []
        var currentParagraph: [String] = []
        var currentList: [String] = []

        func flushParagraph() {
            guard currentParagraph.isEmpty == false else { return }
            blocks.append(.paragraph(currentParagraph.joined(separator: "\n")))
            currentParagraph.removeAll()
        }

        func flushList() {
            guard currentList.isEmpty == false else { return }
            blocks.append(.list(currentList))
            currentList.removeAll()
        }

        var inList = false

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.isEmpty {
                flushParagraph()
                flushList()
                inList = false
                continue
            }

            if let markerRange = line.range(of: #"^\s*([-*+])\s+"#, options: .regularExpression) {
                flushParagraph()
                inList = true
                let content = String(line[markerRange.upperBound...])
                currentList.append(content)
                continue
            }

            if inList {
                if var last = currentList.popLast() {
                    last.append("\n\(line)")
                    currentList.append(last)
                }
                continue
            }

            currentParagraph.append(line)
        }

        flushParagraph()
        flushList()
        return blocks
    }

    func markdownInline(_ text: String) -> some View {
        var options = AttributedString.MarkdownParsingOptions()
        options.interpretedSyntax = .inlineOnlyPreservingWhitespace  // keep breaks and links/emphasis
        options.failurePolicy = .returnPartiallyParsedIfPossible
        let attributed = (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
        return Text(attributed)
            .tint(.brieflyPrimary)
    }

    enum MarkdownBlock {
        case paragraph(String)
        case list([String])
    }
}

private extension String {
    var nonEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct EpisodeActionItem: Identifiable {
    let id: String
    let title: String
    let icon: String
    let role: ButtonRole?
    let isDisabled: Bool
    let action: () -> Void
}

struct ActionAlert: Identifiable {
    let id = UUID()
    let title: String
    let message: String
}

struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) { }
}

// Lightweight shared image cache so artwork doesn't re-download across screens.
final class SharedImageCache {
    static let shared = SharedImageCache()
    private let cache = NSCache<NSString, UIImage>()

    private init() {
        cache.countLimit = 128
    }

    func cacheKeyString(for url: URL, maxPixelSize: Int?) -> String {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url.absoluteString
        }
        components.query = nil
        components.fragment = nil
        let base = components.url?.absoluteString ?? url.absoluteString
        let suffix = maxPixelSize.map { "#px=\($0)" } ?? "#px=full"
        return "\(base)\(suffix)"
    }

    func image(for url: URL, maxPixelSize: Int?) -> UIImage? {
        cache.object(forKey: cacheKey(for: url, maxPixelSize: maxPixelSize))
    }

    func insert(_ image: UIImage, for url: URL, maxPixelSize: Int?) {
        cache.setObject(image, forKey: cacheKey(for: url, maxPixelSize: maxPixelSize))
    }

    private func cacheKey(for url: URL, maxPixelSize: Int?) -> NSString {
        cacheKeyString(for: url, maxPixelSize: maxPixelSize) as NSString
    }
}

final class ImageLoader: ObservableObject {
    @Published var image: UIImage?
    @Published var didFail = false
    private var currentCacheKey: String?
    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.requestCachePolicy = .useProtocolCachePolicy

        let cache = URLCache(
            memoryCapacity: 50 * 1024 * 1024,
            diskCapacity: 200 * 1024 * 1024,
            diskPath: "briefly-image-cache"
        )
        URLCache.shared = cache
        configuration.urlCache = cache

        return URLSession(configuration: configuration)
    }()

    @MainActor
    func load(url: URL?, maxPixelSize: Int?) async {
        let nextCacheKey = url.map { SharedImageCache.shared.cacheKeyString(for: $0, maxPixelSize: maxPixelSize) }
        if nextCacheKey == currentCacheKey, image != nil || didFail {
            return
        }
        currentCacheKey = nextCacheKey
        didFail = false

        guard let url else {
            image = nil
            return
        }

        if let cached = SharedImageCache.shared.image(for: url, maxPixelSize: maxPixelSize) {
            image = cached
            return
        }

        do {
            image = nil
            var request = URLRequest(url: url)
            request.cachePolicy = .returnCacheDataElseLoad
            let (data, _) = try await Self.session.data(for: request)
            guard Task.isCancelled == false else { return }
            guard let uiImage = Self.decodeImage(from: data, maxPixelSize: maxPixelSize) else {
                throw URLError(.cannotDecodeContentData)
            }
            SharedImageCache.shared.insert(uiImage, for: url, maxPixelSize: maxPixelSize)
            image = uiImage
        } catch {
            guard Task.isCancelled == false else { return }
            didFail = true
        }
    }

    private static func decodeImage(from data: Data, maxPixelSize: Int?) -> UIImage? {
        guard let maxPixelSize, maxPixelSize > 0 else {
            return UIImage(data: data)
        }

        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else {
            return nil
        }

        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}

struct CachedAsyncImage<Content: View, Placeholder: View, Failure: View>: View {
    let url: URL?
    var maxPixelSize: Int? = nil
    @ViewBuilder var content: (Image) -> Content
    @ViewBuilder var placeholder: () -> Placeholder
    @ViewBuilder var failure: () -> Failure

    @StateObject private var loader = ImageLoader()

    var body: some View {
        let cached = url.flatMap { SharedImageCache.shared.image(for: $0, maxPixelSize: maxPixelSize) }
        let taskID = url.map { SharedImageCache.shared.cacheKeyString(for: $0, maxPixelSize: maxPixelSize) } ?? "nil"

        Group {
            if let uiImage = loader.image ?? cached {
                content(Image(uiImage: uiImage))
            } else if loader.didFail {
                failure()
            } else {
                placeholder()
            }
        }
        .task(id: taskID) {
            await loader.load(url: url, maxPixelSize: maxPixelSize)
        }
    }
}
