export type EpisodeStatus = "ready" | "queued" | "generating" | "failed";

export type Episode = {
  id: string;
  title: string;
  description: string;
  duration: string;
  publishedAt: string;
  status: EpisodeStatus;
  segments: { title: string; duration: string }[];
  progress?: number;
  cover?: string;
};

export type Topic = {
  title: string;
  summary: string;
  status: "active" | "paused";
};

export type SubscriptionTier = {
  name: string;
  price: string;
  cadence: string;
  highlight?: boolean;
  tagline: string;
  features: string[];
  cta: string;
  note?: string;
};

export const heroHighlights = [
  { label: "Hands-free", text: "Auto-generated talk-show style hosts guide every story." },
  { label: "Personalized", text: "Topics tuned to you and refreshed daily without any effort." },
  { label: "Trustworthy", text: "Source citations and transcripts when you want to read deeper." }
];

export const featureCards = [
  {
    badge: "Onboarding",
    title: "Tell Briefly what matters",
    description:
      "Speak or type your interests. We stream transcripts and extract the five topics you care about most with live feedback.",
    metric: "Voice-to-topics in under 60 seconds"
  },
  {
    badge: "Topics",
    title: "Stay in control",
    description:
      "Drag-and-drop reorder, toggle active topics, and set a cap so every Brief sticks to the themes you actually want.",
    metric: "Five active slots keep episodes focused"
  },
  {
    badge: "Episodes",
    title: "Fresh briefs on demand",
    description:
      "Generate a new episode anytime, watch the pipeline move from retrieval to script to audio, and resume in-flight jobs.",
    metric: "Jobs run in parallel so you never wait long"
  },
  {
    badge: "Playback",
    title: "Spotify-style listening",
    description:
      "Speed controls, scrubber, resume where you left off, and segment-level jumps. Cover art and notes travel with you.",
    metric: "Works on desktop, mobile, and CarPlay"
  },
  {
    badge: "Sources",
    title: "Citations you can trust",
    description:
      "Every segment keeps its source list and optional transcript. Jump to the original articles or ask Briefly to go deeper.",
    metric: "Sources stay attached to each story"
  },
  {
    badge: "Account",
    title: "Manage everything in one place",
    description:
      "Subscription, billing, and playback defaults now live on web. Swap tiers, update cards, or set notification prefs instantly.",
    metric: "No app required for account updates"
  }
];

export const topics: Topic[] = [
  { title: "Global headlines", summary: "Overnight world news and policy moves", status: "active" },
  { title: "Climate & energy", summary: "Breakthroughs and policy shifts shaping the planet", status: "active" },
  { title: "AI + startups", summary: "Funding rounds, launches, and what they mean", status: "active" },
  { title: "Arts near you", summary: "What to see around the Sunshine Coast this weekend", status: "paused" },
  { title: "Longform picks", summary: "Big ideas and essays worth a listen", status: "paused" }
];

export const episodes: Episode[] = [
  {
    id: "ep-today",
    title: "Morning Brief — Today",
    description: "Three stories tuned to your active topics plus a local curveball.",
    duration: "08:12",
    publishedAt: "Live now",
    status: "ready",
    progress: 68,
    segments: [
      { title: "AI round-up", duration: "02:30" },
      { title: "Climate update", duration: "03:10" },
      { title: "Local arts pick", duration: "02:32" }
    ],
    cover: "/phone-library.svg"
  },
  {
    id: "ep-yesterday",
    title: "Yesterday’s rewind",
    description: "Recency-grouped stories with links back to the original sources.",
    duration: "07:04",
    publishedAt: "Yesterday",
    status: "ready",
    segments: [
      { title: "Markets and policy", duration: "02:15" },
      { title: "Tech launches", duration: "02:27" },
      { title: "World briefing", duration: "02:22" }
    ]
  },
  {
    id: "ep-queued",
    title: "Evening catch-up",
    description: "Queued with a 10 minute target. We will notify you when ready.",
    duration: "10:00",
    publishedAt: "Queued",
    status: "queued",
    segments: [
      { title: "Cultural picks", duration: "03:10" },
      { title: "Science explainer", duration: "03:50" }
    ]
  },
  {
    id: "ep-generating",
    title: "Commute mix",
    description: "Regenerating segments after topic edits. Audio renders next.",
    duration: "12:00",
    publishedAt: "Processing",
    status: "generating",
    progress: 45,
    segments: [
      { title: "Retrieving sources", duration: "—" },
      { title: "Writing script", duration: "—" }
    ]
  }
];

export const subscriptionTiers: SubscriptionTier[] = [
  {
    name: "Free Listener",
    price: "$0",
    cadence: "forever",
    tagline: "Occasional briefs, lighter personalization, and read-only transcripts.",
    features: [
      "Two fresh Briefly episodes per week",
      "Up to three active topics",
      "0.8x - 1.5x playback speeds",
      "Transcripts and show notes"
    ],
    cta: "Stay on free"
  },
  {
    name: "Briefly Plus",
    price: "$9",
    cadence: "per month",
    highlight: true,
    tagline: "Your daily Brief with full topic control and smarter playback.",
    features: [
      "Daily episodes with priority rendering",
      "Five active topics + reordering",
      "Segment-level seeking and bookmarking",
      "Download for offline and CarPlay handoff",
      "Notification controls by time of day"
    ],
    cta: "Start Plus"
  },
  {
    name: "Producer",
    price: "$19",
    cadence: "per month",
    tagline: "For power listeners and teams that want deeper dives.",
    features: [
      "Unlimited episode generation",
      "Longer (15–20 min) mixes",
      "Voice selection and saved presets",
      "Priority support and feedback loop",
      "Shareable episode links with sources"
    ],
    cta: "Upgrade to Producer",
    note: "Great for founders, analysts, and editors"
  }
];

export const accountSettingsBlocks = [
  {
    title: "Profile & identity",
    description: "Name, email, and handle used across the Briefly ecosystem.",
    fields: [
      { label: "Full name", value: "Althea Schutte" },
      { label: "Email", value: "you@briefly.fm" },
      { label: "Handle", value: "@briefly_you" }
    ]
  },
  {
    title: "Playback defaults",
    description: "Your baseline settings for any device signed in to your account.",
    fields: [
      { label: "Default speed", value: "1.2x" },
      { label: "Auto-play latest", value: "On" },
      { label: "Resume last episode", value: "On" },
      { label: "Caption overlays", value: "Off" }
    ]
  },
  {
    title: "Notifications",
    description: "Pick your nudges. We honor quiet hours automatically.",
    fields: [
      { label: "Daily ready ping", value: "7:00 AM" },
      { label: "New topic ideas", value: "Weekly" },
      { label: "Failed job alerts", value: "Immediate" }
    ]
  },
  {
    title: "Billing & plan",
    description: "Update payment details, invoices, and subscription tier.",
    fields: [
      { label: "Plan", value: "Briefly Plus — monthly" },
      { label: "Next renewal", value: "Apr 28, 2025" },
      { label: "Payment method", value: "Amex • 4210" }
    ]
  }
];
