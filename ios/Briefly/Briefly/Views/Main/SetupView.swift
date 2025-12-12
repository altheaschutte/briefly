import SwiftUI

struct SetupView: View {
    @ObservedObject var topicsViewModel: TopicsViewModel
    let appViewModel: AppViewModel
    @State private var showSetupFlow = false
    @State private var newTopicText: String = ""

    var body: some View {
        List {
            if topicsViewModel.topics.isEmpty {
                emptyState
            } else {
                topicsSection
                addSection
            }

            Section {
                Button {
                    showSetupFlow = true
                } label: {
                    Label("Create new topics with mic", systemImage: "mic.circle.fill")
                        .font(.headline)
                        .foregroundColor(.blue)
                }
            } footer: {
                Text("Starting a new voice setup will replace your existing topics.")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Setup")
        .onAppear {
            Task { await topicsViewModel.load() }
        }
        .refreshable {
            await topicsViewModel.load()
        }
        .fullScreenCover(isPresented: $showSetupFlow, onDismiss: {
            Task { await topicsViewModel.load() }
        }) {
            OnboardingFlowView(appViewModel: appViewModel)
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Set up your Briefly")
                .font(.headline)
            Text("Use the mic to tell Briefly what you want to hear about. We’ll create topics and start generating episodes.")
                .foregroundColor(.secondary)
            Button {
                showSetupFlow = true
            } label: {
                Label("Start voice setup", systemImage: "mic.circle.fill")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            }
        }
        .padding(.vertical, 12)
    }

    private var topicsSection: some View {
        Section(header: Text("Your topics")) {
            ForEach($topicsViewModel.topics) { $topic in
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Topic", text: $topic.originalText, axis: .vertical)
                        .font(.subheadline)
                        .inputFieldStyle()
                    Toggle("Active", isOn: $topic.isActive)
                        .toggleStyle(.switch)
                    Button("Save") {
                        Task { await topicsViewModel.updateTopic(topic) }
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .padding(.vertical, 6)
            }
            .onDelete { indexSet in
                Task { await topicsViewModel.deleteTopic(at: indexSet) }
            }
        }
    }

    private var addSection: some View {
        Section(header: Text("Add topic")) {
            TextField("Topic", text: $newTopicText, axis: .vertical)
                .inputFieldStyle()
            Button("Add") {
                guard !newTopicText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                Task {
                    await topicsViewModel.addTopic(text: newTopicText)
                    newTopicText = ""
                }
            }
        }
    }
}
