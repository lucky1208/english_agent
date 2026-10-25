# Deploy to Vercel

## 1. Prerequisites

- GitHub repository.
- Supabase production project.
- Alibaba Cloud Bailian text model key.
- Upstash Redis for public production rate limiting (optional for fixed personal mode).

## 2. Database

Run `supabase/schema.sql` in Supabase SQL Editor. It is idempotent and upgrades older versions with review fields and voice-era columns that are now unused.

Verify RLS with two different users before public traffic.

## 3. Environment variables

Set these for Preview and Production:

```
DASHSCOPE_API_KEY
DASHSCOPE_BASE_URL
DASHSCOPE_TEXT_MODEL
BAILIAN_MEMORY_BASE_URL (optional)
BAILIAN_MEMORY_API_KEY (optional)
BAILIAN_MEMORY_PROJECT_ID (optional)
BAILIAN_MEMORY_LIBRARY_ID (optional)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY (server-only, optional)
FIXED_ACCOUNT_EMAIL (optional)
FIXED_ACCOUNT_PASSWORD (optional)
FIXED_ACCOUNT_ACCESS_CODE (required in production with a fixed account)
UPSTASH_REDIS_REST_URL (recommended for public)
UPSTASH_REDIS_REST_TOKEN
NEXT_PUBLIC_APP_URL
```

No WebRTC/realtime/TURN variables are used in the current version.

## 4. Supabase Auth

### Fixed personal account

1. Authentication → Users → Add user: email + password, auto-confirm.
2. Set fixed-account env vars.
3. The browser asks for the access code once per session.

### Anonymous fallback

Authentication → Providers → Anonymous Sign-Ins → enable.

### URLs

- Site URL: `https://your-domain.com`
- Redirect URLs: `https://your-domain.com/**`, `https://*.vercel.app/**`.

## 5. Deploy

1. Import the repository in Vercel.
2. Framework preset: Next.js. Node.js 20 or 22.
3. Add environment variables for Preview and Production.
4. Deploy.
5. Add the Vercel domain to Supabase redirect allowlist.

## 6. Smoke test

- `GET /api/health` shows Supabase and Bailian text configured.
- Fixed account auto-login, or anonymous guest session.
- Text chat and JSON correction.
- Refresh history; switch conversations.
- Review page shows due items; grading updates counts.
- Vocabulary add/delete; mistakes mark mastered.
- Browser voice input (Chrome/Edge) and AI read-aloud.
- If browser recognition fails with `network`, use Edge or text; this is a browser-service limitation, not WebRTC.
- Settings export downloads JSON; memory deletion works.
- Sign out / delete data flows.
- Privacy and terms pages load.

## 7. Vercel function settings

- `/api/chat` uses `maxDuration = 60`.
- No long-lived audio connections pass through Vercel.
- `vercel.json` pins functions to `hkg1`; adjust if your users are elsewhere.

## 8. Production checklist

- Custom domain + HTTPS (microphone permission requires a secure context).
- Provider spend alerts and per-user quotas.
- Error monitoring and structured logs without personal content.
- Database backups and restore drill.
- Legal review for privacy, terms, age policy, and jurisdiction.
- Replace contact placeholders in `/privacy` and `/terms`.