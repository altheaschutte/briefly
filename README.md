# Briefly

## High-Level Architecture
- iOS app (`ios/BrieflyV2/`) in Swift/SwiftUI (MVP focus)
- Web app (`web/briefly/`) built with Next.js + Tailwind, will serve as landing page and web app
- Backend NestJS API (`backend/`) with BullMQ worker for audio/cover generation
- Orchestration service (`briefly-orchestration/`) running Mastra workflows for producer chat + research/script generation
- Supabase for Auth + Postgres (row-level security), Redis for queues, S3-compatible storage for audio and covers
- AI services: LLMs (OpenAI/Anthropic/Gemini), TTS (OpenAI), search/retrieval via Exa
- Deployment targeting Render (web service + background worker + managed Redis)

## Tech Stack
- Backend: NestJS 10 (TypeScript/Express), BullMQ + Redis, Stripe SDK, jose for JWT verification, AWS SDK for S3, worker entry at `backend/worker/worker-main.ts`
- Orchestration: Mastra framework in `briefly-orchestration/` for producer agent and research/script workflows
- Data: Supabase Postgres with RLS, migrations in `backend/supabase/migrations/`
- Auth: Supabase JWTs enforced by a global guard (`Authorization: Bearer <token>`)
- Mobile: Swift/SwiftUI client communicating with NestJS API using Supabase auth tokens
- Web app: Next.js + Tailwind in `web/briefly/`

## Core Flow
1. **Producer Chat** → User chats with producer agent (Mastra workflow via backend proxy) to define what they want to learn
2. **Plan Review** → When agent has enough info, workflow suspends for explicit user confirmation
3. **Confirm/Revise** → User reviews plan and either revises (continues chat) or confirms (saves plan, triggers generation, starts new thread)
4. **Research & Script** → Mastra workflow handles deep research and script generation
5. **Audio & Cover** → Backend worker generates TTS audio (OpenAI, single host voice) and cover image

## Repository Structure
```text
.
├─ backend/               # NestJS API + BullMQ worker + Supabase migrations
├─ briefly-orchestration/ # Mastra workflows (producer agent + research/script)
├─ ios/BrieflyV2/         # Xcode project (Swift/SwiftUI app)
├─ web/briefly/           # Next.js web app + landing page
├─ branding/              # Visual assets
└─ README.md
```

## Brand & UI
- **Aesthetic**: ChatGPT meets Spotify meets Notion
- Minimalist - avoid borders, cards, and visual clutter
- Primary buttons: off-black `#2E2E2E` with white text
- Secondary buttons: warm grey `#F3EFEA` with off-black text
- Gold accent `#A2845E` used sparingly
- No superfluous text, explainers, or "how to" copy - tone is direct and concise
- iOS: liquid glass, native animations and transitions

### Color Palette
- Background: `#FFFFFF` (white)
- Surface: `#F3EFEA` (warm grey)
- Dark surface: `#383838`, Deep background: `#282828`
- Primary accent: `#A2845E` (gold)
- Text primary: `#2E2E2E` (off-black), secondary: `#757575`, muted: `#8A8A8E`
- Border: `#E2DFDB` (medium warm grey)
- Tab bar: `#2E2E2E` (off-black)

## Database Schema (Supabase/Postgres)
- `episode_plans`: `id uuid` PK, `user_id uuid`, `resource_id text`, optional `thread_id text`, optional `assistant_message text`, optional `confidence double`, `episode_spec jsonb`, optional `user_profile jsonb`, timestamps; stored producer outcomes
- `episodes`: `id uuid` PK, `user_id uuid`, optional `episode_number`, `title`, `description`, `status enum (queued | retrieving_content | generating_audio | stitching_audio | generating_cover_image | ready | failed)`, `archived_at`, `target_duration_minutes int`, `duration_seconds numeric`, `audio_url`, `cover_image_url`, `cover_prompt`, `transcript`, `show_notes`, `error_message`, optional `plan_id uuid`, optional `workflow_run_id text`, `usage_recorded_at`, timestamps; RLS user-scoped
- `episode_segments`: `id uuid` PK, `episode_id` → `episodes` (cascade), `order_index int`, `segment_type text`, `title`, `raw_content text`, `raw_sources jsonb`, `script`, `audio_url`, `start_time_seconds numeric`, `duration_seconds numeric`, `created_at`; RLS tied to owning episode
- `episode_sources`: `id uuid` PK, `episode_id` → `episodes` (cascade), optional `segment_id` FK, `source_title text`, `url text`, `type text`, `created_at`; RLS tied to owning episode
- `profiles`: `id uuid` PK → `auth.users`, `first_name`, `intention`, `user_about_context`, `timezone`, timestamps; RLS user-scoped
- `user_subscriptions`: `user_id uuid` PK, `stripe_customer_id`, `stripe_subscription_id`, `tier enum (free|starter|pro|power)`, `status enum`, `current_period_start/end`, `cancel_at_period_end`, timestamps; RLS user-scoped
- `usage_periods`: `id uuid`, `user_id uuid`, `period_start/end timestamptz`, `minutes_used numeric`, `seconds_used numeric`, timestamps; RLS user-scoped
- `device_tokens`: `id uuid`, `user_id uuid`, `platform text`, `token text unique`, `last_seen_at`, timestamps; RLS user-scoped

## API (NestJS)
Base URL: `http://localhost:3000`. Auth: `Authorization: Bearer <supabase JWT>` on all routes except Stripe webhook.

### Root & Health
- `GET /` → `{ "name": "Briefly API", "status": "ok" }`
- `GET /health` → `{ "ok": true }`

### Producer (Plan Orchestration)
- `POST /producer/chat/stream` with `{ "userMessage": "...", "threadId"?, "messages"? }` → streams producer conversation, returns `episodeSpec` + confidence when ready
- `POST /producer/chat/confirm` with `{ "outcome": {...}, "threadId"?, "userProfile"? }` → persists plan, queues episode. Returns `{ "planId", "episodeId", "status": "queued" }`
- `POST /producer/chat/resume` with `{ "runId": "...", "confirmed": true|false, ... }` → resumes suspended workflow
- `GET /producer/chat/thread/:threadId` → fetch chat thread history

### Episodes
- `POST /episodes` with `{ "planId": "<uuid>" }` → queue episode from plan. Returns `{ "episodeId", "status": "queued" }`
- `GET /episodes` → list non-archived episodes (newest first)
- `GET /episodes/:id` → full episode with segments, sources
- `GET /episodes/:id/status` → workflow + worker status
- `GET /episodes/:id/sources` → array of source objects
- `GET /episodes/:id/audio` → `{ "audioUrl": "..." }`
- `DELETE /episodes/:id` → archives the episode

### Billing & Entitlements
- `GET /billing/tiers` → tier metadata with limits and Stripe prices
- `POST /billing/checkout-session` with `{ "tier": "..." }` → Stripe Checkout URL
- `POST /billing/portal-session` → Stripe Billing Portal URL
- `POST /billing/webhook` → Stripe webhook endpoint
- `GET /billing/entitlements` or `GET /me/entitlements` → current tier, limits, usage

### Profiles
- `GET /me/profile` → stored profile
- `PATCH /me/profile` with `{ "timezone": "..." }` → update timezone

### Notifications
- `POST /notifications/device` with `{ "token": "...", "platform": "ios"|"android" }` → register device
- `DELETE /notifications/device/:token` → unregister device

## Episode Generation Flow
1. **Plan creation**: Producer workflow (`/producer/chat/stream` + `resume`) arrives at confirmed `episodeSpec`. On confirm, `/producer/chat/confirm` persists plan and queues episode
2. **Queue & load**: BullMQ worker pulls job, loads episode + plan, sets status `retrieving_content`
3. **Research + script**: Worker calls Mastra `researchAndScriptWorkflow`, stores `workflow_run_id`, receives `{ script, research, summary }`
4. **Audio generation**: Build segments from script, set `generating_audio`, synthesize TTS (OpenAI) per segment, then `stitching_audio` and stitch into final MP3 (ffmpeg)
5. **Assets**: Upsert segments + sources, set `generating_cover_image`, generate cover image
6. **Finalize**: Mark `ready` with all metadata, send APNs notification, record usage. On error, mark `failed` and notify
