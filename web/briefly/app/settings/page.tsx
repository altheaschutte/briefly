"use client";

import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/context/AuthContext";
import { Bell, PlayCircle, Volume2, ShieldCheck, Clock3, Smartphone } from "lucide-react";

const playbackSettings = [
  { label: "Playback speed", value: "1.2x" },
  { label: "Auto-play latest", value: "On" },
  { label: "Resume last episode", value: "On" },
  { label: "Segment seek", value: "Enabled" }
];

const notificationSettings = [
  { label: "Daily ready ping", value: "7:00 AM" },
  { label: "Failed job alerts", value: "Immediate" },
  { label: "Quiet hours", value: "10:00 PM - 6:30 AM" },
  { label: "Topic ideas", value: "Weekly" }
];

export default function SettingsPage() {
  useRequireAuth();
  const { email } = useAuth();

  return (
    <div className="container space-y-12">
      <header className="glass-panel p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Settings</p>
            <h1 className="text-3xl font-semibold text-ink">Playback + notifications</h1>
            <p className="text-sm text-muted">
              Matches iOS defaults. Any change syncs across devices instantly. Signed in as {email ?? "unknown"}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span className="pill">CarPlay ready</span>
            <span className="pill">Supabase sessions</span>
            <span className="pill">Cross-device sync</span>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 text-ink">
              <PlayCircle className="h-5 w-5 text-accent" />
              Playback defaults
            </div>
            <p className="text-sm text-muted">Adjust how Briefly starts and resumes on web, iOS, and CarPlay.</p>
            <div className="mt-3 space-y-2">
              {playbackSettings.map((setting) => (
                <div key={setting.label} className="flex items-center justify-between rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">
                  <span className="text-sm text-ink">{setting.label}</span>
                  <button className="rounded-full border border-borderSoft px-3 py-1 text-xs text-muted transition hover:border-accent">
                    {setting.value}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 text-ink">
              <Bell className="h-5 w-5 text-accent" />
              Notifications
            </div>
            <p className="text-sm text-muted">Ready alerts, failed job pings, and topic nudges.</p>
            <div className="mt-3 space-y-2">
              {notificationSettings.map((setting) => (
                <div key={setting.label} className="flex items-center justify-between rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">
                  <span className="text-sm text-ink">{setting.label}</span>
                  <button className="rounded-full border border-borderSoft px-3 py-1 text-xs text-muted transition hover:border-accent">
                    {setting.value}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="glass-panel p-5">
          <div className="flex items-center gap-2 text-ink">
            <Volume2 className="h-5 w-5 text-accent" />
            Voice + audio
          </div>
          <p className="text-sm text-muted">Pick narration presets and save defaults for new Briefs.</p>
          <div className="mt-3 space-y-2 text-xs text-muted">
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Voice: Standard</div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Loudness: Normalized</div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Captions overlay: Off</div>
          </div>
        </div>
        <div className="glass-panel p-5">
          <div className="flex items-center gap-2 text-ink">
            <Clock3 className="h-5 w-5 text-accent" />
            Quiet hours
          </div>
          <p className="text-sm text-muted">Keep notifications respectful of your schedule.</p>
          <div className="mt-3 space-y-2 text-xs text-muted">
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Start: 10:00 PM</div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">End: 6:30 AM</div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Channel: Push + email</div>
          </div>
        </div>
        <div className="glass-panel p-5">
          <div className="flex items-center gap-2 text-ink">
            <ShieldCheck className="h-5 w-5 text-accent" />
            Sessions
          </div>
          <p className="text-sm text-muted">Manage logged-in devices and security.</p>
          <div className="mt-3 space-y-2 text-xs text-muted">
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Web · Active</div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">iPhone · Active</div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">CarPlay · Ready for handoff</div>
          </div>
        </div>
      </section>

      <section className="glass-panel flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-ink">
            <Smartphone className="h-5 w-5 text-accent" />
            Device sync
          </div>
          <p className="text-sm text-muted">
            Settings stay aligned across iOS and web. Changes here update your next mobile session automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded-full border border-borderSoft/60 px-3 py-1">Playback sync</span>
          <span className="rounded-full border border-borderSoft/60 px-3 py-1">Notifications sync</span>
          <span className="rounded-full border border-borderSoft/60 px-3 py-1">Voice presets sync</span>
        </div>
      </section>
    </div>
  );
}
