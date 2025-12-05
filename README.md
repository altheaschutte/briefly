## High-Level Architecture

**Clients**

- `mobile/ios` – Native iOS app (Swift/SwiftUI), including a CarPlay audio extension.
- `mobile/android` – Native Android app (Kotlin/Jetpack Compose).

**Backend**

- `backend` – NestJS (TypeScript) API + BullMQ worker.
- Auth & DB: Supabase (Auth + Postgres).
- Job queue: Redis + BullMQ.
- Storage: S3 (or S3-compatible) for episode audio.
- LLM providers: pluggable (e.g. OpenAI / Anthropic / Gemini).
- TTS providers: pluggable (e.g. ElevenLabs / NaturalReader / others).
- Deployment: Render (Web Service + Background Worker + Managed Redis).

---

## Repository Structure

```text
.
├─ backend/              # NestJS API + job worker
│  ├─ src/
│  │  ├─ main.ts         # API bootstrap
│  │  ├─ app.module.ts
│  │  └─ modules/
│  │     ├─ auth/        # Supabase JWT validation, user context
│  │     ├─ topics/      # CRUD for user topic briefs
│  │     ├─ episodes/    # Episode API, status, show notes
│  │     ├─ queue/       # BullMQ queue setup
│  │     ├─ llm/         # LLM provider abstraction + impls
│  │     ├─ tts/         # TTS provider abstraction + impls
│  │     └─ storage/     # S3 integration
│  ├─ worker/
│  │  └─ worker-main.ts  # Episode generation worker bootstrap
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ nest-cli.json
│
├─ mobile/
│  ├─ ios/               # Xcode project (Swift/SwiftUI + CarPlay)
│  └─ android/           # Android Studio project (Kotlin/Compose)
│
└─ README.md             # (this file)