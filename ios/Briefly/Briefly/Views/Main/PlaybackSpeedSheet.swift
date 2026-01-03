import SwiftUI

struct PlaybackSpeedSheet: View {
    let selectedSpeed: Double
    let onSelect: (Double) -> Void

    @Environment(\.dismiss) private var dismiss
    private let options = PlaybackPreferences.speedOptions

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Playback speed")
                .font(.headline)
                .foregroundColor(.brieflyTextPrimary)

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
                                .foregroundColor(.brieflyTextPrimary)
                            Spacer()
                            if isSelected {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.brieflyPrimary)
                            }
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(isSelected ? Color.brieflyPrimary.opacity(0.12) : Color.brieflyBackground)
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }

            Text("Applies to all episodes.")
                .font(.footnote)
                .foregroundColor(.brieflyTextMuted)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.brieflySurface)
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
