import SwiftUI

struct SettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel
    let email: String?

    var body: some View {
        List {
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
                Text("Coming soon")
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
        .onDisappear {
            viewModel.save()
        }
        .background(Color.brieflyBackground)
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
