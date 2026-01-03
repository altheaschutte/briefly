import SwiftUI

struct OnboardingProfileView: View {
    @EnvironmentObject private var appViewModel: AppViewModel
    @StateObject private var viewModel: ProfileOnboardingViewModel

    init(appViewModel: AppViewModel) {
        _viewModel = StateObject(wrappedValue: ProfileOnboardingViewModel(appViewModel: appViewModel,
                                                                          initialFirstName: appViewModel.suggestedFirstName))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                nameField
                aboutField
                intentionsGrid
                if showsOtherField {
                    otherField
                }
                actionButton
                if let error = viewModel.errorMessage {
                    InlineErrorText(message: error)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)
            .padding(.bottom, 40)
        }
        .background(Color.brieflyBackground.ignoresSafeArea())
        .onAppear {
            if let suggested = appViewModel.suggestedFirstName {
                viewModel.applySuggestedName(suggested)
            }
        }
        .onChange(of: appViewModel.suggestedFirstName) { name in
            if let name {
                viewModel.applySuggestedName(name)
            }
        }
        .overlay {
            if appViewModel.isSeedingTopics {
                PersonalizationLoadingView()
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Onboarding")
                .font(.caption.weight(.semibold))
                .tracking(3)
                .foregroundColor(.brieflyAccentSoft)
            Text("Tell us about you")
                .font(.largeTitle.weight(.bold))
                .foregroundColor(.brieflyTextPrimary)
         
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var nameField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("First name")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.brieflyTextPrimary)
            TextField("", text: $viewModel.firstName)
                .textContentType(.givenName)
                .submitLabel(.done)
                .inputFieldStyle()
                .foregroundColor(.brieflyTextPrimary)
        }
    }

    private var aboutField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tell me about yourself")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.brieflyTextPrimary)
            Text("What do you want to know about?")
            .font(.subheadline)
            .foregroundColor(.brieflyTextMuted)
            TextEditor(text: $viewModel.aboutContext)
                .frame(minHeight: 140)
                .scrollContentBackground(.hidden)
                .inputFieldStyle()
                .foregroundColor(.brieflyTextPrimary)
        }
    }

    private var intentionsGrid: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("What are you here for? Select all that apply.")
                .font(.subheadline)
                .foregroundColor(.brieflyTextMuted)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(viewModel.options) { option in
                    intentionCard(option)
                }
            }
        }
    }

    private func intentionCard(_ option: OnboardingIntentionOption) -> some View {
        let selected = viewModel.selectedIntentions.contains(option.title)
        return Button {
            viewModel.toggle(option)
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    Image(systemName: option.symbolName)
                        .font(.headline)
                        .frame(width: 36, height: 36)
                        .background(
                            Circle()
                                .fill(selected ? Color.brieflyAccentSoft.opacity(0.18) : Color.brieflyBorder.opacity(0.5))
                        )
                        .foregroundColor(.brieflyTextPrimary)
                    Spacer()
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(option.title)
                        .font(.headline)
                        .foregroundColor(.brieflyTextPrimary)
                    Text(option.description)
                        .font(.subheadline)
                        .foregroundColor(.brieflyTextMuted)
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selected ? Color.brieflyAccentSoft.opacity(0.12) : Color.brieflySurface)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(selected ? Color.brieflyAccentSoft : Color.brieflyBorder, lineWidth: 1)
            )
            .cornerRadius(14)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(option.title)
        .accessibilityHint(option.description)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var showsOtherField: Bool {
        viewModel.selectedIntentions.contains("Something else")
    }

    private var otherField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tell us more")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.brieflyTextPrimary)
            TextField("", text: $viewModel.otherIntention, axis: .vertical)
                .lineLimit(2...4)
                .inputFieldStyle()
                .foregroundColor(.brieflyTextPrimary)
        }
    }

    private var actionButton: some View {
        Button {
            Task { await viewModel.save() }
        } label: {
            HStack {
                if viewModel.isSaving {
                    ProgressView()
                        .tint(.white)
                }
                Text(viewModel.isSaving ? "Saving..." : "Save and continue")
                    .fontWeight(.semibold)
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.headline)
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(Color.brieflyPrimary)
            .foregroundColor(.white)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isSaving || appViewModel.isSeedingTopics)
    }
}
