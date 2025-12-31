import SwiftUI

struct GenerateEpisodeView: View {
    @ObservedObject var viewModel: OnboardingViewModel
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var isGenerating = false
    @State private var isQueued = false
    @State private var queueTask: Task<Void, Never>?
    @State private var didGenerate = false
    let onDone: () -> Void
    private let queueDelayNanoseconds: UInt64 = 5_000_000_000

    var body: some View {
        VStack(spacing: 16) {
            Text("Great! I’ll use these topics to create your first Briefly episode.")
                .font(.title3.bold())
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("New episodes will be generated daily for your commute.")
                .foregroundColor(.brieflyTextMuted)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let error = viewModel.errorMessage {
                InlineErrorText(message: error)
            }

            Button(action: handleButtonTap) {
                if isGenerating {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding()
                } else if isQueued {
                    HStack(spacing: 10) {
                        ProgressView()
                            .tint(.white)
                        Text("Starting… Tap to undo")
                    }
                        .frame(maxWidth: .infinity)
                        .padding()
                } else {
                    Text(buttonTitle)
                        .frame(maxWidth: .infinity)
                        .padding()
                }
            }
            .background(isQueued ? Color.brieflySurface : Color.brieflyPrimary)
            .foregroundColor(.white)
            .cornerRadius(12)

            Spacer()
        }
        .padding()
        .background(Color.brieflyBackground)
        .onChange(of: didGenerate) { _, newValue in
            if newValue { onDone() }
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase != .active else { return }
            Task { await fireNowIfQueued() }
        }
    }

    private func handleButtonTap() {
        if viewModel.reachedUsageLimit {
            openURL(APIConfig.manageAccountURL)
            return
        }

        if isQueued {
            cancelQueuedGeneration()
            return
        }

        queueGeneration()
    }

    private func queueGeneration() {
        guard isGenerating == false else { return }
        viewModel.errorMessage = nil
        isQueued = true
        queueTask?.cancel()
        queueTask = Task { @MainActor in
            do {
                try await Task.sleep(nanoseconds: queueDelayNanoseconds)
            } catch {
                return
            }
            await fireNowIfQueued(cancelPendingDelay: false)
        }
    }

    private func cancelQueuedGeneration() {
        queueTask?.cancel()
        queueTask = nil
        isQueued = false
    }

    private func fireNowIfQueued(cancelPendingDelay: Bool = true) async {
        guard isQueued else { return }
        if cancelPendingDelay {
            queueTask?.cancel()
        }
        queueTask = nil
        isQueued = false

        isGenerating = true
        let episode = await viewModel.generateFirstEpisode()
        isGenerating = false
        if episode != nil {
            didGenerate = true
        }
    }

    private var buttonTitle: String {
        if didGenerate {
            return "Episode ready — go to Home"
        }
        return viewModel.reachedUsageLimit ? "Manage account" : "Generate My First Episode"
    }
}
