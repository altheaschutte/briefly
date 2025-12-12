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
            await viewModel.load()
        }
        .listStyle(.plain)
        .overlay(alignment: .top) { bannerView }
        .overlay {
            if let message = viewModel.errorMessage, viewModel.episodes.isEmpty {
                FullScreenErrorView(
                    title: "Couldn't load episodes",
                    message: message,
                    actionTitle: "Retry",
                    action: { Task { await viewModel.load() } }
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
    }
}

private struct EpisodeRow: View {
    let episode: Episode

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(dateLabel(episode.displayDate))
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.secondary)
                    Text(episode.displayTitle)
                        .font(.callout.weight(.semibold))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                    Text(episode.subtitle)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
                Spacer(minLength: 8)
                artwork
            }

            durationPill
        }
        .padding(.vertical, 8)
    }

    private var artwork: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(.secondarySystemBackground))
            if let url = episode.coverImageURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        fallbackArtwork.opacity(0.25)
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                            .frame(width: 72, height: 72)
                    case .failure:
                        fallbackArtwork
                    @unknown default:
                        fallbackArtwork
                    }
                }
            } else {
                fallbackArtwork
            }
        }
        .frame(width: 72, height: 72)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.black.opacity(0.05), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 4)
    }

    private var fallbackArtwork: some View {
        Image(systemName: "waveform.circle.fill")
            .font(.system(size: 28, weight: .semibold))
            .foregroundColor(Color.purple)
    }

    private var durationPill: some View {
        let label = durationLabel(episode.durationDisplaySeconds)
        return HStack(spacing: 6) {
            Image(systemName: "play.fill")
                .font(.caption)
            Text(label)
                .font(.callout.weight(.semibold))
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 12)
        .background(Color.purple.opacity(0.12))
        .foregroundColor(Color.purple)
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
                action: { Task { await viewModel.load() } },
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
