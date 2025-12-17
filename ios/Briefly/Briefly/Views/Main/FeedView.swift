import SwiftUI

struct FeedView: View {
    @ObservedObject var viewModel: EpisodesViewModel
    @EnvironmentObject private var audioManager: AudioPlayerManager
    @State private var bannerMessage: String?
    let onCreateEpisode: (() -> Void)?

    init(viewModel: EpisodesViewModel, onCreateEpisode: (() -> Void)? = nil) {
        _viewModel = ObservedObject(wrappedValue: viewModel)
        self.onCreateEpisode = onCreateEpisode
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let latest = viewModel.latestEpisode {
                    latestCard(for: latest)
                } else if viewModel.isLoading {
                    latestSkeletonCard
                } else if viewModel.errorMessage == nil {
                    emptyState
                }

                if viewModel.previousEpisodes.isEmpty == false {
                    Text("Previous episodes")
                        .font(.headline)
                    VStack(spacing: 0) {
                        ForEach(Array(viewModel.previousEpisodes.enumerated()), id: \.element.id) { index, episode in
                            NavigationLink(value: episode) {
                                EpisodeRow(episode: episode)
                            }
                            .buttonStyle(.plain)
                            if index < viewModel.previousEpisodes.count - 1 {
                                Divider()
                                    .padding(.leading, 2)
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .background(Color.brieflyBackground)
        .navigationTitle("Your Library")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Episode.self) { episode in
            EpisodeDetailView(episode: episode)
        }
        .task {
            await refreshFeed()
        }
        .refreshable {
            await refreshFeed()
        }
        .overlay(alignment: .bottom) {
            PlayerBarView()
                .padding(.bottom, 8)
        }
        .overlay(alignment: .top) {
            bannerView
        }
        .overlay {
            if let message = viewModel.errorMessage, viewModel.episodes.isEmpty {
                FullScreenErrorView(
                    title: "Couldn't load your feed",
                    message: message,
                    actionTitle: "Retry"
                ) {
                    Task { await refreshFeed() }
                }
                .transition(.opacity)
            }
        }
        .onChange(of: viewModel.errorMessage) { newValue in
            handleErrorChange(newValue)
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("No episodes yet")
                .font(.headline)
            Text("You haven't generated any Briefly episodes. Create one to see it appear here.")
                .foregroundColor(.brieflyTextMuted)

            if let onCreateEpisode {
                Button(action: onCreateEpisode) {
                    Text("Create an episode")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.brieflyPrimary)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.brieflySurface)
        .cornerRadius(12)
    }

    private func latestCard(for episode: Episode) -> some View {
        VStack(alignment: .center, spacing: 12) {
            Text("Latest episode")
                .font(.caption)
                .foregroundColor(.brieflyTextMuted)
                .frame(maxWidth: .infinity)
            episodeHero(episode)

            HStack(spacing: 12) {
                Button(action: { togglePlay(episode) }) {
                    Label(audioManager.isPlaying && audioManager.currentEpisode?.id == episode.id ? "Pause" : "Play",
                          systemImage: audioManager.isPlaying && audioManager.currentEpisode?.id == episode.id ? "pause.fill" : "play.fill")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.brieflyPrimary)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }

                NavigationLink(value: episode) {
                    Text("Details")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.brieflySecondary)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .buttonStyle(.plain)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func episodeHero(_ episode: Episode) -> some View {
        let heroSize = min(UIScreen.main.bounds.width - 80, 260)

        return VStack(alignment: .center, spacing: 10) {
            coverImage(for: episode)
                .frame(width: heroSize, height: heroSize)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .shadow(color: Color.black.opacity(0.18), radius: 22, x: 0, y: 14)

            Text(episode.displayTitle)
                .font(.title2.bold())
                .multilineTextAlignment(.center)
                .padding(.top, 6)
            Text(episode.summary)
                .foregroundColor(.brieflyTextMuted)
                .lineLimit(3)
                .multilineTextAlignment(.center)
        }
        .padding(.bottom, 8)
    }

    private func togglePlay(_ episode: Episode) {
        if audioManager.currentEpisode?.id == episode.id {
            if audioManager.isPlaying {
                audioManager.pause()
            } else {
                audioManager.resume()
            }
        } else {
            audioManager.play(episode: episode)
        }
    }

    private func refreshFeed() async {
        await viewModel.load()
        await MainActor.run {
            audioManager.syncCurrentEpisode(with: viewModel.episodes)
        }
        await MainActor.run {
            if viewModel.errorMessage == nil {
                bannerMessage = nil
            }
        }
    }

    @ViewBuilder
    private var bannerView: some View {
        if let bannerMessage {
            ErrorBanner(
                message: bannerMessage,
                actionTitle: "Retry",
                action: { Task { await refreshFeed() } },
                onDismiss: { hideBanner(message: bannerMessage) }
            )
            .transition(.move(edge: .top).combined(with: .opacity))
            .padding(.top, 8)
        }
    }

    private func handleErrorChange(_ message: String?) {
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

    private func showBanner(_ message: String) {
        withAnimation {
            bannerMessage = message
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            hideBanner(message: message)
        }
    }

    private func hideBanner(message: String? = nil) {
        guard message == nil || message == bannerMessage else { return }
        withAnimation {
            bannerMessage = nil
        }
    }
}

private struct EpisodeRow: View {
    let episode: Episode

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(dateLabel(episode.displayDate))
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
                coverImageView
            }

            durationPill
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var coverImageView: some View {
        coverImage(for: episode)
            .frame(width: 72, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.brieflyBorder, lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.24), radius: 8, x: 0, y: 4)
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

    private func dateLabel(_ date: Date?) -> String {
        guard let date else { return "—" }
        let calendar = Calendar.current
        let needsYear = calendar.component(.year, from: date) != calendar.component(.year, from: Date())
        let formatter = DateFormatter()
        formatter.dateFormat = needsYear ? "d MMM yyyy" : "d MMM"
        return formatter.string(from: date).uppercased()
    }

    private func durationLabel(_ seconds: Double?) -> String {
        guard let seconds, seconds.isFinite, seconds > 0 else { return "—" }
        let minutes = max(Int(round(seconds / 60)), 1)
        return "\(minutes)m"
    }
}

// Shared cover image renderer so list and hero use the same artwork.
private func coverImage(for episode: Episode) -> some View {
    ZStack {
        Color.brieflySurface

        if let url = episode.coverImageURL {
            CachedAsyncImage(url: url) { image in
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

private var fallbackArtwork: some View {
    Image(systemName: "waveform.circle.fill")
        .font(.system(size: 32, weight: .semibold))
        .foregroundColor(Color.brieflySecondary)
}

private extension FeedView {
    var latestSkeletonCard: some View {
        let heroSize = min(UIScreen.main.bounds.width - 80, 260)

        return VStack(alignment: .center, spacing: 12) {
            SkeletonBlock(cornerRadius: 6)
                .frame(width: 96, height: 12)
                .opacity(0.85)
                .frame(maxWidth: .infinity, alignment: .center)

            SkeletonBlock(cornerRadius: 22)
                .frame(width: heroSize, height: heroSize)
                .shadow(color: Color.black.opacity(0.14), radius: 22, x: 0, y: 14)

            VStack(spacing: 8) {
                // Title expects to wrap to two lines.
                SkeletonBlock(cornerRadius: 10)
                    .frame(width: heroSize * 0.95, height: 22)
                    .padding(.top, 6)
                SkeletonBlock(cornerRadius: 10)
                    .frame(width: heroSize * 0.8, height: 22)

                // One subtle line for the summary intro.
                SkeletonBlock(cornerRadius: 8)
                    .frame(width: heroSize * 0.72, height: 16)
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.bottom, 8)

            HStack(spacing: 12) {
                SkeletonBlock(cornerRadius: 12)
                    .frame(height: 46)
                    .frame(maxWidth: .infinity)
                SkeletonBlock(cornerRadius: 12)
                    .frame(height: 46)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SkeletonBlock: View {
    var cornerRadius: CGFloat = 12
    @State private var shimmerOffset: CGFloat = -1

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.white.opacity(0.08))
            .overlay {
                shimmer
                    .mask(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    )
            }
            .onAppear {
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                    shimmerOffset = 1.25
                }
            }
    }

    private var shimmer: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height

            LinearGradient(
                colors: [
                    Color.white.opacity(0.0),
                    Color.white.opacity(0.25),
                    Color.white.opacity(0.0)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(width: width * 1.6, height: height * 1.6)
            .rotationEffect(.degrees(16))
            .offset(x: shimmerOffset * width)
        }
    }
}
