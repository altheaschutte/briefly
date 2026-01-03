import SwiftUI

struct BriefSeedView: View {
    @ObservedObject var topicsViewModel: TopicsViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var userAboutContext: String = ""
    @State private var errorMessage: String?
    @State private var isSubmitting: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Tell us what you’re into and we’ll generate some Briefs.")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(Color.brieflyTextPrimary)

                TextEditor(text: $userAboutContext)
                    .frame(minHeight: 160)
                    .scrollContentBackground(.hidden)
                    .inputFieldStyle()
                    .foregroundStyle(Color.brieflyTextPrimary)

                Button {
                    Task { await seedBriefs() }
                } label: {
                    HStack(spacing: 10) {
                        if isSubmitting {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "sparkles")
                        }
                        Text(isSubmitting ? "Creating…" : "Create for me")
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.offBlack)
                    .foregroundStyle(Color.white)
                    .tint(.white)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting || trimmedContext.isEmpty)

                if let errorMessage {
                    InlineErrorText(message: errorMessage)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
        .background(Color.brieflyBackground.ignoresSafeArea())
        .navigationTitle("Create for me")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
        .onChange(of: topicsViewModel.errorMessage) { message in
            if let message {
                errorMessage = message
            }
        }
    }

    private var trimmedContext: String {
        userAboutContext.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func seedBriefs() async {
        let trimmed = trimmedContext
        guard !trimmed.isEmpty else { return }
        errorMessage = nil
        topicsViewModel.errorMessage = nil
        isSubmitting = true
        defer { isSubmitting = false }

        await topicsViewModel.seedTopics(userAboutContext: trimmed)
        guard topicsViewModel.errorMessage == nil else { return }
        dismiss()
    }
}
