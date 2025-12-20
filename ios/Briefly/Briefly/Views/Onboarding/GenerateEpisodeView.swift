import SwiftUI

struct GenerateEpisodeView: View {
    @ObservedObject var viewModel: OnboardingViewModel
    @Environment(\.openURL) private var openURL
    @State private var isGenerating = false
    @State private var didGenerate = false
    let onDone: () -> Void

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

            Button(action: generate) {
                if isGenerating {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding()
                } else {
                    Text(buttonTitle)
                        .frame(maxWidth: .infinity)
                        .padding()
                }
            }
            .background(Color.brieflyPrimary)
            .foregroundColor(.white)
            .cornerRadius(12)

            Spacer()
        }
        .padding()
        .background(Color.brieflyBackground)
        .onChange(of: didGenerate) { _, newValue in
            if newValue { onDone() }
        }
    }

    private func generate() {
        if viewModel.reachedUsageLimit {
            openURL(APIConfig.manageAccountURL)
            return
        }
        Task {
            isGenerating = true
            let episode = await viewModel.generateFirstEpisode()
            isGenerating = false
            if episode != nil {
                didGenerate = true
            }
        }
    }

    private var buttonTitle: String {
        if didGenerate {
            return "Episode ready — go to Home"
        }
        return viewModel.reachedUsageLimit ? "Manage account" : "Generate My First Episode"
    }
}
