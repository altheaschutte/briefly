import SwiftUI

struct HomeView: View {
    @ObservedObject var viewModel: HomeViewModel
    @EnvironmentObject private var audioManager: AudioPlayerManager

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            magicButton
            if let episode = viewModel.latestEpisode {
                VStack(alignment: .leading, spacing: 8) {
                    Text(episode.title)
                        .font(.title2.bold())
                    Text(episode.summary)
                        .foregroundColor(.secondary)
                    ProgressView(value: audioManager.progress)
                }
                .padding()
            } else if viewModel.isLoading {
                ProgressView("Loading latest episode…")
            } else {
                Text("No episode yet. Generate one from onboarding.")
                    .foregroundColor(.secondary)
            }
            Spacer()
            PlayerBarView()
        }
        .padding()
        .navigationTitle("Briefly")
        .onAppear {
            Task { await viewModel.loadLatest() }
        }
        .alert(item: Binding.constant(viewModel.errorMessage.map { LocalizedErrorWrapper(message: $0) })) { wrapper in
            Alert(title: Text("Error"), message: Text(wrapper.message), dismissButton: .default(Text("OK")))
        }
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
            .background(Color.blue)
            .clipShape(Circle())
            .shadow(radius: 10)
        }
    }
}

struct LocalizedErrorWrapper: Identifiable {
    let id = UUID()
    let message: String
}
