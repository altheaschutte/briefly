import SwiftUI

struct CreateBriefView: View {
    @ObservedObject var topicsViewModel: TopicsViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.brieflyFloatingChromeHeight) private var floatingChromeHeight
    @FocusState private var isPromptFocused: Bool
    @State private var prompt: String = ""
    @State private var errorMessage: String?
    @State private var isSubmitting: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                promptHeader
                promptEditor
                saveButton

                if let errorMessage {
                    InlineErrorText(message: errorMessage)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, contentBottomPadding)
        }
        .background(Color.brieflyBackground.ignoresSafeArea())
        .navigationTitle("Create Brief")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("Cancel") {
                    dismiss()
                }
                .foregroundStyle(Color.brieflyPrimary)
            }

            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    Task { await save() }
                }
                .foregroundStyle(Color.offBlack)
                .tint(.offBlack)
                .disabled(isSaveDisabled)
            }
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                isPromptFocused = true
            }
        }
        .onChange(of: topicsViewModel.errorMessage) { message in
            if let message {
                errorMessage = message
            }
        }
    }

    private var promptHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Prompt")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.brieflyTextPrimary)

            Text("Briefly describe what you want this segment to explore. Be as detailed or as vague as you like.")
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(Color.brieflyTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var promptEditor: some View {
        ZStack(alignment: .topLeading) {
            TextEditor(text: $prompt)
                .frame(minHeight: 160)
                .scrollContentBackground(.hidden)
                .focused($isPromptFocused)
                .inputFieldStyle()
                .foregroundStyle(Color.brieflyTextPrimary)

            if prompt.isEmpty {
                Text("Find me latest research on CRISPR")
                    .foregroundStyle(Color.brieflyTextMuted)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 18)
                    .allowsHitTesting(false)
            }
        }
    }

    private var saveButton: some View {
        Button {
            Task { await save() }
        } label: {
            if isSubmitting {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity)
            } else {
                Text("Save")
                    .frame(maxWidth: .infinity)
            }
        }
        .font(.system(size: 16, weight: .semibold))
        .buttonStyle(BrieflyCapsuleButtonStyle(background: .offBlack, foreground: .white, verticalPadding: 16))
        .disabled(isSaveDisabled)
    }

    private var isSaveDisabled: Bool {
        isSubmitting || trimmedPrompt.isEmpty
    }

    private var trimmedPrompt: String {
        prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var contentBottomPadding: CGFloat {
        max(floatingChromeHeight, 0) + 24
    }

    private func save() async {
        let trimmed = trimmedPrompt
        guard trimmed.isEmpty == false else {
            errorMessage = "Prompt cannot be empty."
            return
        }

        errorMessage = nil
        topicsViewModel.errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        await topicsViewModel.addTopic(text: trimmed, isActive: topicsViewModel.canAddActiveTopic)
        guard topicsViewModel.errorMessage == nil else {
            errorMessage = topicsViewModel.errorMessage
            return
        }

        dismiss()
    }
}
