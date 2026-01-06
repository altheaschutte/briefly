import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var appViewModel: AppViewModel
    @EnvironmentObject private var audioPlayer: AudioPlayerManager
    @StateObject private var viewModel: LibraryViewModel
    let safeAreaBottomPadding: CGFloat
    let namespace: Namespace.ID?
    let onSelectEpisode: (Episode) -> Void

    init(appViewModel: AppViewModel,
         safeAreaBottomPadding: CGFloat,
         namespace: Namespace.ID? = nil,
         onSelectEpisode: @escaping (Episode) -> Void) {
        _viewModel = StateObject(wrappedValue: LibraryViewModel(appViewModel: appViewModel))
        self.safeAreaBottomPadding = safeAreaBottomPadding
        self.namespace = namespace
        self.onSelectEpisode = onSelectEpisode
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {

                if let generating = viewModel.inProgressEpisode {
                    generatingCard(for: generating)
                } else if let latest = viewModel.latestEpisode {
                    latestEpisodeCard(for: latest)
                }

                let featuredID = featuredEpisodeID
                ForEach(viewModel.episodes.filter { $0.id != featuredID }) { episode in
                    Button {
                        onSelectEpisode(episode)
                    } label: {
                        EpisodeRow(episode: episode, namespace: namespace)
                    }
                    .buttonStyle(.plain)
                }

                if viewModel.isLoading && viewModel.episodes.isEmpty {
                    ProgressView("Loading your library…")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 24)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, safeAreaBottomPadding + 12)
        }
        .background(Color.brieflyBackground)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Library")
                    .font(.headline.weight(.semibold))
            }
        }
        .task {
            await viewModel.load()
        }
        .refreshable {
            await viewModel.load(force: true)
        }
        .overlay {
            if let error = viewModel.errorMessage, viewModel.episodes.isEmpty == true {
                FullScreenErrorView(
                    title: "Couldn't load your library",
                    message: error,
                    actionTitle: "Retry"
                ) {
                    Task { await viewModel.load(force: true) }
                }
            }
        }
    }

    private var featuredEpisodeID: UUID? {
        viewModel.inProgressEpisode?.id ?? viewModel.latestEpisode?.id
    }

    private var headerTitle: some View {
        Text("Library")
            .font(.title2.weight(.semibold))
            .foregroundColor(.brieflyTextPrimary)
            .padding(.bottom, 4)
    }

    private func latestEpisodeCard(for episode: Episode) -> some View {
        let coverSize: CGFloat = 108
        let maxPixelSize = Int(ceil(coverSize * UIScreen.main.scale))
        return Button {
            audioPlayer.play(episode: episode)
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .bottom, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Episode Ready".uppercased())
                            .font(.caption2.weight(.medium))
                            .foregroundColor(.brieflyTextMuted)
                            .tracking(1)

                        Text(episode.displayTitle)
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(.brieflyTextPrimary)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                    }

                    Spacer(minLength: 8)

                    coverImage(for: episode, maxPixelSize: maxPixelSize)
                        .frame(width: coverSize, height: coverSize)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .padding(.bottom, 4)
                }

                if let blurb = episodeSummary(for: episode) {
                    Text(blurb)
                        .font(.footnote)
                        .foregroundColor(.brieflyTextMuted)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                }

                EpisodePlaybackRow(episode: episode)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }

    private func generatingCard(for episode: Episode) -> some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text(inProgressStatusLabel(for: episode))
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(.brieflyTextMuted)
                    .tracking(1)

                Text("Generating Episode")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.brieflyTextPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                Text(episode.summary)
                    .font(.footnote)
                    .foregroundColor(.brieflyTextMuted)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            Spacer(minLength: 12)

            ProgressView()
                .progressViewStyle(.circular)
                .tint(.offBlack)
                .scaleEffect(1.1)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.brieflySurface)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func inProgressStatusLabel(for episode: Episode) -> String {
        switch episode.status?.lowercased() {
        case "queued":
            return "QUEUED"
        case "rewriting_queries":
            return "POLISHING TOPICS"
        case "retrieving_content":
            return "GATHERING SOURCES"
        case "generating_script":
            return "WRITING SCRIPT"
        case "generating_audio":
            return "READY IN A FEW MINUTES"
        default:
            return "READY SOON"
        }
    }

    private func coverImage(for episode: Episode, maxPixelSize _: Int? = nil) -> some View {
        ZStack {
            Color.brieflySurface

            if let url = episode.coverImageURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .empty, .failure:
                        coverPlaceholder
                    @unknown default:
                        coverPlaceholder
                    }
                }
            } else {
                coverPlaceholder
            }
        }
    }

    private var coverPlaceholder: some View {
        Image(systemName: "waveform.circle.fill")
            .font(.system(size: 32, weight: .semibold))
            .foregroundColor(Color.brieflySecondary)
    }

    private func episodeSummary(for episode: Episode) -> String? {
        let trimmedSummary = episode.summary.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedSummary.isEmpty == false {
            return trimmedSummary
        }
        let trimmedSubtitle = episode.subtitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedSubtitle.isEmpty ? nil : trimmedSubtitle
    }
}

struct EpisodePlaybackRow: View {
    let episode: Episode
    @EnvironmentObject private var playbackHistory: PlaybackHistory
    @EnvironmentObject private var audioPlayer: AudioPlayerManager

    var body: some View {
        let isCurrentlyPlaying = audioPlayer.isPlaying && audioPlayer.currentEpisode?.id == episode.id

        HStack(spacing: 8) {
            durationPill
            partialPlaybackStatus(isCurrentlyPlaying: isCurrentlyPlaying)
            if isCurrentlyPlaying == false, playbackHistory.isListened(episode.id) {
                listenedPill
            }
        }
    }

    private var durationPill: some View {
        let label = durationLabel(episode.durationSeconds ?? episode.durationDisplaySeconds)
        return HStack(spacing: 4) {
            Image(systemName: "play.fill")
                .font(.caption2.weight(.semibold))
            Text(label)
                .font(.caption.weight(.semibold))
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(Color.warmGrey)
        .foregroundColor(Color.gold)
        .clipShape(Capsule())
    }

    private var listenedPill: some View {
        HStack(spacing: 4) {
            Image(systemName: "checkmark")
                .font(.caption2.weight(.semibold))
            Text("Listened")
                .font(.caption.weight(.semibold))
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(Color.brieflyListenedBackground)
        .foregroundColor(Color.brieflyPrimary)
        .clipShape(Capsule())
    }

    @ViewBuilder
    private func partialPlaybackStatus(isCurrentlyPlaying: Bool) -> some View {
        let fallbackDuration = episode.durationSeconds ?? episode.durationDisplaySeconds
        if let remainingSeconds = playbackHistory.remainingSeconds(
            episodeID: episode.id,
            fallbackDurationSeconds: fallbackDuration
        ),
           let fraction = playbackHistory.partialPlaybackFraction(
               episodeID: episode.id,
               fallbackDurationSeconds: fallbackDuration
           ) {
            HStack(spacing: 8) {
                if isCurrentlyPlaying {
                    EqualizerWaveform(isAnimating: true, color: Color.gold, barCount: 4, minHeight: 4, maxHeight: 14, barWidth: 2, spacing: 2)
                        .accessibilityLabel("Playing")
                } else {
                    Text(remainingLabel(seconds: remainingSeconds))
                        .font(.caption.weight(.medium))
                        .foregroundColor(Color.gold)
                }

                PlaybackProgressBar(fraction: fraction, width: 64, height: 2)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                isCurrentlyPlaying
                ? "Playing. \(remainingLabel(seconds: remainingSeconds)) remaining"
                : "\(remainingLabel(seconds: remainingSeconds)) remaining"
            )
        }
    }

    private func durationLabel(_ seconds: Double?) -> String {
        guard let seconds, seconds.isFinite, seconds > 0 else { return "—" }
        let minutes = max(Int(round(seconds / 60)), 1)
        return "\(minutes)m"
    }

    private func remainingLabel(seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0 else { return "— min left" }
        let minutes = max(Int(ceil(seconds / 60)), 1)
        return minutes == 1 ? "1 min left" : "\(minutes) min left"
    }
}

private struct PlaybackProgressBar: View {
    let fraction: Double
    let width: CGFloat
    let height: CGFloat

    var body: some View {
        GeometryReader { proxy in
            let clampedFraction = min(max(fraction, 0), 1)
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: height / 2, style: .continuous)
                    .fill(Color.brieflyProgressTrackBackground)
                RoundedRectangle(cornerRadius: height / 2, style: .continuous)
                    .fill(Color.gold)
                    .frame(width: proxy.size.width * clampedFraction)
            }
        }
        .frame(width: width, height: height)
        .accessibilityHidden(true)
    }
}

private struct EqualizerWaveform: View {
    var isAnimating: Bool = true
    var color: Color = .brieflyAccentSoft
    var barCount: Int = 4
    var minHeight: CGFloat = 4
    var maxHeight: CGFloat = 14
    var barWidth: CGFloat = 2
    var spacing: CGFloat = 2

    var body: some View {
        TimelineView(.animation) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            HStack(alignment: .center, spacing: spacing) {
                ForEach(0..<max(barCount, 1), id: \.self) { index in
                    RoundedRectangle(cornerRadius: barWidth / 2, style: .continuous)
                        .frame(width: barWidth, height: barHeight(time: time, index: index))
                }
            }
            .foregroundColor(color)
            .frame(height: maxHeight, alignment: .center)
        }
    }

    private func barHeight(time: Double, index: Int) -> CGFloat {
        guard isAnimating else { return minHeight }
        let baseSpeed = 6.0
        let phase = Double(index) * 1.1
        let base = (sin(time * baseSpeed + phase) + 1) / 2
        let wobble = (sin(time * (baseSpeed * 0.63) + phase * 1.7) + 1) / 2
        let value = (base * 0.7 + wobble * 0.3)
        return minHeight + CGFloat(value) * (maxHeight - minHeight)
    }
}
