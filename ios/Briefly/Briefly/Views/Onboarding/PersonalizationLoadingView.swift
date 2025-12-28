import SwiftUI

struct PersonalizationLoadingView: View {
    var body: some View {
        ZStack {
            Color.black.opacity(0.55)
                .ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(1.2)
                VStack(spacing: 6) {
                    Text("We're personalizing your Briefly")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("Generating seed topics tailored to you. This usually takes a few seconds.")
                        .font(.subheadline)
                        .foregroundColor(.brieflyTextMuted)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: 280)
            }
            .padding(24)
            .background(Color.brieflySurface)
            .cornerRadius(16)
            .shadow(radius: 12)
        }
    }
}
