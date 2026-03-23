# Challenge Accepted

Cloudflare Workers app for running coding challenges with:
- OTP-based auth
- Admin challenge management
- User submissions + grading
- Rewards and points
- AI-assisted challenge generation
- Threaded comments with moderation
- Leaderboard, streaks, and plagiarism heuristics

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Session Store**: Cloudflare KV
- **File Storage**: Cloudflare R2
- **Frontend**: Static HTML/CSS/Vanilla JS served via Workers Assets

## Project Structure

- `src/` — Worker code (router, handlers, utilities, jobs)
- `public/` — Frontend pages and assets
- `migrations/` — Incremental SQL migrations (`001` to `022`)
- `db.sql` — Consolidated full schema (single-file canonical schema)
- `schema.sql` — Legacy initial schema bootstrap
- `wrangler.toml` — Worker bindings/config

## Prerequisites

- Node.js 18+
- npm
- Cloudflare account
- Wrangler CLI (`npm i` installs local wrangler)

## Install

```bash
npm install
```

## Local Development

```bash
npm run dev
```

Runs Worker + static assets locally via Wrangler.

## Database Setup

### Option A: Use consolidated schema (`db.sql`) (recommended for fresh setup)

```bash
npx wrangler d1 execute auth-db --file=./db.sql
```

Remote:

```bash
npx wrangler d1 execute auth-db --remote --file=./db.sql
```

### Option B: Use migration files (incremental)

```bash
npx wrangler d1 migrations apply auth-db
```

Remote:

```bash
npx wrangler d1 migrations apply auth-db --remote
```

> If your remote DB already has old migrations applied, apply only the new SQL file with:
>
> `npx wrangler d1 execute auth-db --remote --file=./migrations/<file>.sql`

## Deploy

```bash
npm run deploy
```

## Configuration

### `wrangler.toml`

Configured bindings:
- D1: `DB`
- KV: `SESSIONS`
- R2: `R2`
- Assets directory: `public/`
- Cron trigger: `*/30 * * * *`

Configured vars:
- `AI_AUTO_POST_ENABLED`
- `CLAUDE_MODEL`
- `AI_CHALLENGE_TOPIC`

### Required Secrets

Set with Wrangler:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
```

Notes:
- `ANTHROPIC_API_KEY` is required for Claude models.
- `OPENAI_API_KEY` is required when admin selects a GPT model.

## Core Features

### Authentication
- Email OTP login
- Session cookies backed by KV
- Role-based access (`admin`, `user`)

### Challenges
- Admin can create/edit/delete challenges
- Optional answer description and answer PDF
- Scheduled publish support (`publish_at`)
- Active/expired/scheduled visibility logic

### Submissions & Grading
- One submission per user per challenge
- Text + optional file attachment
- Admin grading with remarks and points
- Evaluation status shown to users

### Rewards & Points
- Reward tiers with unlock thresholds
- Claim/pass/fulfill flow
- Bonus points support

### AI Challenge Generation
- Manual admin trigger and cron-based auto trigger
- Claude/OpenAI model support
- Prompt controls: topic, difficulty, key points, notes
- Sequential AI hints with configurable point costs (Hint 1 free)
- Points Finance (FD/RD): invest points with admin-controlled interest rates

### Comments & Moderation
- Threaded comments (reply/edit/delete)
- Reactions (like/dislike)
- Pin/unpin top-level comments
- Mention highlight (`@username`)
- Profanity filter + anti-spam cooldown
- Report/hide/unhide workflow
- Admin reported-comments review panel

### Leaderboard & Similarity Analysis
- Leaderboard with streaks
- Submission similarity (text-based multi-signal heuristic)
  - unique word overlap
  - phrase overlap
  - character pattern similarity
  - longest contiguous run

## NPM Scripts

From `package.json`:

- `npm run dev` — local development
- `npm run deploy` — deploy Worker
- `npm run db:init` — apply `schema.sql` locally
- `npm run db:init:remote` — apply `schema.sql` remotely

## Notes

- `db.sql` is now the easiest single-file schema for new environments.
- Existing environments can continue using incremental migrations.
- For production safety, rotate API keys if they were ever shared in plain text.
