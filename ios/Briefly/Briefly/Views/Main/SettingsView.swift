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
                Toggle("Auto-play latest episode", isOn: $viewModel.autoPlayLatest)
                Toggle("Resume last episode", isOn: $viewModel.resumeLast)
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
