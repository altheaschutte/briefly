# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

### Backend (NestJS API + Worker)
```bash
cd backend
npm run build              # Build the NestJS application
npm run start:dev          # Run API in watch mode (port 3000)
npm run start:worker:dev   # Run BullMQ worker in watch mode
npm run start:prod         # Production API
npm run start:worker       # Production worker
```

### Database (Supabase)
```bash
cd backend
supabase migrations up     # Apply migrations locally
supabase db push           # Push migrations to production
npm run backfill:cover     # Backfill cover images for existing episodes
```

### Web App (Next.js)
```bash
cd web/briefly
npm run dev                # Development server (port 3001)
npm run build              # Production build
npm run lint               # ESLint
```

### Orchestration (Mastra AI workflows)
```bash
cd briefly-orchestration
npm run dev                # Mastra development server
npm run build              # Build workflows
```

### iOS App
Open `ios/BrieflyV2/BrieflyV2.xcodeproj` in Xcode. Build and run from there.

## Architecture Overview

Briefly is a personalized AI podcast generator. Users chat with a producer agent to create episode plans, which are then generated into audio episodes.

### Core Data Flow
1. **Producer Chat** → User chats with producer agent (Mastra workflow via backend proxy) to define what they want to learn
2. **Plan Review** → When agent has enough info, workflow suspends for explicit user confirmation
3. **Confirm/Revise** → User reviews plan and either revises (continues chat) or confirms (saves plan, triggers generation, starts new thread)
4. **Research & Script** → Mastra workflow handles deep research and script generation
5. **Audio & Cover** → Backend worker generates TTS audio (OpenAI, single host voice) and cover image

### Key Backend Modules (`backend/src/`)
- `producer/` - Proxies producer chat to Mastra, handles workflow suspend/resume
- `episode-plans/` - Episode plan storage and retrieval
- `episodes/` - Episode CRUD, audio/cover generation, segment/source management
- `billing/` - Stripe integration, entitlements, usage tracking
- `llm/` - Abstraction layer for OpenAI/Anthropic/Gemini with token tracking
- `tts/` - TTS generation (OpenAI)

### Orchestration (`briefly-orchestration/`)
Mastra-based AI workflows handling:
- **Producer agent** - Conversational episode planning with suspend/resume for user confirmation
- **Research & script generation** - Deep research and script writing for confirmed episode plans

Backend proxies chat requests to Mastra and handles workflow state (suspend/resume).

### Client Apps
- **iOS** (`ios/BrieflyV2/`) - SwiftUI app with `APIClient.swift` calling backend, `AudioPlayerManager` for playback (MVP focus)
- **Web** (`web/briefly/`) - Next.js 16 + Tailwind, will serve as landing page and web app

### Auth & Data
- Supabase Auth with JWTs validated by `backend/src/auth/` guard
- Postgres with RLS; migrations in `backend/supabase/migrations/`
- All API routes (except webhook) require `Authorization: Bearer <token>`

### External Services
- **Redis**: BullMQ job queue (local or Render managed)
- **S3-compatible storage**: Audio files and cover images
- **Stripe**: Subscriptions with tier-based entitlements (free/starter/pro/power)
- **APNs**: Push notifications for episode ready/failed

## Key Files

- `backend/src/episodes/episode-processor.service.ts` - Audio/cover generation pipeline
- `backend/src/producer/` - Producer agent chat handling
- `backend/src/episode-plans/` - Episode plan service and controller
- `backend/worker/worker-main.ts` - BullMQ worker entry point
- `briefly-orchestration/` - Mastra workflows for research and script generation

## Brand Colors
- Background: `#FFFFFF` (white)
- Surface: `#F3EFEA` (warm grey)
- Dark surface: `#383838`, Deep background: `#282828`
- Primary accent: `#A2845E` (gold) - use sparingly
- Text primary: `#2E2E2E` (off-black), secondary: `#757575`, muted: `#8A8A8E`
- Border: `#E2DFDB` (medium warm grey)
- Tab bar background: `#2E2E2E` (off-black)

## UI Guidelines

**Aesthetic**: ChatGPT meets Spotify meets Notion

**Principles**:
- Minimalist - avoid borders, cards, and visual clutter
- Primary buttons: off-black (`#2E2E2E`) with white text
- Secondary buttons: warm grey (`#F3EFEA`) with off-black text
- Gold accent used sparingly for highlights only
- No superfluous text, explainers, or "how to" copy
- Tone is direct and concise

**iOS specific**:
- Use liquid glass (`.glassBackgroundEffect()`) wherever possible
- Leverage native iOS animations and transitions
- Embrace system materials and vibrancy effects
