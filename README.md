# Briefly

## High-Level Architecture
- iOS app (`ios/Briefly/`) in Swift/SwiftUI with a CarPlay audio extension.
- Marketing website (`briefly-landing/`) built with Astro + Tailwind CSS.
- Backend NestJS API (`backend/`) with a BullMQ worker for episode generation.
- Supabase for Auth + Postgres (row-level security), Redis for queues, and S3-compatible storage for audio and covers.
- AI services are pluggable: LLMs (OpenAI/Anthropic/Gemini), TTS vendors (e.g. ElevenLabs), search/retrieval via Perplexity.
- Deployment targeting Render (web service + background worker + managed Redis).

## Tech Stack
- Backend: NestJS 10 (TypeScript/Express), BullMQ + Redis, Supabase client SDK, axios, jose for JWT verification, AWS SDK for S3, worker entry at `backend/worker/worker-main.ts`.
- Data: Supabase Postgres with RLS, migrations in `backend/supabase/migrations`, seed data in `backend/supabase/seed.sql`.
- Auth: Supabase JWTs enforced by a global guard (`Authorization: Bearer <token>`); JWKS or HS secret supported.
- AI: LLM abstraction with interchangeable providers; onboarding transcription uses OpenAI (`gpt-4o-transcribe` by default). TTS providers are swappable.
- Mobile: Swift/SwiftUI client + CarPlay extension; communicates with the NestJS API using Supabase auth tokens.
- Landing: Astro 5 + Tailwind CSS 4 (Vite) in `briefly-landing/`; scripts: `npm run dev`, `npm run build`, `npm run preview`.

## Repository Structure
```text
.
├─ backend/              # NestJS API + BullMQ worker + Supabase migrations
├─ briefly-landing/      # Marketing site (Astro + Tailwind)
├─ ios/Briefly/          # Xcode workspace (Swift/SwiftUI app + CarPlay extension)
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
- `topics`: `id uuid` PK, `user_id uuid`, `original_text text` (unique per user), `order_index int`, `is_active bool`, timestamps; RLS restricts to `auth.uid() = user_id`.
- `topic_queries`: `id uuid`, `user_id uuid`, `topic_id` → `topics`, `episode_id` → `episodes`, `query text`, `answer text`, `citations jsonb[]`, `order_index int`, optional `intent`, timestamps; RLS user-scoped.
- `episodes`: `id uuid` PK, `user_id uuid`, optional `episode_number`, `title`, `description`, `status enum (queued | rewriting_queries | retrieving_content | generating_script | generating_audio | ready | failed)`, `archived_at`, `target_duration_minutes int`, `duration_seconds numeric`, `audio_url`, `cover_image_url`, `cover_prompt`, `transcript`, `script_prompt`, `show_notes`, `error_message`, timestamps. Trigger assigns per-user `episode_number`; RLS user-scoped; `archived_at` filters list views.
- `episode_segments`: `id uuid` PK, `episode_id` → `episodes` (cascade), `order_index int`, `title`, `raw_content text`, `raw_sources jsonb`, `script`, `audio_url`, `start_time_seconds numeric`, `duration_seconds numeric`, `created_at`; RLS tied to owning episode.
- `episode_sources`: `id uuid` PK, `episode_id` → `episodes` (cascade), optional `segment_id` FK to `episode_segments`, `source_title text`, `url text`, `type text`, `created_at`; RLS tied to owning episode.
- `onboarding_transcripts`: `id uuid` PK, `user_id uuid`, `transcript text`, `status in_progress|completed|failed|cancelled`, `extracted_topics jsonb`, `error_message`, timestamps; RLS user-scoped.

## API (NestJS)
- Base URL: default `http://localhost:3000`.
- Auth: `Authorization: Bearer <supabase JWT>` is required on every route.
- Content: JSON bodies unless noted; responses use camelCase with some snake_case mirrors for mobile clients.

### Topics
- `GET /topics?status=active|inactive&is_active=true|false` → list topics for the user (active filter optional).
  - Response example:
    ```json
    [
      {
        "id": "topic-id",
        "userId": "user-id",
        "originalText": "Find art exhibitions on the Sunshine Coast",
        "orderIndex": 0,
        "isActive": true,
        "createdAt": "2025-03-28T12:34:56.000Z",
        "updatedAt": "2025-03-28T12:34:56.000Z"
      }
    ]
    ```
- `POST /topics` with body `{ "original_text": "..." }` → creates a topic (enforces max 5 active; older active topics auto-deactivate). Returns the topic object above.
- `PATCH /topics/:id` with optional `{ "original_text": "...", "is_active": true|false, "order_index": number }` → updates and returns the topic.
- `DELETE /topics/:id` → soft-deactivates (`is_active: false`) and returns the topic.

### Episodes
- `POST /episodes` with optional `{ "duration": <minutes> }` → queues a new episode job.
  - Response: `{ "episodeId": "uuid", "status": "queued" }`.
- `GET /episodes` → lists non-archived, non-failed episodes (newest first).
  - Each item includes camel + snake fields: `id`, `episode_number`, `status`, `title`, `description`, `target_duration_minutes`, `duration_seconds`, `audio_url` (signed if stored), `cover_image_url`, `cover_prompt`, `created_at`, `updated_at`; `segments`/`sources` are omitted in this list view.
- `GET /episodes/:id` → full episode with segments and sources.
  - Response shape:
    ```json
    {
      "id": "episode-id",
      "episode_number": 12,
      "status": "ready",
      "title": "Morning Briefing",
      "description": "3 stories in ~5 min",
      "target_duration_minutes": 5,
      "duration_seconds": 310,
      "audio_url": "https://signed-s3-url",
      "cover_image_url": "https://signed-s3-url/cover",
      "cover_prompt": "...",
      "transcript": "...",
      "script_prompt": "...",
      "show_notes": "...",
      "segments": [
        {
          "id": "segment-id",
          "episodeId": "episode-id",
          "order_index": 0,
          "title": "Top story",
          "raw_content": "...raw retrieval content...",
          "script": "...scripted narration...",
          "audio_url": "https://signed-s3-url/segment0",
          "start_time_seconds": 0,
          "duration_seconds": 120,
          "sources": [
            {
              "id": "source-id",
              "episode_id": "episode-id",
              "segment_id": "segment-id",
              "source_title": "NYTimes",
              "url": "https://..."
            }
          ],
          "raw_sources": [/* same objects as sources */]
        }
      ],
      "sources": [/* flattened sources for the episode */]
    }
    ```
- `GET /episodes/:id/sources` → array of source objects (`id`, `episode_id`, optional `segment_id`, `source_title`, `url`, `type`).
- `GET /episodes/:id/audio` → `{ "audioUrl": "https://signed-s3-url-or-null" }`.
- `DELETE /episodes/:id` → `{ "success": true }` (archives the episode).

### Onboarding (SSE + audio upload)
- `POST /onboarding/stream` (send raw audio bytes; content-type e.g. `audio/webm`). The server streams SSE responses:
  - `event: session` → `{ "session_id": "<uuid>" }`.
  - `event: transcript` → `{ "session_id": "...", "transcript": "partial text" }` (debounced while audio uploads).
  - `event: completed` → `{ "session_id": "...", "transcript": "...", "topics": ["..."], "created_topic_ids": ["..."] }`.
  - `event: error` → `{ "message": "transcription_failed|finalization_failed" }`.
  - Closing the client connection before completion cancels and cleans up the session.
