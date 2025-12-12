import SwiftUI

struct ManualInputView: View {
    @ObservedObject var viewModel: OnboardingViewModel
    @State private var text: String = ""
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("Type what you want to hear about")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)

            TextEditor(text: $text)
                .frame(minHeight: 200)
                .padding(8)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("Tell me about the kinds of news and stories you want in your daily Briefly episode…")
                            .foregroundColor(.secondary)
                            .padding(14)
                    }
                }

            if let error = viewModel.errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.footnote)
            }

            Button(action: {
                Task {
                    await viewModel.saveManualTranscript(text)
                    if viewModel.errorMessage == nil {
                        onContinue()
                    }
                }
            }) {
                if viewModel.isSubmitting {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding()
                } else {
                    Text("Continue")
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
    }
}
