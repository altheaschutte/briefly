import SwiftUI

struct OnboardingFlowView: View {
    @EnvironmentObject private var appViewModel: AppViewModel
    @StateObject private var onboardingViewModel: OnboardingViewModel
    @State private var path: [OnboardingStep] = []

    init(appViewModel: AppViewModel) {
        _onboardingViewModel = StateObject(wrappedValue: OnboardingViewModel(
            topicService: appViewModel.topicService,
            episodeService: appViewModel.episodeService,
            voiceService: OnboardingVoiceService(streamURL: APIConfig.baseURL.appendingPathComponent("onboarding/stream"))
        ))
    }

    var body: some View {
        NavigationStack(path: $path) {
            VoiceInputView(
                viewModel: onboardingViewModel,
                onContinue: { path.append(.review) },
                onManual: { path.append(.manual) }
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
    }
}
