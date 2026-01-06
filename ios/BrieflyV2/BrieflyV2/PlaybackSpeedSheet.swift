import SwiftUI

struct PlaybackSpeedSheet: View {
    enum Style {
        case light
        case dark

        var titleColor: Color {
            switch self {
            case .light:
                return .brieflyTextPrimary
            case .dark:
                return .white
            }
        }

        var secondaryText: Color {
            switch self {
            case .light:
                return .brieflyTextMuted
            case .dark:
                return .white.opacity(0.6)
            }
        }

        var rowBackground: Color {
            switch self {
            case .light:
                return .brieflyBackground
            case .dark:
                return .brieflyDarkSurface
            }
        }

        var selectedBackground: Color {
            switch self {
            case .light:
                return Color.brieflyPrimary.opacity(0.12)
            case .dark:
                return Color.brieflyPrimary.opacity(0.2)
            }
        }

        var containerBackground: Color {
            switch self {
            case .light:
                return .brieflySurface
            case .dark:
                return .brieflyDeepBackground
            }
        }
    }

    let selectedSpeed: Double
    let onSelect: (Double) -> Void
    var style: Style = .light

    @Environment(\.dismiss) private var dismiss
    private let options = PlaybackPreferences.speedOptions

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Playback speed")
                .font(.headline)
                .foregroundColor(style.titleColor)

            VStack(spacing: 10) {
                ForEach(options, id: \.self) { speed in
                    let isSelected = abs(speed - selectedSpeed) < 0.001
                    Button {
                        onSelect(speed)
                        dismiss()
                    } label: {
                        HStack {
                            Text(speed.playbackSpeedLabel)
                                .font(.body.weight(.semibold))
                                .foregroundColor(style.titleColor)
                            Spacer()
                            if isSelected {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.brieflyPrimary)
                            }
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(isSelected ? style.selectedBackground : style.rowBackground)
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }

            Text("Applies to all episodes.")
                .font(.footnote)
                .foregroundColor(style.secondaryText)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(style.containerBackground)
    }
}

extension Double {
    var playbackSpeedLabel: String {
        let rounded = (self * 10).rounded() / 10
        if rounded.rounded() == rounded {
            return "\(Int(rounded))x"
        }
        return String(format: "%.1fx", rounded)
    }
}
