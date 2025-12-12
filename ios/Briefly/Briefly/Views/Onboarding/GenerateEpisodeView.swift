import SwiftUI

struct GenerateEpisodeView: View {
    @ObservedObject var viewModel: OnboardingViewModel
    @State private var isGenerating = false
    @State private var didGenerate = false
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("Great! I’ll use these topics to create your first Briefly episode.")
                .font(.title3.bold())
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("New episodes will be generated daily for your commute.")
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let error = viewModel.errorMessage {
                Text(error).foregroundColor(.red)
            }

            Button(action: generate) {
                if isGenerating {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding()
                } else {
                    Text(didGenerate ? "Episode ready — go to Home" : "Generate My First Episode")
                        .frame(maxWidth: .infinity)
                        .padding()
                }
            }
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(12)

            Spacer()
        }
        .padding()
        .onChange(of: didGenerate) { _, newValue in
            if newValue { onDone() }
        }
    }

    private func generate() {
        Task {
            isGenerating = true
            let episode = await viewModel.generateFirstEpisode()
            isGenerating = false
            if episode != nil {
                didGenerate = true
            }
        }
    }
}
