# Briefly web app

Next.js + Tailwind build of the Briefly iOS experience for the web. Focused on the signed-in app (not marketing): login, library, create (topics), settings, and Stripe-powered account/billing. Uses the backend API + Supabase auth (password grant) just like the iOS client.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start the dev server at `http://localhost:3000`
- `npm run build` — build the production bundle
- `npm run start` — serve the production build
- `npm run lint` — lint with Next.js config

## Structure

- `app/` — App Router pages for login (`/`), library (`/home`), create (`/create`), settings (`/settings`), subscription management (`/subscription`), and support.
- `components/` — navigation, episode queue, topics board, subscription grid, footer.
- `lib/` — API client, auth helpers, and shared types.
- `context/` — Auth context used across pages.
- `hooks/` — auth guard hook.
- `public/` — shared assets (logo + phone mocks).

## Notes

- Uses the same midnight palette and logo as the iOS app.
- Login screen is first; once signed in, users land in Library/Create/Settings, with Stripe account controls on the web.
- Pages hit the backend API for episodes/topics and Supabase auth for login. Stripe portal is called via `/billing/portal-session`.
- Env needed: `NEXT_PUBLIC_API_BASE_URL` (Nest API, e.g. `http://127.0.0.1:3344`), `NEXT_PUBLIC_SUPABASE_AUTH_URL` (e.g. `http://127.0.0.1:54321`), and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
