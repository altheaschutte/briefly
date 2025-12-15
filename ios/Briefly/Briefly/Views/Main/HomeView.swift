import SwiftUI

struct HomeView: View {
    @ObservedObject var viewModel: HomeViewModel
    @EnvironmentObject private var audioManager: AudioPlayerManager
    @State private var bannerMessage: String?

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            magicButton
            if let episode = viewModel.latestEpisode {
                VStack(alignment: .leading, spacing: 8) {
                    Text(episode.displayTitle)
                        .font(.title2.bold())
                    Text(episode.summary)
                        .foregroundColor(.brieflyTextMuted)
                    ProgressView(value: audioManager.progress)
                }
                .padding()
            } else if viewModel.isLoading {
                ProgressView("Loading latest episode…")
            } else if viewModel.errorMessage == nil {
                Text("No episode yet. Generate one from onboarding.")
                    .foregroundColor(.brieflyTextMuted)
            }
            Spacer()
            PlayerBarView()
        }
        .padding()
        .navigationTitle("Briefly")
        .onAppear {
            Task { await viewModel.loadLatest() }
        }
        .overlay(alignment: .top) {
            bannerView
        }
        .overlay {
            if let message = viewModel.errorMessage, viewModel.latestEpisode == nil {
                FullScreenErrorView(
                    title: "Couldn't load Briefly",
                    message: message,
                    actionTitle: "Retry"
                ) {
                    Task { await viewModel.loadLatest() }
                }
                .transition(.opacity)
            }
        }
        .onChange(of: viewModel.errorMessage) { newValue in
            handleErrorChange(newValue)
        }
        .background(Color.brieflyBackground)
    }

    private var magicButton: some View {
        Button(action: viewModel.magicPlay) {
            VStack {
                Image(systemName: audioManager.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundColor(.white)
                Text("Magic Play")
                    .foregroundColor(.white)
                    .font(.headline)
            }
            .frame(width: 180, height: 180)
            .background(Color.brieflyPrimary)
            .clipShape(Circle())
            .shadow(radius: 10)
        }
    }
}

private extension HomeView {
    @ViewBuilder
    var bannerView: some View {
        if let bannerMessage {
            ErrorBanner(
                message: bannerMessage,
                actionTitle: "Retry",
                action: { Task { await viewModel.loadLatest() } },
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
        if viewModel.latestEpisode == nil {
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
