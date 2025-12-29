# Briefly

## High-Level Architecture
- iOS app (`ios/Briefly/`) in Swift/SwiftUI with a CarPlay audio extension.
- Marketing website (`briefly-landing/`) built with Astro + Tailwind CSS.
- Web app (`web/briefly/`) built with Next.js + Tailwind, mirroring the iOS feature set (login, library, create/topics, settings, Stripe billing).
- Backend NestJS API (`backend/`) with a BullMQ worker for episode generation and a schedule runner that queues auto-episodes.
- Supabase for Auth + Postgres (row-level security), Redis for queues, and S3-compatible storage for audio and covers.
- AI services are pluggable: LLMs (OpenAI/Anthropic/Gemini), TTS vendors (e.g. ElevenLabs), search/retrieval via Perplexity.
- Deployment targeting Render (web service + background worker + managed Redis).

## Tech Stack
- Backend: NestJS 10 (TypeScript/Express), BullMQ + Redis, Stripe SDK, jose for JWT verification, AWS SDK for S3, Luxon for scheduling, worker entry at `backend/worker/worker-main.ts`.
- Data: Supabase Postgres with RLS, migrations in `backend/supabase/migrations`, seed data in `backend/supabase/seed.sql`, billing/usage/schedule tables for entitlements.
- Auth: Supabase JWTs enforced by a global guard (`Authorization: Bearer <token>`); JWKS or HS secret supported.
- AI: LLM abstraction with interchangeable providers; onboarding transcription uses OpenAI (`gpt-4o-transcribe` by default). TTS providers are swappable.
- Mobile: Swift/SwiftUI client + CarPlay extension; communicates with the NestJS API using Supabase auth tokens.
- Web app: Next.js + Tailwind in `web/briefly`, designed to match iOS features (topics, episodes, playback, billing via Stripe).
- Landing: Astro 5 + Tailwind CSS 4 (Vite) in `briefly-landing/`; scripts: `npm run dev`, `npm run build`, `npm run preview`.

## Current App Features
- Auth, billing, and entitlements: Supabase auth with Stripe checkout/portal; entitlements enforce per-tier caps (minutes/month, max episode duration, active topics, schedule availability) and record usage once episodes are ready.
- Onboarding: live voice capture streaming to `/onboarding/stream` (SSE transcripts + topic extraction), manual entry fallback, and a `/onboarding/complete` step that saves timezone + schedule plus topic seeding via user-provided context.
- Topics: create/edit/deactivate topics, enforce max active topics from the current plan, drag-and-drop reordering, and LLM-powered seeding from `user_about_context` or onboarding transcripts.
- Episodes + library: trigger episode jobs, poll status through the pipeline, resume in-flight jobs on app launch, and show covers/notes/segments/source links with signed audio URLs when missing from payloads.
- Scheduling: timezone-aware schedules (daily/every N days/weekly) with target durations; onboarding bootstraps a default schedule, and the worker sweeps every 5 minutes to queue due episodes while logging run history.
- Notifications: register/unregister push device tokens and send APNs on episode ready/failure.
- Playback: global audio player with play/pause/resume, segment-level seeking, progress tracking, and configurable speed plus player bar.
- Settings + profile: playback preferences, logout, timezone updates, and stored `user_about_context` to personalize topic generation.

## TODO Features
- Wire Episode detail secondary actions (transcript view, bookmark/queue, share, “talk to producer”, overflow) to real flows/endpoints.
- Add voice selection in Settings (UI placeholder exists) and surface multiple TTS voices when available.
- Build notification settings/UX once backend support is ready (currently a placeholder section).
- Add the analytics snippet to `briefly-landing` once tracking is decided.
- Hook the new Next.js web app to Supabase auth + backend endpoints (topics, episodes, billing) instead of static data.

## Repository Structure
```text
.
├─ backend/              # NestJS API + BullMQ worker + Supabase migrations
├─ briefly-landing/      # Marketing site (Astro + Tailwind)
├─ ios/Briefly/          # Xcode workspace (Swift/SwiftUI app + CarPlay extension)
├─ web/briefly/          # Next.js web app mirroring iOS features
├─ branding/             # Visual assets
├─ supabase/             # Additional database migrations (project-level)
└─ README.md
```

## Brand & UI Theme
- Dark mode only: the entire experience sits on a deep midnight background.
- Palette:
  - `#132a3b` — primary background
  - `#1f3a4e` — card and surface panels
  - `#ffa563` — brightest accent for primary CTAs and highlights (always white text)
  - `#2a7997`, `#37a8ae`, `#93c8c2` — secondary teals for secondary buttons, chips, duration labels, and glow accents (also white text on any button treatment)
- Foreground: use near-white text for headings and lighter body copy, with muted text on surfaces for readability.
- Imagery: cover art and illustration prompts lean on pastel takes of these colors blended with complementary hues for cohesion without being repetitive.

## Database Schema (Supabase/Postgres)
- `topics`: `id uuid` PK, `user_id uuid`, `original_text text` (unique per user), `order_index int`, `is_active bool`, `is_seed bool`, timestamps; RLS restricts to `auth.uid() = user_id`.
- `topic_queries`: `id uuid`, `user_id uuid`, `topic_id` → `topics`, `episode_id` → `episodes`, `query text`, `answer text`, `citations jsonb[]`, optional `intent`, `order_index int`, timestamps; RLS user-scoped.
- `episodes`: `id uuid` PK, `user_id uuid`, optional `episode_number`, `title`, `description`, `status enum (queued | rewriting_queries | retrieving_content | generating_script | generating_audio | ready | failed)`, `archived_at`, `target_duration_minutes int`, `duration_seconds numeric`, `audio_url`, `cover_image_url`, `cover_prompt`, `transcript`, `script_prompt`, `show_notes`, `error_message`, `usage_recorded_at`, timestamps. Trigger assigns per-user `episode_number`; RLS user-scoped; `archived_at` filters list views.
- `episode_segments`: `id uuid` PK, `episode_id` → `episodes` (cascade), `order_index int`, `title`, `raw_content text`, `raw_sources jsonb`, `script`, `audio_url`, `start_time_seconds numeric`, `duration_seconds numeric`, `created_at`; RLS tied to owning episode.
- `episode_sources`: `id uuid` PK, `episode_id` → `episodes` (cascade), optional `segment_id` FK to `episode_segments`, `source_title text`, `url text`, `type text`, `created_at`; RLS tied to owning episode.
- `onboarding_transcripts`: `id uuid` PK, `user_id uuid`, `transcript text`, `status in_progress|completed|failed|cancelled`, `extracted_topics jsonb`, `error_message`, timestamps; RLS user-scoped.
- `profiles`: `id uuid` PK → `auth.users`, `first_name`, `intention`, `user_about_context`, `timezone`, timestamps; RLS scoped to the owning user.
- `user_subscriptions`: `user_id uuid` PK, `stripe_customer_id`, `stripe_subscription_id` (unique), `tier enum (free|starter|pro|power)`, `status enum (none|active|trialing|past_due|canceled|incomplete)`, `current_period_start/end timestamptz`, `cancel_at_period_end bool`, timestamps; RLS user-scoped.
- `usage_periods`: `id uuid`, `user_id uuid`, `period_start timestamptz`, `period_end timestamptz`, `minutes_used numeric`, `seconds_used numeric`, timestamps; unique `(user_id, period_start, period_end)`; RLS user-scoped.
- `device_tokens`: `id uuid`, `user_id uuid` → `auth.users`, `platform text`, `token text unique`, `last_seen_at`, timestamps; RLS user-scoped.
- `episode_schedules`: `id uuid`, `user_id uuid` → `profiles`, `frequency enum (daily|every_2_days|every_3_days|every_4_days|every_5_days|every_6_days|weekly)`, `local_time_minutes int`, `timezone text`, `is_active bool`, `next_run_at timestamptz`, `last_run_at timestamptz`, `last_status enum (queued|success|skipped|failed)`, `last_error text`, `target_duration_minutes int`, timestamps; RLS user-scoped.
- `schedule_runs`: `id uuid`, `schedule_id` → `episode_schedules`, `user_id uuid`, `run_at timestamptz`, `status enum (queued|success|skipped|failed)`, `message text`, `episode_id uuid`, `duration_seconds numeric`, `created_at`; RLS user-scoped.

## API (NestJS)
- Base URL: default `http://localhost:3000`.
- Auth: `Authorization: Bearer <supabase JWT>` on every route except the Stripe webhook; JSON bodies; responses use camelCase with snake_case mirrors for some mobile clients.

### Root & Health
- `GET /` → `{ "name": "Briefly API", "status": "ok" }`.
- `GET /health` → `{ "ok": true }`.

### Topics
- `GET /topics?status=active|inactive&is_active=true|false` → list topics for the user (filter optional).
- `POST /topics` with `{ "original_text": "..." }` → creates a topic (enforces plan-based active cap). Returns topic with `isSeed`.
- `POST /topics/seed` with `{ "user_about_context": "..." }` → generates and persists seed topics from user context (respects active-topic limit).
- `PATCH /topics/:id` with `{ "original_text"?, "is_active"?, "order_index"? }` → updates and returns the topic.
- `DELETE /topics/:id` → soft-deactivates (`is_active: false`) and returns the topic.

### Episodes
- `POST /episodes` with optional `{ "duration": <minutes> }` → queues a new episode job after entitlement checks. Returns `{ "episodeId": "uuid", "status": "queued" }`.
- `GET /episodes` → lists non-archived, non-failed episodes (newest first) with camel + snake fields (`id`, `episode_number`, `status`, `title`, `description`, `target_duration_minutes`, `duration_seconds`, `audio_url`, `cover_image_url`, `cover_prompt`, `created_at`, `updated_at`).
- `GET /episodes/:id` → full episode with segments and sources (includes snake/camel mirrors for audio URLs, start/duration, raw_sources/rawSources).
- `GET /episodes/:id/sources` → array of source objects (`id`, `episode_id`, optional `segment_id`, `source_title`, `url`, `type`).
- `GET /episodes/:id/audio` → `{ "audioUrl": "https://signed-s3-url-or-null" }`.
- `DELETE /episodes/:id` → `{ "success": true }` (archives the episode).

### Onboarding
- `POST /onboarding/stream` (send raw audio bytes; content-type e.g. `audio/webm`). SSE events:
  - `session` → `{ "session_id": "<uuid>" }`
  - `transcript` → `{ "session_id": "...", "transcript": "partial text" }`
  - `completed` → `{ "session_id": "...", "transcript": "...", "topics": ["..."], "created_topic_ids": ["..."] }`
  - `error` → `{ "message": "transcription_failed|finalization_failed" }`
- `POST /onboarding/complete` with `{ "timezone"?, "local_time_minutes"?, "frequency"? }` → saves profile timezone (default `Australia/Brisbane`) and ensures/creates a schedule (default daily at 7:00). Returns `{ profile, schedule }`.

### Billing & Entitlements
- `GET /billing/tiers` → tier metadata including limits and Stripe price info.
- `POST /billing/checkout-session` with `{ "tier": "starter|pro|power" }` → Stripe Checkout session URL.
- `POST /billing/portal-session` → Stripe Billing Portal URL for the user.
- `POST /billing/webhook` → Stripe webhook endpoint (expects raw body + `Stripe-Signature`).
- `GET /billing/entitlements` or `GET /me/entitlements` → current tier, period window, limits, usage totals, and seconds remaining.

### Profiles
- `GET /me/profile` → stored profile (fallback placeholder if missing).
- `PATCH /me/profile` with `{ "timezone": "Continent/City" }` → updates timezone and recomputes schedule next-run times.

### Schedules
- `GET /schedules` → user schedules with snake_case fields.
- `POST /schedules` with `{ "frequency": "...", "local_time_minutes": 0-1439, "timezone": "...", "target_duration_minutes"?: number }` → create schedule (limit 2 active).
- `PATCH /schedules/:id` with any of the schedule fields plus `is_active` to pause/resume.
- `DELETE /schedules/:id` → `{ "success": true }`.
- `GET /schedules/:id/runs` → recent run history (`status`, `message`, `episode_id`, `duration_seconds`).
- `POST /schedules/bootstrap` with optional `{ "timezone", "local_time_minutes" }` → returns existing schedules or creates a default daily schedule.

### Notifications
- `POST /notifications/device` with `{ "token": "...", "platform": "ios"|"android" }` → register/update a device token.
- `DELETE /notifications/device/:token` → unregisters the token for the user.

## Episode Generation Flow
1. Trigger & entitlement checks: `/episodes` (or schedule runner) enqueues a BullMQ `generate` job after validating plan limits and target duration (default 20 minutes from `EPISODE_DEFAULT_DURATION_MINUTES`).
2. Load episode & topics: status moves to `rewriting_queries`, then `retrieving_content`; active topics are fetched/sorted (test mode can limit to one segment), per-segment target minutes are derived, and default TTS voices are selected.
3. Per-topic work:
   - Fetch previous `topic_queries`, plan fresh queries + intent via the LLM, and fall back to the topic text if all queries were previously used.
   - Run Perplexity for each planned query; persist `topic_queries` with answers/citations.
   - Build `episode_sources` from citations and segment content from query answers.
   - Generate a dialogue script per segment (optionally chained to the previous segment), enhance for ElevenLabs voice tags when applicable, synthesize TTS (voices A/B), and capture start/duration with 2s gaps between segments.
4. Persist segments/sources: replace `episode_segments` and `episode_sources`, mark status `generating_script`, and combine dialogue into a full transcript.
5. Metadata & assets: move to `generating_audio`; LLM produces title/description/show notes and a cover prompt. In parallel, generate the cover image (S3-backed) and stitch segment audio with ffmpeg (download parts, insert silence, concat, upload final MP3, measure duration).
6. Finalize: mark `ready` with transcript, script prompt note, show notes, metadata, cover prompt/URL, audio key/URL, and duration; send APNs status notifications; record usage into `usage_periods` (idempotent via `usage_recorded_at`).
7. Failure handling: on any error, mark `failed` with a contextual message (stage/status/code), attempt a failure notification, and leave logs for debugging.
