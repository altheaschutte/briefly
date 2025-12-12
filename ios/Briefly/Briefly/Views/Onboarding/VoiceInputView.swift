import SwiftUI

struct VoiceInputView: View {
    @ObservedObject var viewModel: OnboardingViewModel
    let onContinue: () -> Void
    let onManual: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("Voice capture")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top)

            Spacer()
            Button(action: toggleRecording) {
                ZStack {
                    Circle()
                        .fill(viewModel.isRecording ? Color.red : Color.blue)
                        .frame(width: 140, height: 140)
                        .shadow(radius: 8)
                    Image(systemName: viewModel.isRecording ? "stop.fill" : "mic.fill")
                        .font(.system(size: 48))
                        .foregroundColor(.white)
                }
            }
            .disabled(viewModel.isProcessingAudio)
            Text(viewModel.isRecording ? "Listening…" : "Tap and tell me what you want to hear about.")
                .font(.subheadline)
                .foregroundColor(.secondary)
            Text("Example: “I want local art events, weekend kids activities, and important AI + finance news.”")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.horizontal)

            if viewModel.isProcessingAudio {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Processing your audio…")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Draft transcript")
                            .font(.headline)
                        Spacer()
                    }
                    Text(viewModel.transcript.isEmpty ? "Your transcript will appear here as you speak." : viewModel.transcript)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(12)
                }
            }
            .frame(maxHeight: 240)

            if let error = viewModel.errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.footnote)
            }

            HStack {
                Button("Clear") {
                    viewModel.clearTranscript()
                }
                .disabled(viewModel.transcript.isEmpty)

                Spacer()
                Button("Type Instead", action: onManual)
            }

            Button(action: {
                Task {
                    await viewModel.submitTranscript()
                    if viewModel.errorMessage == nil {
                        onContinue()
                    }
                }
            }) {
                if viewModel.isSubmitting || viewModel.isProcessingAudio {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding()
                } else {
                    Text("Done")
                        .frame(maxWidth: .infinity)
                        .padding()
                }
            }
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(12)
            .padding(.bottom)
            .disabled(viewModel.isSubmitting || viewModel.isProcessingAudio)

            Spacer()
        }
        .padding()
    }

    private func toggleRecording() {
        if viewModel.isRecording {
            viewModel.stopVoiceCapture()
        } else {
            viewModel.startVoiceCapture()
        }
    }
}
