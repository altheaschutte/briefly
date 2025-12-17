import SwiftUI
import UIKit

struct EpisodeDetailView: View {
    let episode: Episode
    @EnvironmentObject private var appViewModel: AppViewModel
    @EnvironmentObject private var audioManager: AudioPlayerManager
    @State private var detailedEpisode: Episode
    @State private var segments: [EpisodeSegment]
    @State private var sources: [EpisodeSource]
    @State private var expandedSegments: Set<UUID> = []
    @State private var isLoading: Bool = false
    @State private var errorMessage: String?
    @State private var hasLoaded: Bool = false
    @State private var isSummaryExpanded: Bool = false

    init(episode: Episode) {
        self.episode = episode
        _detailedEpisode = State(initialValue: episode)
        _segments = State(initialValue: episode.segments ?? [])
        _sources = State(initialValue: episode.sources ?? [])
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                actionRow
                if let notes = detailedEpisode.showNotes?.trimmingCharacters(in: .whitespacesAndNewlines),
                   notes.isEmpty == false {
                    showNotesSection(notes)
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
        .background(Color.brieflyBackground)
        .navigationTitle("Episode")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { audioManager.play(episode: detailedEpisode) }) {
                    Image(systemName: "play.circle")
                }
            }
        }
        .task(id: episode.id) {
            await loadDetailsIfNeeded()
        }
        .safeAreaInset(edge: .bottom) {
            playerBarInset
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
        let toggleLabel = isSummaryExpanded ? "Show less" : "Show more"

        return Text(detailedEpisode.summary)
            .foregroundColor(.primary)
            .multilineTextAlignment(.leading)
            .lineLimit(isSummaryExpanded ? nil : 4)
            .overlay(alignment: .bottomTrailing) {
                Button(toggleLabel) {
                    isSummaryExpanded.toggle()
                }
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.brieflyBackground.opacity(0.92))
                .tint(.brieflyPrimary)
                .buttonStyle(.plain)
            }
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
        ZStack {
            Color.brieflySurface

            if let url = detailedEpisode.coverImageURL {
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

    var fallbackArtwork: some View {
        Image(systemName: "waveform.circle.fill")
            .font(.system(size: 42, weight: .semibold))
            .foregroundColor(Color.brieflySecondary)
    }

    var actionRow: some View {
        HStack(spacing: 12) {
            secondaryActionButton(systemName: "note.text") // transcript
            secondaryActionButton(systemName: "plus") // add/bookmark
            secondaryActionButton(systemName: "square.and.arrow.up") // share
            secondaryActionButton(systemName: "mic.fill") // talk to producer
            secondaryActionButton(systemName: "ellipsis") // more
            Spacer()
            primaryPlayButton
        }
        .padding(.horizontal, 4)
    }

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
                Text(topic.originalText)
                    .foregroundColor(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color.brieflySurface)
                    .cornerRadius(10)
            }
        }
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
                sourcesList(
                    segment.sources,
                    isExpanded: expandedSegments.contains(segment.id),
                    toggle: { toggleSources(for: segment.id) }
                )
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

    func sourcesList(_ list: [EpisodeSource], isExpanded: Bool, toggle: @escaping () -> Void) -> some View {
        let displayedList = isExpanded ? list : Array(list.prefix(3))

        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(displayedList.enumerated()), id: \.element.id) { index, source in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "link")
                            .font(.caption)
                            .foregroundColor(.brieflyPrimary)
                            .padding(.top, 2)
                        if let url = source.url {
                            Link(destination: url) {
                                Text(source.displayTitle)
                                    .font(.footnote)
                                    .foregroundColor(.brieflyTextMuted)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .tint(.brieflyTextMuted)
                        } else {
                            Text(source.displayTitle)
                                .font(.footnote)
                                .foregroundColor(.brieflyTextMuted)
                                .lineLimit(2)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.vertical, 6)

                if index < displayedList.count - 1 {
                    Divider()
                        .padding(.leading, 20)
                        .padding(.trailing, 4)
                }
            }

            if list.count > 3 {
                Button(action: toggle) {
                    Text(isExpanded ? "show less" : "+ \(list.count - 3) sources")
                        .font(.footnote.weight(.semibold))
                }
                .buttonStyle(.plain)
                .tint(.brieflyPrimary)
                .padding(.top, 8)
            }
        }
    }

    @MainActor
    func loadDetailsIfNeeded(force: Bool = false) async {
        if hasLoaded && force == false { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let latest = try await appViewModel.episodeService.fetchEpisode(id: episode.id)
            detailedEpisode = latest
            segments = (latest.segments ?? []).sorted(by: { $0.orderIndex < $1.orderIndex })
            sources = latest.sources ?? []
            errorMessage = nil
            hasLoaded = true
        } catch {
            errorMessage = error.localizedDescription
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

    func toggleSources(for segmentId: UUID) {
        if expandedSegments.contains(segmentId) {
            expandedSegments.remove(segmentId)
        } else {
            expandedSegments.insert(segmentId)
        }
    }

    var isCurrentlyPlaying: Bool {
        audioManager.currentEpisode?.id == detailedEpisode.id && audioManager.isPlaying
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

}

private extension EpisodeDetailView {
    @ViewBuilder
    var playerBarInset: some View {
        if audioManager.currentEpisode != nil {
            VStack(spacing: 0) {
                PlayerBarView()
                    .padding(.vertical, 8)
            }
            .background(Color.brieflyBackground)
            .shadow(color: Color.black.opacity(0.08), radius: 8, y: -2)
        }
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

// Lightweight shared image cache so artwork doesn't re-download across screens.
final class SharedImageCache {
    static let shared = SharedImageCache()
    private let cache = NSCache<NSURL, UIImage>()

    private init() {
        cache.countLimit = 128
    }

    func image(for url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    func insert(_ image: UIImage, for url: URL) {
        cache.setObject(image, forKey: url as NSURL)
    }
}

final class ImageLoader: ObservableObject {
    @Published var image: UIImage?
    @Published var didFail = false

    @MainActor
    func load(url: URL?) async {
        didFail = false
        image = nil

        guard let url else {
            return
        }

        if let cached = SharedImageCache.shared.image(for: url) {
            image = cached
            return
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard Task.isCancelled == false else { return }
            guard let uiImage = UIImage(data: data) else {
                throw URLError(.cannotDecodeContentData)
            }
            SharedImageCache.shared.insert(uiImage, for: url)
            image = uiImage
        } catch {
            guard Task.isCancelled == false else { return }
            didFail = true
        }
    }
}

struct CachedAsyncImage<Content: View, Placeholder: View, Failure: View>: View {
    let url: URL?
    @ViewBuilder var content: (Image) -> Content
    @ViewBuilder var placeholder: () -> Placeholder
    @ViewBuilder var failure: () -> Failure

    @StateObject private var loader = ImageLoader()

    var body: some View {
        Group {
            if let uiImage = loader.image {
                content(Image(uiImage: uiImage))
            } else if loader.didFail {
                failure()
            } else {
                placeholder()
            }
        }
        .task(id: url) {
            await loader.load(url: url)
        }
    }
}
