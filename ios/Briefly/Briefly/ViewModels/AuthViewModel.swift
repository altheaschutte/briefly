import Foundation
import os.log

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var email: String = ""
    @Published var password: String = ""
    @Published var confirmPassword: String = ""
    @Published var errorMessage: String?
    @Published var isLoading: Bool = false

    private let appViewModel: AppViewModel
    private let authLog = OSLog(subsystem: "com.briefly.app", category: "Auth")

    init(appViewModel: AppViewModel) {
        self.appViewModel = appViewModel
    }

    func login() async {
        os_log("Login tapped for email: %{public}@", log: authLog, type: .info, email)
        guard validateEmail() else {
            os_log("Login blocked due to invalid email: %{public}@", log: authLog, type: .error, email)
            return
        }
        isLoading = true
        os_log("Starting login request for email: %{public}@", log: authLog, type: .debug, email)
        defer {
            isLoading = false
            os_log("Login flow finished for email: %{public}@", log: authLog, type: .debug, email)
        }
        do {
            try await appViewModel.handleLogin(email: email, password: password)
            os_log("Login succeeded for email: %{public}@", log: authLog, type: .info, email)
        } catch {
            os_log("Login failed for email: %{public}@ error: %{public}@", log: authLog, type: .error, email, error.localizedDescription)
            errorMessage = error.localizedDescription
        }
    }

    func signup() async {
        guard validateEmail(), password == confirmPassword else {
            errorMessage = "Passwords must match."
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            try await appViewModel.handleSignup(email: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func logout() {
        appViewModel.logout()
    }

    private func validateEmail() -> Bool {
        guard email.contains("@") else {
            errorMessage = "Enter a valid email."
            return false
        }
        return true
    }
}
