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
