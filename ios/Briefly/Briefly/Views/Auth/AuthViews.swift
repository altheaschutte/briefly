import SwiftUI

struct AuthFlowView: View {
    @StateObject private var viewModel: AuthViewModel

    init(appViewModel: AppViewModel) {
        _viewModel = StateObject(wrappedValue: AuthViewModel(appViewModel: appViewModel))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.brieflyBackground
                    .ignoresSafeArea()

                VStack {
                    Spacer()

                    VStack(spacing: 48) {
                        VStack(spacing: 12) {
                            Image("BrieflyLogo")
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 72, height: 72)
                                .cornerRadius(16)

                            Text("Briefly".uppercased())
                                .font(.system(size: 14, weight: .semibold))
                                .tracking(3)
                                .foregroundColor(.brieflyAccentSoft)
                        }

                        VStack(alignment: .leading, spacing: 16) {
                            Button {
                                Task { await viewModel.signInWithGoogle() }
                            } label: {
                                HStack(spacing: 12) {
                                    GoogleLogoView()
                                    Text("Continue with Google")
                                        .fontWeight(.semibold)
                                    Spacer()
                                }
                                .padding()
                                .frame(maxWidth: .infinity)
                                .background(Color.white.opacity(0.12))
                                .foregroundColor(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .stroke(Color.brieflyBorder, lineWidth: 1)
                                )
                            }
                            .disabled(viewModel.isLoading)

                            DividerWithLabel(label: "Or")

                            VStack(alignment: .leading, spacing: 8) {
                                Text("Email")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(.white)

                                TextField(
                                    "Email",
                                    text: $viewModel.email,
                                    prompt: Text(verbatim: "name@example.com")
                                        .foregroundColor(.white.opacity(0.55))
                                )
                                    .textInputAutocapitalization(.never)
                                    .keyboardType(.emailAddress)
                                    .textContentType(.username)
                                    .disableAutocorrection(true)
                                    .disabled(viewModel.codeSent)
                                    .inputFieldStyle()
                                    .foregroundColor(.white)
                            }

                            if viewModel.codeSent {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("6-digit code")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(.white)

                                    TextField(
                                        "6-digit code",
                                        text: $viewModel.code,
                                        prompt: Text("••••••")
                                            .foregroundColor(.white.opacity(0.55))
                                    )
                                        .keyboardType(.numberPad)
                                        .textContentType(.oneTimeCode)
                                        .onChange(of: viewModel.code) { newValue in
                                            viewModel.handleCodeChange(newValue)
                                        }
                                        .inputFieldStyle()
                                        .foregroundColor(.white)
                                }
                            }

                            if let error = viewModel.errorMessage {
                                InlineErrorText(message: error)
                            }

                            Button(action: {
                                Task {
                                    if viewModel.codeSent {
                                        await viewModel.verifyCode()
                                    } else {
                                        await viewModel.sendCode()
                                    }
                                }
                            }) {
                                HStack {
                                    if viewModel.isLoading {
                                        ProgressView()
                                            .tint(.white)
                                    } else {
                                        Text(viewModel.codeSent ? "Verify code" : "Continue")
                                            .fontWeight(.semibold)
                                    }

                                    Spacer()

                                    Image(systemName: viewModel.codeSent ? "checkmark" : "arrow.right")
                                        .font(.system(size: 18, weight: .semibold))
                                }
                                .padding()
                                .frame(maxWidth: .infinity)
                                .background(Color.brieflyPrimary)
                                .foregroundColor(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                        }
                        .frame(maxWidth: 420)
                    }
                    .padding(.horizontal, 24)

                    Spacer()
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationBarBackButtonHidden(true)
        }
    }
}

private struct GoogleLogoView: View {
    var body: some View {
        ZStack {
            Path { path in
                path.move(to: CGPoint(x: 12.0003, y: 4.75))
                path.addCurve(
                    to: CGPoint(x: 16.6053, y: 6.54998),
                    control1: CGPoint(x: 13.7703, y: 4.75),
                    control2: CGPoint(x: 15.3553, y: 5.36002)
                )
                path.addLine(to: CGPoint(x: 20.0303, y: 3.125))
                path.addCurve(
                    to: CGPoint(x: 12.0003, y: 0),
                    control1: CGPoint(x: 17.9502, y: 1.19),
                    control2: CGPoint(x: 15.2353, y: 0)
                )
                path.addCurve(
                    to: CGPoint(x: 1.28027, y: 6.60998),
                    control1: CGPoint(x: 7.31028, y: 0),
                    control2: CGPoint(x: 3.25527, y: 2.69)
                )
                path.addLine(to: CGPoint(x: 5.27028, y: 9.70498))
                path.addCurve(
                    to: CGPoint(x: 12.0003, y: 4.75),
                    control1: CGPoint(x: 6.21525, y: 6.86002),
                    control2: CGPoint(x: 8.87028, y: 4.75)
                )
                path.closeSubpath()
            }
            .fill(Color(red: 234 / 255, green: 67 / 255, blue: 53 / 255))

            Path { path in
                path.move(to: CGPoint(x: 23.49, y: 12.275))
                path.addCurve(
                    to: CGPoint(x: 23.3, y: 10),
                    control1: CGPoint(x: 23.49, y: 11.49),
                    control2: CGPoint(x: 23.415, y: 10.73)
                )
                path.addLine(to: CGPoint(x: 12, y: 10))
                path.addLine(to: CGPoint(x: 12, y: 14.51))
                path.addLine(to: CGPoint(x: 18.47, y: 14.51))
                path.addCurve(
                    to: CGPoint(x: 16.08, y: 18.1),
                    control1: CGPoint(x: 18.18, y: 15.99),
                    control2: CGPoint(x: 17.34, y: 17.25)
                )
                path.addLine(to: CGPoint(x: 19.945, y: 21.1))
                path.addCurve(
                    to: CGPoint(x: 23.49, y: 12.275),
                    control1: CGPoint(x: 22.2, y: 19.01),
                    control2: CGPoint(x: 23.49, y: 15.92)
                )
                path.closeSubpath()
            }
            .fill(Color(red: 66 / 255, green: 133 / 255, blue: 244 / 255))

            Path { path in
                path.move(to: CGPoint(x: 5.26498, y: 14.2949))
                path.addCurve(
                    to: CGPoint(x: 4.88501, y: 11.9999),
                    control1: CGPoint(x: 5.02498, y: 13.5699),
                    control2: CGPoint(x: 4.88501, y: 12.7999)
                )
                path.addCurve(
                    to: CGPoint(x: 5.26498, y: 9.7049),
                    control1: CGPoint(x: 4.88501, y: 11.1999),
                    control2: CGPoint(x: 5.01998, y: 10.4299)
                )
                path.addLine(to: CGPoint(x: 1.275, y: 6.60986))
                path.addCurve(
                    to: CGPoint(x: 0, y: 11.9999),
                    control1: CGPoint(x: 0.46, y: 8.22986),
                    control2: CGPoint(x: 0, y: 10.0599)
                )
                path.addCurve(
                    to: CGPoint(x: 1.28, y: 17.3899),
                    control1: CGPoint(x: 0, y: 13.9399),
                    control2: CGPoint(x: 0.46, y: 15.7699)
                )
                path.addLine(to: CGPoint(x: 5.26498, y: 14.2949))
                path.closeSubpath()
            }
            .fill(Color(red: 251 / 255, green: 188 / 255, blue: 5 / 255))

            Path { path in
                path.move(to: CGPoint(x: 12.0004, y: 24.0001))
                path.addCurve(
                    to: CGPoint(x: 19.9454, y: 21.095),
                    control1: CGPoint(x: 15.2404, y: 24.0001),
                    control2: CGPoint(x: 17.9654, y: 22.935)
                )
                path.addLine(to: CGPoint(x: 16.0804, y: 18.095))
                path.addCurve(
                    to: CGPoint(x: 12.0004, y: 19.245),
                    control1: CGPoint(x: 15.0054, y: 18.82),
                    control2: CGPoint(x: 13.6204, y: 19.245)
                )
                path.addCurve(
                    to: CGPoint(x: 5.2654, y: 14.29),
                    control1: CGPoint(x: 8.8704, y: 19.245),
                    control2: CGPoint(x: 6.21537, y: 17.135)
                )
                path.addLine(to: CGPoint(x: 1.27539, y: 17.385))
                path.addCurve(
                    to: CGPoint(x: 12.0004, y: 24.0001),
                    control1: CGPoint(x: 3.25539, y: 21.31),
                    control2: CGPoint(x: 7.3104, y: 24.0001)
                )
                path.closeSubpath()
            }
            .fill(Color(red: 52 / 255, green: 168 / 255, blue: 83 / 255))
        }
        .frame(width: 18, height: 18)
    }
}

private struct DividerWithLabel: View {
    var label: String

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Rectangle()
                .fill(Color.white.opacity(0.15))
                .frame(height: 1)

            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundColor(.white.opacity(0.7))
                .textCase(.uppercase)
                .tracking(2)

            Rectangle()
                .fill(Color.white.opacity(0.15))
                .frame(height: 1)
        }
    }
}
