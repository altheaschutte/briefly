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

/// Full-screen error placeholder when a view cannot render content.
struct FullScreenErrorView: View {
    let title: String
    let message: String
    var actionTitle: String = "Retry"
    var action: (() -> Void)?

    var body: some View {
        ZStack {
            Color.brieflyBackground
                .ignoresSafeArea()

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
            .padding(.horizontal, 28)
            .padding(.vertical, 32)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }
}
