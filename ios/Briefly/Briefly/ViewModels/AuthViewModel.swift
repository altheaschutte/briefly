import Foundation
import os.log

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var email: String = ""
    @Published var code: String = ""
    @Published var errorMessage: String?
    @Published var statusMessage: String?
    @Published var isLoading: Bool = false
    @Published var codeSent: Bool = false

    private let appViewModel: AppViewModel
    private let authLog = OSLog(subsystem: "com.briefly.app", category: "Auth")

    init(appViewModel: AppViewModel) {
        self.appViewModel = appViewModel
    }

    func sendCode() async {
        os_log("Send OTP tapped for email: %{public}@", log: authLog, type: .info, email)
        errorMessage = nil
        statusMessage = nil
        guard validateEmail() else {
            os_log("OTP blocked due to invalid email: %{public}@", log: authLog, type: .error, email)
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            try await appViewModel.sendOtp(email: email)
            codeSent = true
            statusMessage = "Check your email for the 6-digit code."
            os_log("OTP sent for email: %{public}@", log: authLog, type: .info, email)
        } catch {
            os_log("OTP send failed for email: %{public}@ error: %{public}@", log: authLog, type: .error, email, error.localizedDescription)
            errorMessage = error.localizedDescription
        }
    }

    func verifyCode() async {
        os_log("Verify OTP tapped for email: %{public}@", log: authLog, type: .info, email)
        errorMessage = nil
        statusMessage = nil
        guard validateEmail() else { return }
        guard code.trimmingCharacters(in: .whitespacesAndNewlines).count >= 6 else {
            errorMessage = "Enter the 6-digit code."
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            try await appViewModel.verifyOtp(email: email, code: code)
            statusMessage = "Signed in!"
            os_log("OTP verification succeeded for email: %{public}@", log: authLog, type: .info, email)
        } catch {
            os_log("OTP verification failed for email: %{public}@ error: %{public}@", log: authLog, type: .error, email, error.localizedDescription)
            errorMessage = error.localizedDescription
        }
    }

    func signInWithGoogle() async {
        os_log("Google sign-in tapped", log: authLog, type: .info)
        errorMessage = nil
        statusMessage = nil
        isLoading = true
        defer { isLoading = false }
        do {
            try await appViewModel.signInWithGoogle()
            statusMessage = "Signed in!"
            os_log("Google sign-in succeeded", log: authLog, type: .info)
        } catch {
            if isUserCancelledWebAuthentication(error) {
                os_log("Google sign-in cancelled by user", log: authLog, type: .info)
                return
            }
            os_log("Google sign-in failed: %{public}@", log: authLog, type: .error, error.localizedDescription)
            errorMessage = error.localizedDescription
        }
    }

    func handleCodeChange(_ newValue: String) {
        let digitsOnly = newValue.filter { $0.isNumber }
        let trimmed = String(digitsOnly.prefix(6))
        if trimmed != code {
            code = trimmed
            return
        }
        guard codeSent, trimmed.count == 6, isLoading == false else { return }
        Task { await verifyCode() }
    }

    private func validateEmail() -> Bool {
        guard email.contains("@") else {
            errorMessage = "Enter a valid email."
            return false
        }
        return true
    }

    private func isUserCancelledWebAuthentication(_ error: Error) -> Bool {
        if error is CancellationError {
            return true
        }

        if let urlError = error as? URLError, urlError.code == .cancelled {
            return true
        }

        return isUserCancelledWebAuthenticationNSError(error as NSError)
    }

    private func isUserCancelledWebAuthenticationNSError(_ error: NSError) -> Bool {
        if error.code == 1, error.domain.contains("WebAuthenticationSession") {
            return true
        }

        if let underlying = error.userInfo[NSUnderlyingErrorKey] as? NSError {
            return isUserCancelledWebAuthenticationNSError(underlying)
        }

        return false
    }
}
