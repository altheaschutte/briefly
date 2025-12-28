import SwiftUI

struct SettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel
    let email: String?
    @EnvironmentObject private var pushManager: PushNotificationManager
    @State private var showingScheduleEditor = false
    @State private var editingSchedule: Schedule?
    @State private var draftTimeMinutes = 7 * 60
    @State private var draftFrequency: ScheduleFrequency = .daily

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
                Toggle(isOn: Binding(get: {
                    viewModel.notificationsEnabled
                }, set: { isOn in
                    viewModel.notificationsEnabled = isOn
                    Task { await viewModel.setNotificationsEnabled(isOn, pushManager: pushManager) }
                })) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Notify when a new episode is ready.")
                            .foregroundColor(.brieflyTextMuted)
                            .font(.subheadline)
                    }
                }
            } header: {
                settingsHeader("Notifications")
            }
            .listRowBackground(Color.brieflySurface)

            Section {
                if viewModel.isLoadingSchedules {
                    ProgressView().tint(.accentColor)
                }
                if let error = viewModel.scheduleError {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.footnote)
                }
                ForEach(viewModel.schedules) { schedule in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(viewModel.formattedTime(from: schedule.localTimeMinutes)) · \(schedule.frequency.displayName)")
                                .font(.subheadline)
                                .foregroundColor(.white)
                        }
                        Spacer()
                        Toggle(isOn: Binding(get: {
                            schedule.isActive
                        }, set: { isOn in
                            Task { await viewModel.toggleSchedule(schedule, isActive: isOn) }
                        })) {
                            EmptyView()
                        }
                        .labelsHidden()
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        startEditing(schedule)
                    }
                    .swipeActions {
                        Button(role: .destructive) {
                            Task { await viewModel.deleteSchedule(schedule) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
                if viewModel.schedules.count < 2 {
                    Button {
                        startEditing(nil)
                    } label: {
                        Label("Add schedule", systemImage: "plus")
                    }
                }
            } header: {
                settingsHeader("Schedules")
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
            await viewModel.refreshOnAppear(pushManager: pushManager)
        }
        .refreshable {
            await viewModel.refreshAll(pushManager: pushManager, showScheduleLoading: true)
        }
        .onDisappear {
            viewModel.save()
        }
        .background(Color.brieflyBackground)
        .sheet(isPresented: $showingScheduleEditor) {
            ScheduleEditor(
                frequency: $draftFrequency,
                timeMinutes: $draftTimeMinutes,
                isPresented: $showingScheduleEditor,
                isEditing: editingSchedule != nil,
                onSave: { frequency, minutes in
                    Task {
                        await viewModel.saveSchedule(
                            id: editingSchedule?.id,
                            frequency: frequency,
                            localTimeMinutes: minutes,
                            timezone: TimeZone.current.identifier
                        )
                        editingSchedule = nil
                    }
                },
                onDelete: {
                    guard let schedule = editingSchedule else { return }
                    Task {
                        await viewModel.deleteSchedule(schedule)
                        editingSchedule = nil
                        showingScheduleEditor = false
                    }
                }
            )
        }
    }

    private func startEditing(_ schedule: Schedule?) {
        editingSchedule = schedule
        draftFrequency = schedule?.frequency ?? .daily
        draftTimeMinutes = schedule?.localTimeMinutes ?? 7 * 60
        showingScheduleEditor = true
    }
}

private struct ScheduleEditor: View {
    @Binding var frequency: ScheduleFrequency
    @Binding var timeMinutes: Int
    @Binding var isPresented: Bool
    var isEditing: Bool
    var onSave: (ScheduleFrequency, Int) -> Void
    var onDelete: (() -> Void)?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Ready by", selection: $timeMinutes) {
                        ForEach(Self.hourOptions, id: \.self) { minutes in
                            Text(Self.formattedHour(minutes)).tag(minutes)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(.brieflyPrimary)
                }
                .listRowBackground(Color.brieflySurface)

                Section {
                    Picker("Frequency", selection: $frequency) {
                        ForEach(ScheduleFrequency.allCases) { freq in
                            Text(freq.displayName).tag(freq)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(.brieflyPrimary)
                }
                .listRowBackground(Color.brieflySurface)

                if isEditing {
                    Section {
                        Button(role: .destructive) {
                            onDelete?()
                        } label: {
                            Text("Delete schedule")
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .listRowBackground(Color.brieflySurface)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Color.brieflyBackground)
            .navigationTitle("Schedule")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        isPresented = false
                        onSave(frequency, timeMinutes)
                    }
                }
            }
        }
    }

    private static let hourOptions: [Int] = Array(stride(from: 0, through: 23, by: 1)).map { $0 * 60 }

    private static func formattedHour(_ minutes: Int) -> String {
        let hour = minutes / 60
        var components = DateComponents()
        components.hour = hour
        components.minute = 0
        let date = Calendar.current.date(from: components) ?? Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "h a"
        return formatter.string(from: date)
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
