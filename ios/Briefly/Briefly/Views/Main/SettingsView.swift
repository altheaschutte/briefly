import SwiftUI

struct SettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel
    let email: String?

    var body: some View {
        List {
            Section {
                PlanSummaryView(entitlements: viewModel.entitlements)
                Picker("Target duration", selection: $viewModel.targetDurationMinutes) {
                    ForEach(viewModel.durationOptions, id: \.self) { minutes in
                        Text("\(minutes) minutes").tag(minutes)
                    }
                }
            } header: {
                settingsHeader("Plan & limits")
            }
            .listRowBackground(Color.brieflySurface)

            Section {
                if let email {
                    Text(email)
                } else {
                    Text("Not signed in")
                }
            } header: {
                settingsHeader("Account")
            }
            .listRowBackground(Color.brieflySurface)

            Section {
                Picker("Speed", selection: $viewModel.playbackSpeed) {
                    ForEach([0.8, 1.0, 1.2, 1.5, 2.0], id: \.self) { speed in
                        Text("\(String(format: "%.1fx", speed))").tag(speed)
                    }
                }
                Toggle("Auto-play latest episode", isOn: $viewModel.autoPlayLatest)
                Toggle("Resume last episode", isOn: $viewModel.resumeLast)
            } header: {
                settingsHeader("Playback")
            }
            .listRowBackground(Color.brieflySurface)

            Section {
                Text("Voice selection coming soon.")
                    .foregroundColor(.brieflyTextMuted)
            } header: {
                settingsHeader("Voices")
            }
            .listRowBackground(Color.brieflySurface)

            Section {
                Text("You'll get a push on this device when a new episode is ready.")
                    .foregroundColor(.brieflyTextMuted)
            } header: {
                settingsHeader("Notifications")
            }
            .listRowBackground(Color.brieflySurface)

            Section {
                Button(role: .destructive, action: viewModel.logout) {
                    Text("Logout")
                }
            }
            .listRowBackground(Color.brieflySurface)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .listRowBackground(Color.brieflyBackground)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.refreshEntitlements()
        }
        .onDisappear {
            viewModel.save()
        }
        .background(Color.brieflyBackground)
    }
}

private struct PlanSummaryView: View {
    let entitlements: Entitlements?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(planTitle)
                .font(.headline)
            Text(usageLine)
                .foregroundColor(.brieflyTextMuted)
            Text(limitsLine)
                .foregroundColor(.brieflyTextMuted)
            Text("Subscriptions can't be purchased in the app. Visit brieflypodcast.app to manage your account.")
                .font(.footnote)
                .foregroundColor(.brieflyTextMuted)
        }
        .padding(.vertical, 6)
    }

    private var planTitle: String {
        guard let entitlements else { return "Free plan" }
        return entitlements.tier.capitalized + " plan"
    }

    private var usageLine: String {
        guard let entitlements else { return "Usage resets monthly. You have 15 free minutes." }
        let used = entitlements.usedMinutes
        if let limit = entitlements.limitMinutes {
            return "\(used) of \(limit) minutes used this period"
        }
        return "\(used) minutes used this period"
    }

    private var limitsLine: String {
        guard let entitlements else { return "Max 5 active topics" }
        return "Max \(entitlements.limits.maxActiveTopics) active topics"
    }
}

private struct SettingsSectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundColor(.brieflyTextMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
    }
}

private func settingsHeader(_ title: String) -> some View {
    ZStack {
        Color.brieflyBackground
        SettingsSectionHeader(title: title)
            .padding(.horizontal)
            .padding(.vertical, 6)
    }
    .listRowInsets(EdgeInsets())
}
