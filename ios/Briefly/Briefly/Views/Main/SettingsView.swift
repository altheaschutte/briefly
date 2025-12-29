import SwiftUI

struct SettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel
    let email: String?
    @EnvironmentObject private var pushManager: PushNotificationManager
    @State private var showingScheduleEditor = false
    @State private var showingSpeedSheet = false
    @State private var editingSchedule: Schedule?
    @State private var draftTimeMinutes = 7 * 60
    @State private var draftFrequency: ScheduleFrequency = .daily

    var body: some View {
        List {
            Section {
                if let email {
                    Text(email)
                } else {
                    Text("Not signed in")
                }
                PlanSummaryView(entitlements: viewModel.entitlements)
//                Picker("Target duration", selection: $viewModel.targetDurationMinutes) {
//                    ForEach(viewModel.durationOptions, id: \.self) { minutes in
//                        Text("\(minutes) minutes").tag(minutes)
//                    }
//                }
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)

            Section {
                Button {
                    showingSpeedSheet = true
                } label: {
                    HStack {
                        Text("Playback speed")
                            .foregroundColor(.white)
                        Spacer()
                        Text(viewModel.playbackSpeed.playbackSpeedLabel)
                            .font(.body.weight(.semibold))
                            .foregroundColor(.brieflyTextMuted)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Toggle("Auto-play next episode", isOn: $viewModel.autoPlayNextEpisode)
            } header: {
                settingsHeader("Playback")
            }
            .listRowBackground(Color.brieflySurface)

//            Section {
//                Text("Voice selection coming soon.")
//                    .foregroundColor(.brieflyTextMuted)
//            } header: {
//                settingsHeader("Voices")
//            }
//            .listRowBackground(Color.brieflySurface)

            Section {
                Toggle(isOn: Binding(get: {
                    viewModel.notificationsEnabled
                }, set: { isOn in
                    viewModel.notificationsEnabled = isOn
                    Task { await viewModel.setNotificationsEnabled(isOn, pushManager: pushManager) }
                })) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Notify when a new episode is ready.")
                            .foregroundColor(.white)
                            .font(.body)
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
                                .font(.body)
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
            } header: {
                settingsHeader("Schedules") {
                    if viewModel.schedules.count < 2 {
                        Button {
                            startEditing(nil)
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "plus")
                                    .font(.system(size: 14, weight: .semibold))
                                Text("Add schedule")
                                    .font(.subheadline.weight(.semibold))
                            }
                        }
                        .foregroundColor(.brieflyPrimary)
                        .buttonStyle(.plain)
                    }
                }
            } footer: {
                Color.clear
                    .frame(height: 12)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
            .listRowBackground(Color.brieflySurface)

            Section {
                Button(role: .destructive, action: viewModel.logout) {
                    Label("Logout", systemImage: "rectangle.portrait.and.arrow.right")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 10)
                        .foregroundColor(.white)
                        .background(Color.brieflySurface)
                        .cornerRadius(10)
                }
                .buttonStyle(.plain)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
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
        .sheet(isPresented: $showingSpeedSheet) {
            PlaybackSpeedSheet(selectedSpeed: viewModel.playbackSpeed) { speed in
                viewModel.playbackSpeed = speed
            }
            .presentationDetents([.medium, .large])
            .presentationCornerRadius(26)
            .presentationBackground(Color.brieflySurface)
            .presentationDragIndicator(.visible)
        }
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
                    Picker("Generate episode at", selection: $timeMinutes) {
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
            UsageProgressView(progress: usageProgressFraction)
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

    private var usageProgressFraction: Double {
        guard let usedSeconds = entitlements?.secondsUsed, let limitSeconds = entitlements?.secondsLimit, limitSeconds > 0 else {
            return 0
        }
        let fraction = usedSeconds / limitSeconds
        return min(max(fraction, 0), 1)
    }
}

private struct UsageProgressView: View {
    let progress: Double

    var body: some View {
        ProgressView(value: progress)
            .progressViewStyle(.linear)
            .tint(.brieflyPrimary)
    }
}

private struct SettingsSectionHeader<Trailing: View>: View {
    let title: String
    let trailing: Trailing

    init(title: String, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.brieflyTextMuted)
            Spacer()
            trailing
        }
        .padding(.vertical, 8)
    }
}

private func settingsHeader<Trailing: View>(_ title: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) -> some View {
    ZStack {
        Color.brieflyBackground
        SettingsSectionHeader(title: title, trailing: trailing)
            .padding(.horizontal)
            .padding(.vertical, 6)
    }
    .listRowInsets(EdgeInsets())
}
