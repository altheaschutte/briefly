import SwiftUI

struct EpisodesView: View {
    @ObservedObject var viewModel: EpisodesViewModel
    @EnvironmentObject private var audioManager: AudioPlayerManager
    @EnvironmentObject private var appViewModel: AppViewModel
    @State private var bannerMessage: String?

    var body: some View {
        List {
            ForEach(viewModel.sections) { section in
                Section(header: Text(section.title)) {
                    ForEach(section.episodes) { episode in
                        Button {
                            appViewModel.presentEpisodeDetail(episode)
                        } label: {
                            EpisodeRow(episode: episode)
                        }
                        .buttonStyle(.plain)
                        .listRowSeparator(.hidden)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                deleteEpisode(episode)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            .tint(.brieflyDestructive)
                        }
                    }
                }
            }
        }
        .navigationTitle("Episodes")
        .onAppear {
            Task { await viewModel.load() }
        }
        .refreshable {
            await viewModel.load(force: true)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .listSectionSeparator(.hidden)
        .overlay(alignment: .top) { bannerView }
        .overlay {
            if let message = viewModel.errorMessage, viewModel.episodes.isEmpty {
                FullScreenErrorView(
                    title: "Couldn't load episodes",
                    message: message,
                    actionTitle: "Retry",
                    action: { Task { await viewModel.load(force: true) } }
                )
                .transition(.opacity)
            }
        }
        .onChange(of: viewModel.errorMessage) { newValue in
            handleErrorChange(newValue)
        }
        .background(Color.brieflyBackground)
    }
}

private struct EpisodeRow: View {
    let episode: Episode
    @EnvironmentObject private var playbackHistory: PlaybackHistory
    @EnvironmentObject private var audioManager: AudioPlayerManager

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(episode.displayDateLabel)
                        .font(.caption.weight(.medium))
                        .foregroundColor(.brieflyTextMuted)
                    Text(episode.displayTitle)
                        .font(.callout.weight(.semibold))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                    Text(episode.subtitle)
                        .font(.footnote)
                        .foregroundColor(.brieflyTextMuted)
                        .lineLimit(2)
                }
                Spacer(minLength: 8)
                artwork
            }

            pillRow
        }
        .padding(.vertical, 14)
    }

	    private var artwork: some View {
	        ZStack {
	            RoundedRectangle(cornerRadius: 16)
	                .fill(Color.brieflySurface)
	            if let url = episode.coverImageURL {
	                CachedAsyncImage(url: url, maxPixelSize: Int(ceil(72 * UIScreen.main.scale))) { image in
	                    image
	                        .resizable()
	                        .scaledToFill()
	                        .frame(width: 72, height: 72)
	                } placeholder: {
	                    fallbackArtwork.opacity(0.25)
	                } failure: {
	                    fallbackArtwork
                }
            } else {
                fallbackArtwork
            }
	        }
	        .frame(width: 72, height: 72)
	        .clipShape(RoundedRectangle(cornerRadius: 16))
	    }

    private var fallbackArtwork: some View {
        Image(systemName: "waveform.circle.fill")
            .font(.system(size: 28, weight: .semibold))
            .foregroundColor(Color.brieflySecondary)
    }

    private var durationPill: some View {
        let label = durationLabel(episode.durationDisplaySeconds)
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

    private var pillRow: some View {
        let isCurrentlyPlaying = audioManager.isPlaying && audioManager.currentEpisode?.id == episode.id
        return HStack(spacing: 8) {
            durationPill
            partialPlaybackStatus(isCurrentlyPlaying: isCurrentlyPlaying)
            if isCurrentlyPlaying == false, playbackHistory.isListened(episode.id) {
                listenedPill
            }
        }
    }

    @ViewBuilder
    private func partialPlaybackStatus(isCurrentlyPlaying: Bool) -> some View {
        if let remainingSeconds = playbackHistory.remainingSeconds(episodeID: episode.id, fallbackDurationSeconds: episode.durationDisplaySeconds),
           let fraction = playbackHistory.partialPlaybackFraction(episodeID: episode.id, fallbackDurationSeconds: episode.durationDisplaySeconds) {
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
            .accessibilityLabel(isCurrentlyPlaying ? "Playing. \(remainingLabel(seconds: remainingSeconds)) remaining" : "\(remainingLabel(seconds: remainingSeconds)) remaining")
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

private extension EpisodesView {
    func deleteEpisode(_ episode: Episode) {
        Task {
            await viewModel.deleteEpisode(episode)
            await MainActor.run {
                audioManager.syncCurrentEpisode(with: viewModel.episodes)
            }
        }
    }

    @ViewBuilder
    var bannerView: some View {
        if let bannerMessage {
            ErrorBanner(
                message: bannerMessage,
                actionTitle: "Retry",
                action: { Task { await viewModel.load(force: true) } },
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

        if viewModel.episodes.isEmpty {
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
