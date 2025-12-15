import SwiftUI

/// Inline validation helper for form fields.
struct InlineErrorText: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundColor(.red)
            Text(message)
                .font(.footnote)
                .foregroundColor(.red)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
    }
}

/// Lightweight banner for transient background errors.
struct ErrorBanner: View {
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?
    var onDismiss: (() -> Void)?

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundColor(.white)
                .font(.headline)

            Text(message)
                .foregroundColor(.white)
                .font(.subheadline)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            Spacer(minLength: 8)

            if let actionTitle, let action {
                Button(actionTitle) {
                    action()
                }
                .font(.caption.weight(.semibold))
                .padding(.vertical, 6)
                .padding(.horizontal, 10)
                .background(Color.white.opacity(0.18))
                .foregroundColor(.white)
                .clipShape(Capsule())
            }

            if let onDismiss {
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark")
                        .foregroundColor(.white.opacity(0.9))
                        .font(.caption.weight(.bold))
                }
                .buttonStyle(.plain)
                .padding(.leading, 4)
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .background(Color.red.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: Color.black.opacity(0.18), radius: 12, y: 4)
        .padding(.horizontal)
    }
}

/// Full-screen error placeholder when a view cannot render content.
struct FullScreenErrorView: View {
    let title: String
    let message: String
    var actionTitle: String = "Retry"
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 44, weight: .bold))
                .foregroundColor(.orange)

            Text(title)
                .font(.title3.bold())
                .multilineTextAlignment(.center)

            Text(message)
                .font(.body)
                .foregroundColor(.brieflyTextMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            if let action {
                Button(actionTitle) {
                    action()
                }
                .buttonStyle(.borderedProminent)
                .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .padding()
        .background(Color.brieflyBackground)
    }
}
