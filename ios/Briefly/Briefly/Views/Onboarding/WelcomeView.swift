import SwiftUI

struct WelcomeView: View {
    let onStart: () -> Void
    let onShowAuth: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            VStack(alignment: .leading, spacing: 12) {
                Text("Welcome to Briefly — your personal, AI-generated podcast.")
                    .font(.title.bold())
                Text("Tell me what you’re interested in listening to.")
                    .foregroundColor(.brieflyTextMuted)
                Text("I’ll extract up to 5 topics from your conversation.")
                    .foregroundColor(.brieflyTextMuted)
                Text("When you're happy, you can generate your first episode.")
                    .foregroundColor(.brieflyTextMuted)
                Text("New episodes will be generated daily for your commute.")
                    .foregroundColor(.brieflyTextMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: "mic.circle.fill")
                .resizable()
                .scaledToFit()
                .frame(width: 120, height: 120)
                .foregroundColor(Color.brieflyPrimary)
                .padding(.vertical, 20)

            Button(action: onStart) {
                Text("Get Started")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.brieflyPrimary)
                    .foregroundColor(.white)
                    .clipShape(Capsule())
            }
            Button("Sign in or sign up", action: onShowAuth)
                .padding(.top, 8)
            Spacer()
        }
        .padding()
        .background(Color.brieflyBackground)
    }
}
