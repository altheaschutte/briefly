import SwiftUI

struct InputFieldModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.brieflySurface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.brieflyBorder, lineWidth: 1)
            )
    }
}

extension View {
    func inputFieldStyle() -> some View {
        modifier(InputFieldModifier())
    }
}

struct BrieflyCapsuleButtonStyle: ButtonStyle {
    var background: Color = .brieflySecondary
    var foreground: Color = .white
    var horizontalPadding: CGFloat = 20
    var verticalPadding: CGFloat = 14

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.vertical, verticalPadding)
            .padding(.horizontal, horizontalPadding)
            .frame(maxWidth: .infinity)
            .background(background.opacity(configuration.isPressed ? 0.85 : 1))
            .foregroundColor(foreground)
            .clipShape(Capsule())
            .opacity(configuration.isPressed ? 0.95 : 1)
    }
}
