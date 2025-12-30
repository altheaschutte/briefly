import Foundation

struct OnboardingIntentionOption: Identifiable, Hashable {
    let id: String
    let title: String
    let description: String
    let symbolName: String
}

@MainActor
final class ProfileOnboardingViewModel: ObservableObject {
    private static let shouldAutoSeedInitialTopics = false

    @Published var firstName: String
    @Published var selectedIntentions: Set<String> = []
    @Published var otherIntention: String = ""
    @Published var aboutContext: String = ""
    @Published var isSaving: Bool = false
    @Published var errorMessage: String?

    let options: [OnboardingIntentionOption] = [
        OnboardingIntentionOption(
            id: "stay-informed",
            title: "Stay informed",
            description: "Get clear, audio summaries of the most important news without endless scrolling or noise.",
            symbolName: "newspaper"
        ),
        OnboardingIntentionOption(
            id: "learn-understand",
            title: "Learn & understand",
            description: "Turn complex topics into easy-to-follow, podcast-style explanations you can actually absorb.",
            symbolName: "graduationcap"
        ),
        OnboardingIntentionOption(
            id: "professional-growth",
            title: "Professional growth",
            description: "Stay sharp with insights and updates that help you think better at work and in your industry.",
            symbolName: "briefcase"
        ),
        OnboardingIntentionOption(
            id: "discover-ideas",
            title: "Discover new ideas",
            description: "Explore topics you would not normally search for and stumble into interesting ideas effortlessly.",
            symbolName: "sparkles"
        ),
        OnboardingIntentionOption(
            id: "something-else",
            title: "Something else",
            description: "Tell us what you want to hear and we will tailor Briefly around it.",
            symbolName: "ellipsis.bubble"
        )
    ]

    private let profileService: ProfileService
    private let appViewModel: AppViewModel
    private let scheduleService: ScheduleService

    init(appViewModel: AppViewModel, initialFirstName: String? = nil) {
        self.appViewModel = appViewModel
        self.profileService = appViewModel.profileService
        self.scheduleService = appViewModel.scheduleService
        self.firstName = initialFirstName ?? ""
    }

    func toggle(_ option: OnboardingIntentionOption) {
        if selectedIntentions.contains(option.title) {
            selectedIntentions.remove(option.title)
            if option.title == "Something else" {
                otherIntention = ""
            }
        } else {
            selectedIntentions.insert(option.title)
        }
    }

    func applySuggestedName(_ name: String) {
        guard firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        firstName = name.split(separator: " ").first.map(String.init) ?? name
    }

    func save() async {
        let trimmedName = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedName.isEmpty == false else {
            errorMessage = "First name is required."
            return
        }
        guard selectedIntentions.isEmpty == false else {
            errorMessage = "Pick at least one intention."
            return
        }
        if selectedIntentions.contains("Something else") && otherIntention.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            errorMessage = "Tell us more about your intention."
            return
        }
        let trimmedAbout = aboutContext.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedAbout.isEmpty == false else {
            errorMessage = "Tell us a bit about yourself so we can personalize topics."
            return
        }
        let userId: String
        if let cached = appViewModel.currentUserId {
            userId = cached
        } else if let fetched = await fetchUserId() {
            userId = fetched
        } else {
            errorMessage = "We could not load your account. Please sign in again."
            return
        }

        isSaving = true
        errorMessage = nil
        do {
            let profile = UserProfile(
                id: userId,
                firstName: trimmedName,
                intention: resolvedIntentions().joined(separator: ", "),
                userAboutContext: trimmedAbout,
                timezone: TimeZone.current.identifier
            )
            _ = try await profileService.upsertProfile(profile)
            if Self.shouldAutoSeedInitialTopics {
                _ = try await appViewModel.seedTopics(from: trimmedAbout)
            }
            try? await scheduleService.completeOnboarding(
                timezone: TimeZone.current.identifier,
                localTimeMinutes: 7 * 60,
                frequency: .daily
            )
            appViewModel.markOnboardingComplete()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func fetchUserId() async -> String? {
        await appViewModel.refreshUserAndProfile()
        return appViewModel.currentUserId
    }

    private func resolvedIntentions() -> [String] {
        selectedIntentions
            .sorted()
            .map { title in
                if title == "Something else" {
                    let trimmed = otherIntention.trimmingCharacters(in: .whitespacesAndNewlines)
                    return trimmed.isEmpty ? title : trimmed
                }
                return title
            }
    }
}
