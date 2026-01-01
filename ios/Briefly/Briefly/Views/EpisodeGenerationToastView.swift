import SwiftUI

struct EpisodeGenerationToastView: View {
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            ProgressView()
                .tint(.white)
                .scaleEffect(0.9)
            Text(text)
                .font(.footnote.weight(.semibold))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.brieflyBackground)
        .overlay {
            Capsule()
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        }
        .clipShape(Capsule())
        .shadow(color: Color.black.opacity(0.22), radius: 10, y: 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(text)
    }
}

