import SwiftUI

struct PersonalizationLoadingView: View {
    var body: some View {
        ZStack {
            Color.warmGrey
                .ignoresSafeArea()
            VStack(spacing: 18) {
                Image("BrieflyWordmark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 180)
                ProgressView()
                    .tint(.brieflyPrimary)
                    .scaleEffect(1.1)
            }
        }
    }
}
