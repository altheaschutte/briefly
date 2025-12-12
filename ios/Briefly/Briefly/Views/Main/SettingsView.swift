import SwiftUI

struct SettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel
    let email: String?

    var body: some View {
        Form {
            Section(header: Text("Account")) {
                if let email {
                    Text(email)
                } else {
                    Text("Not signed in")
                }
            }

            Section(header: Text("Playback")) {
                Picker("Speed", selection: $viewModel.playbackSpeed) {
                    ForEach([0.8, 1.0, 1.2, 1.5, 2.0], id: \.self) { speed in
                        Text("\(String(format: "%.1fx", speed))").tag(speed)
                    }
                }
                Toggle("Auto-play latest episode", isOn: $viewModel.autoPlayLatest)
                Toggle("Resume last episode", isOn: $viewModel.resumeLast)
            }

            Section(header: Text("Voices")) {
                Text("Voice selection coming soon.")
                    .foregroundColor(.secondary)
            }

            Section(header: Text("Notifications")) {
                Text("Coming soon")
                    .foregroundColor(.secondary)
            }

            Section {
                Button(role: .destructive, action: viewModel.logout) {
                    Text("Logout")
                }
            }
        }
        .navigationTitle("Settings")
        .onDisappear {
            viewModel.save()
        }
    }
}
