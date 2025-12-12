import SwiftUI

struct OnboardingFlowView: View {
    @EnvironmentObject private var appViewModel: AppViewModel
    @Environment(\.dismiss) private var dismiss
    @StateObject private var onboardingViewModel: OnboardingViewModel
    @State private var path: [OnboardingStep] = []
    @State private var hasStartedRecording = false

    init(appViewModel: AppViewModel) {
        _onboardingViewModel = StateObject(wrappedValue: OnboardingViewModel(
            topicService: appViewModel.topicService,
            episodeService: appViewModel.episodeService,
            voiceService: OnboardingVoiceService(
                streamURL: APIConfig.baseURL.appendingPathComponent("onboarding/stream"),
                tokenProvider: { appViewModel.authManager.currentToken?.accessToken }
            )
        ))
    }

    var body: some View {
        NavigationStack(path: $path) {
            VoiceInputView(
                viewModel: onboardingViewModel,
                onContinue: {
                    onboardingViewModel.stopVoiceCapture()
                    path.append(.review)
                },
                onManual: {
                    onboardingViewModel.stopVoiceCapture()
                    path.append(.manual)
                }
            )
            .navigationTitle("Set up your Briefly")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: OnboardingStep.self) { step in
                switch step {
                case .voice:
                    EmptyView()
                case .manual:
                    ManualInputView(viewModel: onboardingViewModel, onContinue: {
                        path.append(.review)
                    })
                case .review:
                    TopicReviewView(viewModel: onboardingViewModel, onConfirm: {
                        path.append(.generate)
                    })
                case .generate:
                    GenerateEpisodeView(viewModel: onboardingViewModel, onDone: {
                        appViewModel.markOnboardingComplete()
                    })
                case .welcome:
                    EmptyView()
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") {
                    onboardingViewModel.stopVoiceCapture()
                    dismiss()
                }
            }
        }
        .onAppear {
            guard !hasStartedRecording else { return }
            hasStartedRecording = true
            onboardingViewModel.startVoiceCapture()
        }
        .onDisappear {
            onboardingViewModel.stopVoiceCapture()
        }
    }
}
