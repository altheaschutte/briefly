import SwiftUI

struct SettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel
    let email: String?

    var body: some View {
        List {
            Section(header: Text("Account")) {
                if let email {
                    Text(email)
                } else {
                    Text("Not signed in")
                }
            }
            .listRowBackground(Color.brieflyBackground)

            Section(header: Text("Playback")) {
                Picker("Speed", selection: $viewModel.playbackSpeed) {
                    ForEach([0.8, 1.0, 1.2, 1.5, 2.0], id: \.self) { speed in
                        Text("\(String(format: "%.1fx", speed))").tag(speed)
                    }
                }
                Toggle("Auto-play latest episode", isOn: $viewModel.autoPlayLatest)
                Toggle("Resume last episode", isOn: $viewModel.resumeLast)
            }
            .listRowBackground(Color.brieflyBackground)

            Section(header: Text("Voices")) {
                Text("Voice selection coming soon.")
                    .foregroundColor(.brieflyTextMuted)
            }
            .listRowBackground(Color.brieflyBackground)

            Section(header: Text("Notifications")) {
                Text("Coming soon")
                    .foregroundColor(.brieflyTextMuted)
            }
            .listRowBackground(Color.brieflyBackground)

            Section {
                Button(role: .destructive, action: viewModel.logout) {
                    Text("Logout")
                }
            }
            .listRowBackground(Color.brieflyBackground)
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
