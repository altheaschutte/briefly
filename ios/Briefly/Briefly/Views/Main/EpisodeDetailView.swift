import SwiftUI
import UIKit

	struct EpisodeDetailView: View {
	    let episodeId: UUID
	    let onCreateEpisode: (() -> Void)?
        let usesCustomChrome: Bool
        let onScrollOffsetChange: ((CGFloat) -> Void)?
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
    @State private var dragPreviewProgress: Double?
	    @State private var showActionsSheet: Bool = false
	    @State private var showSpeedSheet: Bool = false
	    @State private var actionsSheetDetent: PresentationDetent = .fraction(0.5)
	    @State private var isCreatingDiveDeeper: Bool = false
	    @State private var creatingDiveDeeperSeedID: UUID?
	    @State private var queuedDiveDeeperSeedID: UUID?
	    @State private var queuedDiveDeeperTask: Task<Void, Never>?
	    @State private var requestedDiveDeeperSeedIDs = Set<UUID>()
	    @State private var createdDiveDeeperEpisode: Episode?
	    @State private var navigateToDiveDeeperEpisode: Bool = false

		    init(episodeId: UUID, initialEpisode: Episode? = nil, onCreateEpisode: (() -> Void)? = nil, usesCustomChrome: Bool = false, onScrollOffsetChange: ((CGFloat) -> Void)? = nil) {
		        self.episodeId = episodeId
		        self.onCreateEpisode = onCreateEpisode
                self.usesCustomChrome = usesCustomChrome
                self.onScrollOffsetChange = onScrollOffsetChange
		        let seed = initialEpisode ?? Episode(id: episodeId, title: "Episode", summary: "")
		        _detailedEpisode = State(initialValue: seed)
		        _segments = State(initialValue: seed.segments ?? [])
		        _sources = State(initialValue: seed.sources ?? [])
		    }

	    init(episode: Episode, onCreateEpisode: (() -> Void)? = nil, usesCustomChrome: Bool = false, onScrollOffsetChange: ((CGFloat) -> Void)? = nil) {
	        self.init(episodeId: episode.id, initialEpisode: episode, onCreateEpisode: onCreateEpisode, usesCustomChrome: usesCustomChrome, onScrollOffsetChange: onScrollOffsetChange)
	    }

	    var body: some View {
	        ZStack {
		            NavigationLink(
		                destination: Group {
		                    if let createdDiveDeeperEpisode {
		                        EpisodeDetailView(episode: createdDiveDeeperEpisode, onCreateEpisode: onCreateEpisode, onScrollOffsetChange: onScrollOffsetChange)
		                    } else {
		                        EmptyView()
		                    }
		                },
		                isActive: $navigateToDiveDeeperEpisode
		            ) { EmptyView() }
	            .hidden()

		            ScrollViewReader { proxy in
		                ScrollView {
                            scrollOffsetReader
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
		                    .padding(.horizontal, contentHorizontalPadding)
                            .padding(.top, 20)
                            .padding(.bottom, 32)
		                }
                        .coordinateSpace(name: scrollCoordinateSpace)
                        .onPreferenceChange(EpisodeDetailScrollOffsetKey.self) { offset in
                            onScrollOffsetChange?(offset)
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
	        .background(episodeDetailBackground.ignoresSafeArea())
	        .navigationTitle(usesCustomChrome ? "" : episodeTitle)
	        .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(episodeDetailBackground, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                if usesCustomChrome == false {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button(action: close) {
                            Image(systemName: "chevron.down")
                                .imageScale(.large)
                                .foregroundStyle(episodeDetailTextPrimary)
                                .accessibilityLabel("Close episode")
                        }
                    }

                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            showActionsSheet = true
                        } label: {
                            Image(systemName: "ellipsis")
                                .imageScale(.large)
                                .foregroundStyle(episodeDetailTextPrimary)
                                .accessibilityLabel("More actions")
                        }
                    }
                }
            }
            .toolbar(usesCustomChrome ? .hidden : .visible, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) {
                if usesCustomChrome {
                    customTopBar
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
        .safeAreaInset(edge: .bottom, spacing: 0) {
            playerBarInset
        }
        .brieflyHideTrayMiniPlayer(true)
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
                .presentationDetents([.fraction(0.5), .large], selection: $actionsSheetDetent)
                .presentationCornerRadius(26)
                .presentationBackground(episodeDetailBackground)
                .presentationDragIndicator(.visible)
        }
        .onChange(of: showActionsSheet) { isShowing in
            if isShowing {
                actionsSheetDetent = .fraction(0.5)
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
    private var episodeDetailBackground: Color { .brieflyDeepBackground }
    private var episodeDetailSurface: Color { .brieflyDarkSurface }
    private var episodeDetailTextPrimary: Color { .white }
    private var episodeDetailTextSecondary: Color { .white.opacity(0.6) }
    private var episodeDetailDivider: Color { .white.opacity(0.14) }
    private var contentHorizontalPadding: CGFloat { 16 }

    var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            coverImageHero
                .padding(.bottom, 16)
            if let date = detailedEpisode.displayDate {
                Text(episodeDateLabel(date).uppercased())
                    .font(.caption.weight(.semibold))
                    .foregroundColor(episodeDetailTextSecondary)
            }
            Text(detailedEpisode.displayTitle)
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(episodeDetailTextPrimary)
            summaryText
        }
    }

    var summaryText: some View {
        Text(detailedEpisode.summary)
            .font(.callout)
            .foregroundColor(episodeDetailTextSecondary)
            .multilineTextAlignment(.leading)
            .lineLimit(nil)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
    }

    var coverImageHero: some View {
        let heroSize = min(UIScreen.main.bounds.width - (contentHorizontalPadding * 2), 273)

        return coverArtwork
            .frame(width: heroSize, height: heroSize)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: Color.black.opacity(0.35), radius: 24, x: 0, y: 16)
            .frame(maxWidth: .infinity)
    }

	    var coverArtwork: some View {
	        let heroSize = min(UIScreen.main.bounds.width - (contentHorizontalPadding * 2), 273)
	        let maxPixelSize = Int(ceil(heroSize * UIScreen.main.scale))

	        return ZStack {
	            episodeDetailSurface

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
                .foregroundColor(episodeDetailTextSecondary)
    }

	    private var actionsSheet: some View {
	        ScrollView {
	            VStack(alignment: .leading, spacing: 16) {
	                actionsHeader

	                Divider()
	                    .overlay(episodeDetailDivider)

                VStack(spacing: 10) {
                    ForEach(actionItems) { item in
                        actionRow(item)
                    }
                }
            }
            .padding(.horizontal, contentHorizontalPadding)
            .padding(.bottom, 18)
            .padding(.top, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(episodeDetailBackground)
	    }

	    private var actionsHeader: some View {
	        VStack(alignment: .leading, spacing: 4) {
	            Text(detailedEpisode.displayTitle)
	                .font(.headline)
	                .foregroundColor(episodeDetailTextPrimary)
	                .lineLimit(2)
	            Text(detailedEpisode.subtitle)
	                .font(.subheadline)
	                .foregroundColor(episodeDetailTextSecondary)
	                .lineLimit(2)
	        }
	        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func actionRow(_ item: EpisodeActionItem) -> some View {
        Button(role: item.role) {
            performActionAndDismiss(item.action)
        } label: {
	            HStack(spacing: 12) {
	                Image(systemName: item.icon)
	                    .font(.system(size: 18, weight: .semibold))
	                    .frame(width: 32, height: 32)
	                    .foregroundColor(item.role == .destructive ? Color.brieflyDestructive : episodeDetailTextPrimary)
	                    .background(
	                        Circle()
	                            .fill(episodeDetailSurface)
	                    )
	                Text(item.title)
	                    .font(.body.weight(.semibold))
	                    .foregroundColor(item.role == .destructive ? Color.brieflyDestructive : episodeDetailTextPrimary)
	                Spacer()
	            }
	            .padding(.vertical, 10)
	            .padding(.horizontal, 12)
	            .background(episodeDetailSurface)
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
	                .font(.system(size: 22, weight: .semibold))
	                .foregroundColor(.black)
	                .frame(width: 56, height: 56)
	                .background(
	                    Circle()
	                        .fill(.white)
	                        .shadow(color: Color.black.opacity(0.18), radius: 12, x: 0, y: 8)
	                )
	        }
	        .buttonStyle(.plain)
	    }

	    private var speedButton: some View {
	        Button {
	            showSpeedSheet = true
	        } label: {
	            Text(audioManager.playbackSpeed.playbackSpeedLabel)
	                .font(.system(size: 16, weight: .medium))
	                .foregroundColor(episodeDetailTextPrimary)
	        }
	        .buttonStyle(.plain)
	        .accessibilityLabel("Playback speed")
	        .accessibilityValue(audioManager.playbackSpeed.playbackSpeedLabel)
	    }

	    var playbackControls: some View {
	        VStack(spacing: 10) {
	            waveformScrubber
                HStack {
                    Text(timeString(displayedCurrentTime))
                    Spacer()
                    Text(timeString(displayedDuration))
                }
                .font(.caption2)
                .foregroundColor(episodeDetailTextSecondary)

                HStack(alignment: .center, spacing: 22) {
                    speedButton
                        .frame(width: 44, alignment: .leading)
                    Spacer()
                    skipButton(systemName: "gobackward.15", direction: -15, accessibilityLabel: "Back 15 seconds")
                    primaryPlayButton
                    skipButton(systemName: "goforward.15", direction: 15, accessibilityLabel: "Forward 15 seconds")
                    Spacer()
                    Color.clear.frame(width: 44)
                }
        }
	        .frame(maxWidth: .infinity)
	    }

        private var waveformScrubber: some View {
            EpisodeWaveformScrubber(
                progress: waveformDisplayProgress,
                activeColor: waveformActiveColor,
                inactiveColor: waveformInactiveColor,
                onScrubChanged: { newValue in
                    dragPreviewProgress = max(0, min(newValue, 1))
                },
                onScrubEnded: finishScrubIfNeeded
            )
        }

        private var waveformDisplayProgress: Double {
            max(0, min(dragPreviewProgress ?? displayedProgress, 1))
        }

        private var waveformActiveColor: Color { .brieflyPrimary }
        private var waveformInactiveColor: Color { episodeDetailTextSecondary.opacity(0.45) }

        private func finishScrubIfNeeded() {
            guard let target = dragPreviewProgress else { return }
            dragPreviewProgress = nil
            seek(toProgress: target)
        }

	    private func skipButton(systemName: String, direction: Double, accessibilityLabel: String) -> some View {
	        Button(action: { skip(seconds: direction) }) {
                Image(systemName: systemName)
                    .font(.system(size: 26, weight: .regular))
                    .foregroundStyle(episodeDetailTextSecondary)
                    .frame(width: 44, height: 44)
	                .contentShape(Rectangle())
	        }
	        .buttonStyle(.plain)
	        .accessibilityLabel(accessibilityLabel)
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
                .foregroundColor(episodeDetailTextSecondary)
                .frame(width: 36, height: 36)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    func showNotesSection(_ notes: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Show notes")
                .font(.headline)
                .foregroundColor(episodeDetailTextPrimary)
            markdownText(notes)
                .font(.body)
                .foregroundColor(episodeDetailTextSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

	    func topicsSection(_ topics: [Topic]) -> some View {
	        VStack(alignment: .leading, spacing: 8) {
	            Text("Topics")
	                .font(.headline)
                    .foregroundColor(episodeDetailTextPrimary)
	            ForEach(topics) { topic in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(topic.displayTitle)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(episodeDetailTextPrimary)
                        Text(topic.originalText)
                            .font(.system(size: 15))
                            .foregroundColor(episodeDetailTextPrimary)
                            .lineLimit(2)
                            .truncationMode(.tail)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 18)
                    .background(episodeDetailSurface)
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
	                Text("Dive Deeper")
	                    .font(.headline)
                        .foregroundColor(episodeDetailTextPrimary)
	            }

	            if items.isEmpty {
                    if isLoading && hasLoaded == false {
                        Text("Loading dive deeper items…")
                            .font(.footnote)
                            .foregroundColor(episodeDetailTextSecondary)
                    } else {
                        Text("No dive deeper items yet.")
                            .font(.footnote)
                            .foregroundColor(episodeDetailTextSecondary)
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
                        .foregroundColor(episodeDetailTextPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if isQueued || isSending || isRequested {
                        ProgressView()
                            .tint(episodeDetailTextPrimary)
                    } else {
                        Image(systemName: "sparkles")
                            .font(.callout.weight(.semibold))
                            .foregroundColor(episodeDetailTextPrimary)
                    }
	            }
	        }
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(episodeDetailSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
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
                    .foregroundColor(episodeDetailTextSecondary)
            } else if segments.isEmpty {
                Text("No segments available yet.")
                    .foregroundColor(episodeDetailTextSecondary)
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
                            .foregroundColor(episodeDetailTextSecondary)
                        }

                        Text(segment.title?.nonEmpty ?? "Segment \(segment.orderIndex + 1)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(episodeDetailTextPrimary)
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
                    .foregroundColor(episodeDetailTextSecondary)
            }
        }
        .padding()
        .background(episodeDetailSurface)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isActive ? Color.brieflyPrimary : Color.clear, lineWidth: 1.5)
        )
    }

    func scriptSection(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundColor(episodeDetailTextPrimary)
            markdownText(body)
                .font(.body)
                .foregroundColor(episodeDetailTextSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
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
                .foregroundColor(episodeDetailTextSecondary)
        }

        let hostText = Text(host)
            .foregroundColor(episodeDetailTextPrimary)

        guard let path = source.displayPath else {
            return hostText
        }

        let pathText = Text(path)
            .foregroundColor(episodeDetailTextSecondary)

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
        let totalSeconds = max(0, Int(seconds.rounded(.down)))
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let secs = totalSeconds % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }

    func durationLabel(_ seconds: Double) -> String {
        let minutes = max(Int(round(seconds / 60)), 1)
        return "\(minutes)m"
    }

    func episodeDateLabel(_ date: Date) -> String {
        if Calendar.current.isDateInToday(date) { return "Today" }
        if Calendar.current.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(date: .abbreviated, time: .omitted)
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
	                close()
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
        private var scrollCoordinateSpace: String { "episode-detail-scroll" }

        private var scrollOffsetReader: some View {
            GeometryReader { proxy in
                Color.clear.preference(
                    key: EpisodeDetailScrollOffsetKey.self,
                    value: proxy.frame(in: .named(scrollCoordinateSpace)).minY
                )
            }
            .frame(height: 0)
        }

    private var episodeTitle: String {
        if let number = detailedEpisode.episodeNumber {
            return "Episode \(number)"
        }
        return "Episode"
    }

	    private func close() {
	        if appViewModel.presentedEpisode != nil {
	            appViewModel.dismissEpisodeDetail()
	        } else {
	            dismiss()
	        }
	    }

	        private var customTopBar: some View {
	            HStack(spacing: 12) {
                Button(action: close) {
                    Image(systemName: "chevron.down")
                        .imageScale(.large)
                        .foregroundStyle(episodeDetailTextPrimary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                        .accessibilityLabel("Close episode")
                }
                .buttonStyle(.plain)

                Text(episodeTitle)
                    .font(.headline)
                    .foregroundColor(episodeDetailTextPrimary)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .center)

                Button {
                    showActionsSheet = true
                } label: {
                    Image(systemName: "ellipsis")
                        .imageScale(.large)
                        .foregroundStyle(episodeDetailTextPrimary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                        .accessibilityLabel("More actions")
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, contentHorizontalPadding)
            .frame(maxWidth: .infinity)
            .background(episodeDetailBackground)
        }
		}

private struct EpisodeDetailScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct EpisodeWaveformScrubber: View {
    let progress: Double
    let activeColor: Color
    let inactiveColor: Color
    let onScrubChanged: (Double) -> Void
    let onScrubEnded: () -> Void

    // Derived from branding/fake-waveform.svg to match the desired bar profile.
    private let barHeights: [CGFloat] = [
        2, 8, 14, 4, 16, 14, 10, 10, 10, 14, 10, 16, 10, 4, 8, 2, 8, 14, 4, 20,
        14, 10, 10, 10, 18, 10, 20, 10, 4, 2, 2, 8, 14, 4, 16, 14, 10, 10, 10, 14,
        10, 16, 10, 4, 9, 2, 8, 14, 4, 16, 14, 10, 10, 10, 14, 10, 16, 10, 4, 2
    ]
    private let maxBarHeight: CGFloat = 20
    private let barSpacing: CGFloat = 4

    var body: some View {
        GeometryReader { proxy in
            let width = max(proxy.size.width, 1)
            let height = max(proxy.size.height, 1)
            let barWidth = max(2, (width - (CGFloat(barHeights.count - 1) * barSpacing)) / CGFloat(barHeights.count))
            let clampedProgress = progress.clamped(to: 0...1)
            let activeFill = LinearGradient(
                colors: [activeColor, activeColor.opacity(0.9)],
                startPoint: .leading,
                endPoint: .trailing
            )
            let inactiveFill = inactiveColor.opacity(0.75)

            ZStack(alignment: .leading) {
                bars(width: barWidth, height: height, fill: inactiveFill)

                bars(width: barWidth, height: height, fill: activeFill)
                    .mask(alignment: .leading) {
                        Rectangle()
                            .frame(width: width * CGFloat(clampedProgress))
                    }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let x = max(0, min(value.location.x, width))
                        let newProgress = Double(x / width)
                        onScrubChanged(newProgress)
                    }
                    .onEnded { _ in
                        onScrubEnded()
                    }
            )
        }
        .frame(height: 34)
        .padding(.vertical, 0)
        .accessibilityElement()
        .accessibilityLabel("Playback position")
        .accessibilityValue("\(Int(progress.clamped(to: 0...1) * 100)) percent")
        .accessibilityAdjustableAction { direction in
            let step = 0.05
            switch direction {
            case .increment:
                onScrubChanged(min(progress + step, 1))
                onScrubEnded()
            case .decrement:
                onScrubChanged(max(progress - step, 0))
                onScrubEnded()
            default:
                break
            }
        }
    }

    @ViewBuilder
    private func bars<S: ShapeStyle>(width: CGFloat, height: CGFloat, fill: S) -> some View {
        HStack(alignment: .center, spacing: barSpacing) {
            ForEach(Array(barHeights.enumerated()), id: \.offset) { _, barHeight in
                Capsule(style: .continuous)
                    .frame(
                        width: width,
                        height: max(4, height * (barHeight / maxBarHeight))
                    )
            }
        }
        .foregroundStyle(fill)
        .animation(.easeInOut(duration: 0.15), value: progress)
    }
}

private extension EpisodeDetailView {
    @ViewBuilder
    var playerBarInset: some View {
        if queuedDiveDeeperSeedID != nil {
            undoDiveDeeperButton
                .background(episodeDetailBackground)
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
            .background(Color.darkerWarmGrey)
            .foregroundColor(.white)
            .tint(.white)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, contentHorizontalPadding)
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

private extension Double {
    func clamped(to range: ClosedRange<Double>) -> Double {
        min(max(self, range.lowerBound), range.upperBound)
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
