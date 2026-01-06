import SwiftUI

struct SettingsView: View {
    @StateObject private var viewModel: SettingsViewModel
    let email: String?
    let safeAreaBottomPadding: CGFloat
    @EnvironmentObject private var pushManager: PushNotificationManager
    @State private var showingScheduleEditor = false
    @State private var showingSpeedSheet = false
    @State private var editingSchedule: Schedule?
    @State private var draftTimeMinutes = 7 * 60
    @State private var draftFrequency: ScheduleFrequency = .daily

    init(appViewModel: AppViewModel,
         audioManager: AudioPlayerManager,
         email: String?,
         safeAreaBottomPadding: CGFloat) {
        _viewModel = StateObject(wrappedValue: SettingsViewModel(appViewModel: appViewModel, audioManager: audioManager))
        self.email = email
        self.safeAreaBottomPadding = safeAreaBottomPadding
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Account")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.brieflyTextMuted)
                        .padding(.horizontal, 6)
                    PlanSummaryCard(entitlements: viewModel.entitlements, email: email)
                }
                .padding(.horizontal, 16)

                SettingsGroup(title: "Playback") {
                    SettingsButtonRow(
                        title: "Playback speed",
                        value: viewModel.playbackSpeed.playbackSpeedLabel
                    ) { showingSpeedSheet = true }
                    Divider().padding(.leading, 16)
                    SettingsToggleRow(
                        title: "Auto-play next episode",
                        isOn: $viewModel.autoPlayNextEpisode
                    )
                }

                SettingsGroup(title: "Notifications") {
                    SettingsToggleRow(
                        title: "Notify when a new episode is ready.",
                        isOn: Binding(get: {
                            viewModel.notificationsEnabled
                        }, set: { isOn in
                            viewModel.notificationsEnabled = isOn
                            Task { await viewModel.setNotificationsEnabled(isOn, pushManager: pushManager) }
                        })
                    )
                }

                SettingsGroup(title: "Schedules", trailing: {
                    if viewModel.schedules.count < 2 {
                        Button {
                            startEditing(nil)
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .foregroundColor(.brieflyPrimary)
                                .font(.headline)
                        }
                        .buttonStyle(.plain)
                    }
                }) {
                    if viewModel.isLoadingSchedules {
                        HStack {
                            ProgressView().tint(.brieflyPrimary)
                            Text("Loading schedules…")
                                .font(.subheadline)
                                .foregroundColor(.brieflyTextMuted)
                        }
                        .padding(.horizontal, 4)
                    }
                    if let error = viewModel.scheduleError {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.footnote)
                            .padding(.horizontal, 4)
                    }
                    ForEach(Array(viewModel.schedules.enumerated()), id: \.element.id) { index, schedule in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(viewModel.formattedTime(from: schedule.localTimeMinutes))
                                    .font(.body.weight(.semibold))
                                    .foregroundColor(.brieflyTextPrimary)
                                Text(schedule.frequency.displayName)
                                    .font(.footnote)
                                    .foregroundColor(.brieflyTextMuted)
                            }
                            Spacer()
                            Toggle("", isOn: Binding(get: {
                                schedule.isActive
                            }, set: { isOn in
                                Task { await viewModel.toggleSchedule(schedule, isActive: isOn) }
                            }))
                            .labelsHidden()
                            .tint(.brieflyPrimary)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            startEditing(schedule)
                        }
                        if index < viewModel.schedules.count - 1 {
                            Divider().padding(.leading, 14)
                        }
                    }
                }

                SettingsGroup(title: "Account actions") {
                    SettingsButtonRow(
                        title: "Sign out",
                        value: nil,
                        role: .destructive
                    ) { viewModel.logout() }
                }

                Spacer(minLength: 40)
            }
            .padding(.top, 20)
            .padding(.bottom, safeAreaBottomPadding + 40)
        }
        .background(Color.warmGrey.ignoresSafeArea())
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

private struct PlanSummaryCard: View {
    let entitlements: Entitlements?
    let email: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text(email ?? "Not signed in")
                    .font(.headline)
                    .foregroundColor(.brieflyTextPrimary)
                Text("Manage your Briefly plan and usage.")
                    .font(.subheadline)
                    .foregroundColor(.brieflyTextMuted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            Divider().padding(.leading, 16)
            VStack(alignment: .leading, spacing: 10) {
                Text(planTitle)
                    .font(.headline.weight(.semibold))
                    .foregroundColor(.brieflyTextPrimary)
                Text(usageLine)
                    .foregroundColor(.brieflyTextMuted)
                UsageProgressView(progress: usageProgressFraction)
                Text("Manage billing at brieflypodcast.app")
                    .font(.footnote)
                    .foregroundColor(.brieflyTextMuted)
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: Color.black.opacity(0.05), radius: 10, x: 0, y: 4)
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

private struct SettingsGroup<Content: View>: View {
    let title: String
    let trailing: AnyView
    let content: () -> Content

    init(title: String, @ViewBuilder trailing: () -> some View = { EmptyView() }, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.trailing = AnyView(trailing())
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.brieflyTextMuted)
                Spacer()
                trailing
            }
            .padding(.horizontal, 6)

            VStack(spacing: 0) {
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.brieflyBorder.opacity(0.4), lineWidth: 0.6)
            )
        }
        .padding(.horizontal, 16)
    }
}

private struct SettingsButtonRow: View {
    let title: String
    let value: String?
    var role: ButtonRole? = nil
    var action: () -> Void

    var body: some View {
        Button(role: role, action: action) {
            HStack {
                Text(title)
                    .foregroundColor(role == .destructive ? .brieflyDestructive : .brieflyTextPrimary)
                Spacer()
                if let value {
                    Text(value)
                        .foregroundColor(.brieflyTextMuted)
                }
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.brieflyBorder)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct SettingsToggleRow: View {
    let title: String
    @Binding var isOn: Bool

    var body: some View {
        HStack {
            Text(title)
                .foregroundColor(.brieflyTextPrimary)
            Spacer()
            Toggle("", isOn: $isOn)
                .labelsHidden()
                .tint(.brieflyPrimary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
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

                    Picker("Frequency", selection: $frequency) {
                        ForEach(ScheduleFrequency.allCases) { value in
                            Text(value.displayName).tag(value)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.brieflyBackground)
            .navigationTitle(isEditing ? "Edit schedule" : "Add schedule")
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
                if isEditing, let onDelete {
                    ToolbarItem(placement: .bottomBar) {
                        Button(role: .destructive) {
                            isPresented = false
                            onDelete()
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
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
