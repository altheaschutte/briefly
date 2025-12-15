import SwiftUI

enum AuthMode: String, CaseIterable, Identifiable {
    case login = "Login"
    case signup = "Sign Up"
    case forgot = "Forgot Password"

    var id: String { rawValue }
}

struct AuthFlowView: View {
    @State private var mode: AuthMode = .login
    @StateObject private var viewModel: AuthViewModel

    init(appViewModel: AppViewModel) {
        _viewModel = StateObject(wrappedValue: AuthViewModel(appViewModel: appViewModel))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Picker("", selection: $mode) {
                    ForEach([AuthMode.login, .signup]) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)

                switch mode {
                case .login:
                    loginForm
                case .signup:
                    signupForm
                case .forgot:
                    forgotForm
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Account")
            .background(Color.brieflyBackground)
        }
    }

    private var loginForm: some View {
        VStack(spacing: 12) {
            TextField("Email", text: $viewModel.email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .textContentType(.username)
                .inputFieldStyle()
            SecureField("Password", text: $viewModel.password)
                .textContentType(.password)
                .inputFieldStyle()

            if let error = viewModel.errorMessage {
                InlineErrorText(message: error)
            }

            Button(action: {
                Task { await viewModel.login() }
            }) {
                if viewModel.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding()
                } else {
                    Text("Log in")
                        .frame(maxWidth: .infinity)
                        .padding()
                }
            }
            .background(Color.brieflyPrimary)
            .foregroundColor(.white)
            .cornerRadius(12)

            Button(action: { mode = .forgot }) {
                Text("Forgot password?")
                    .font(.footnote)
                    .foregroundColor(.brieflyTextMuted)
            }
        }
    }

    private var signupForm: some View {
        VStack(spacing: 12) {
            TextField("Email", text: $viewModel.email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .inputFieldStyle()
            SecureField("Password", text: $viewModel.password)
                .inputFieldStyle()
            SecureField("Confirm Password", text: $viewModel.confirmPassword)
                .inputFieldStyle()

            if let error = viewModel.errorMessage {
                InlineErrorText(message: error)
            }

            Button(action: {
                Task { await viewModel.signup() }
            }) {
                if viewModel.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding()
                } else {
                    Text("Sign up")
                        .frame(maxWidth: .infinity)
                        .padding()
                }
            }
            .background(Color.brieflyPrimary)
            .foregroundColor(.white)
            .cornerRadius(12)
        }
    }

    private var forgotForm: some View {
        VStack(spacing: 12) {
            Text("Forgot password")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Enter your email and we'll send reset instructions. (Stub UI)")
                .foregroundColor(.brieflyTextMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
            TextField("Email", text: $viewModel.email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .inputFieldStyle()

            Button("Send reset link") { }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.brieflySecondary)
                .foregroundColor(.white)
                .cornerRadius(12)

            Button("Back to login") {
                mode = .login
            }
            .font(.footnote)
            .foregroundColor(.brieflyTextMuted)
        }
    }
}
