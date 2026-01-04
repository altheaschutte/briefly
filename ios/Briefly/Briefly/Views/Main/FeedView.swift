import SwiftUI
import UIKit
import ImageIO

struct FeedView: View {
    @ObservedObject var viewModel: EpisodesViewModel
    @EnvironmentObject private var audioManager: AudioPlayerManager
    @EnvironmentObject private var appViewModel: AppViewModel
    @State private var bannerMessage: String?
    let onCreateEpisode: (() -> Void)?

    init(viewModel: EpisodesViewModel, onCreateEpisode: (() -> Void)? = nil) {
        _viewModel = ObservedObject(wrappedValue: viewModel)
        self.onCreateEpisode = onCreateEpisode
    }

    var body: some View {
        ScrollView { feedContent }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Color.brieflyBackground)
            .navigationTitle("Your Library")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await refreshFeed()
            }
            .refreshable {
                await refreshFeed(force: true)
            }
            .overlay(alignment: .top) {
                bannerView
            }
            .overlay {
                errorOverlay
            }
            .onChange(of: viewModel.errorMessage) { newValue in
                handleErrorChange(newValue)
            }
    }

    @ViewBuilder
    private var feedContent: some View {
        let featuredEpisode = viewModel.inProgressEpisode ?? viewModel.latestEpisode
        let hasLatestSection = featuredEpisode != nil || viewModel.isLoading
        let previousListTopPadding: CGFloat = hasLatestSection ? 12 : 0

        VStack(alignment: .leading, spacing: 16) {
            if let inProgress = viewModel.inProgressEpisode {
                inProgressCard(for: inProgress)
            } else if let latest = viewModel.latestEpisode {
                latestCard(for: latest)
            } else if viewModel.isLoading {
                latestSkeletonCard
            } else if viewModel.errorMessage == nil {
                emptyState
            }

            if viewModel.previousEpisodes.isEmpty == false {
                VStack(spacing: 10) {
                    ForEach(viewModel.previousEpisodes) { episode in
                        Button {
                            appViewModel.presentEpisodeDetail(episode)
                        } label: {
                            EpisodeRow(episode: episode)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, previousListTopPadding)
            }
        }
        .padding()
    }

    @ViewBuilder
    private var errorOverlay: some View {
        if let message = viewModel.errorMessage, viewModel.episodes.isEmpty {
            FullScreenErrorView(
                title: "Couldn't load your feed",
                message: message,
                actionTitle: "Retry"
            ) {
                Task { await refreshFeed(force: true) }
            }
            .transition(.opacity)
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
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.brieflySurface)
        .cornerRadius(12)
    }

    private func inProgressCard(for episode: Episode) -> some View {
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
                .scaleEffect(1.2)
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

    private func latestCard(for episode: Episode) -> some View {
        let coverSize: CGFloat = 108
        let maxPixelSize = Int(ceil(coverSize * UIScreen.main.scale))

        return Button {
            appViewModel.presentEpisodeDetail(episode)
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

                Text(episode.summary)
                    .font(.footnote)
                    .foregroundColor(.brieflyTextMuted)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)

                EpisodePlaybackRow(episode: episode)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }

    private func refreshFeed(force: Bool = false) async {
        await viewModel.load(force: force)
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
                action: { Task { await refreshFeed(force: true) } },
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
                coverImageView
            }

            EpisodePlaybackRow(episode: episode)
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

	    private var coverImageView: some View {
	        let maxPixelSize = Int(ceil(72 * UIScreen.main.scale))

	        return coverImage(for: episode, maxPixelSize: maxPixelSize)
	            .frame(width: 72, height: 72)
	            .clipShape(RoundedRectangle(cornerRadius: 16))
	    }
}

private struct EpisodePlaybackRow: View {
    let episode: Episode
    @EnvironmentObject private var playbackHistory: PlaybackHistory
    @EnvironmentObject private var audioManager: AudioPlayerManager

    var body: some View {
        let isCurrentlyPlaying = audioManager.isPlaying && audioManager.currentEpisode?.id == episode.id

        HStack(spacing: 8) {
            durationPill
            partialPlaybackStatus(isCurrentlyPlaying: isCurrentlyPlaying)
            if isCurrentlyPlaying == false, playbackHistory.isListened(episode.id) {
                listenedPill
            }
        }
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

// Shared cover image renderer so list and hero use the same artwork.
private func coverImage(for episode: Episode, maxPixelSize: Int?) -> some View {
    ZStack {
        Color.brieflySurface

	        if let url = episode.coverImageURL {
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

private var fallbackArtwork: some View {
    Image(systemName: "waveform.circle.fill")
        .font(.system(size: 32, weight: .semibold))
        .foregroundColor(Color.brieflySecondary)
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

struct EqualizerWaveform: View {
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

private extension FeedView {
    var latestSkeletonCard: some View {
        let coverSize: CGFloat = 108

        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .bottom, spacing: 16) {
                    VStack(alignment: .leading, spacing: 10) {
                        SkeletonBlock(cornerRadius: 6)
                            .frame(width: 140, height: 12)
                            .opacity(0.85)

                        SkeletonBlock(cornerRadius: 10)
                            .frame(height: 28)
                        SkeletonBlock(cornerRadius: 10)
                            .frame(width: 210, height: 28)
                    }

                    Spacer(minLength: 8)

                    SkeletonBlock(cornerRadius: 16)
                        .frame(width: coverSize, height: coverSize)
                        .padding(.bottom,9)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                SkeletonBlock(cornerRadius: 8)
                    .frame(height: 16)
                SkeletonBlock(cornerRadius: 8)
                    .frame(width: 240, height: 16)

                HStack(spacing: 12) {
                    SkeletonBlock(cornerRadius: 999)
                        .frame(width: 84, height: 34)

                    HStack(spacing: 10) {
                        SkeletonBlock(cornerRadius: 6)
                            .frame(width: 64, height: 16)
                        SkeletonBlock(cornerRadius: 999)
                            .frame(width: 120, height: 4)
                    }

                    Spacer(minLength: 0)
                }
            }
        }
    }
}

struct SkeletonBlock: View {
    var cornerRadius: CGFloat = 12
    @State private var isFading = false

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.white.opacity(0.08))
            .opacity(isFading ? 0.9 : 0.5)
            .animation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true), value: isFading)
            .onAppear {
                isFading = true
            }
    }
}
