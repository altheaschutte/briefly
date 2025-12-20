export default function SupportPage() {
  return (
    <div className="container">
      <div className="glass-panel mx-auto max-w-3xl space-y-4 p-8">
        <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Support</p>
        <h1 className="text-3xl font-semibold text-white">Need help with Briefly on web?</h1>
        <p className="text-base text-muted">
          Email support@briefly.fm with your account email and a short note. We respond fastest to playback issues,
          billing changes, and topic onboarding questions.
        </p>
        <ul className="space-y-2 text-sm text-muted">
          <li>• Playback or sync issues — include device + browser</li>
          <li>• Billing — we can adjust plans or send invoices on demand</li>
          <li>• Topic quality — share examples and we will tune retrieval</li>
        </ul>
      </div>
    </div>
  );
}
