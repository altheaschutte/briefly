import SwiftUI

struct EpisodesView: View {
    @ObservedObject var viewModel: EpisodesViewModel
    @EnvironmentObject private var audioManager: AudioPlayerManager
    @State private var bannerMessage: String?

    var body: some View {
        List {
            ForEach(viewModel.sections) { section in
                Section(header: Text(section.title)) {
                    ForEach(section.episodes) { episode in
                        NavigationLink(value: episode) {
                            EpisodeRow(episode: episode)
                        }
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
        .navigationDestination(for: Episode.self) { episode in
            EpisodeDetailView(episode: episode)
        }
        .onAppear {
            Task { await viewModel.load() }
        }
        .refreshable {
            await viewModel.load(force: true)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
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
        .overlay(alignment: .bottom) {
            PlayerBarView()
                .padding(.bottom, 8)
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
                        .font(.caption)
                        .fontWeight(.semibold)
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
        .padding(.vertical, 8)
    }

    private var artwork: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14)
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
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.brieflyBorder, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.24), radius: 8, x: 0, y: 4)
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
        .background(Color.brieflyDurationBackground)
        .foregroundColor(Color.brieflyAccentSoft)
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
            if isCurrentlyPlaying {
                EqualizerWaveform(isAnimating: true, color: Color.brieflyAccentSoft, barCount: 4, minHeight: 4, maxHeight: 14, barWidth: 2, spacing: 2)
                    .accessibilityLabel("Playing")
            } else if playbackHistory.isListened(episode.id) {
                listenedPill
            }
        }
    }

    private func durationLabel(_ seconds: Double?) -> String {
        guard let seconds, seconds.isFinite, seconds > 0 else { return "—" }
        let minutes = max(Int(round(seconds / 60)), 1)
        return "\(minutes)m"
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
