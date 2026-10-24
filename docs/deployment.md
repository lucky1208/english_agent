# Deploy to Vercel

## 1. Prerequisites

- GitHub repository containing `english-ai-tutor`.
- Supabase production project.
- Alibaba Cloud Bailian workspace and API key with text + realtime model access.
- Upstash Redis database (production rate limiting).
- Optional: Bailian memory library, Supabase service role key for full account deletion.

## 2. Database

Run `supabase/schema.sql` in Supabase SQL Editor. It is idempotent and upgrades older versions of this scaffold with:

- `messages.client_turn_id` + unique constraint for voice idempotency.
- `corrections.review_count`, `next_review_at`, `last_reviewed_at`.
- `vocabulary.review_count`, `last_reviewed_at`.
- Review indexes.

Verify RLS with two different users before public traffic.

## 3. Environment variables

Set these for Preview and Production:

```
DASHSCOPE_API_KEY
DASHSCOPE_BASE_URL
DASHSCOPE_TEXT_MODEL
DASHSCOPE_REALTIME_URL
DASHSCOPE_REALTIME_MODEL
DASHSCOPE_REALTIME_VOICE
BAILIAN_MEMORY_BASE_URL (optional)
BAILIAN_MEMORY_API_KEY (optional)
BAILIAN_MEMORY_PROJECT_ID (optional)
BAILIAN_MEMORY_LIBRARY_ID (optional)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY (server-only, optional)
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
NEXT_PUBLIC_APP_URL
```

Never expose server secrets with `NEXT_PUBLIC_`.

## 4. Supabase Auth

### Fixed personal account (recommended for single-user)

1. Authentication → Users → Add user: email + password, auto-confirm.
2. Set server-only env vars:
   ```
   FIXED_ACCOUNT_EMAIL=you@example.com
   FIXED_ACCOUNT_PASSWORD=...
   FIXED_ACCOUNT_ACCESS_CODE=a-long-random-string
   ```
3. `FIXED_ACCOUNT_ACCESS_CODE` is required in production. The browser asks for it once per session and stores it in `sessionStorage`.
4. The settings page can reset learning data but keeps the fixed auth account.

### Anonymous fallback (when no fixed account is configured)

1. Authentication → Providers → **Anonymous Sign-Ins** → enable.
2. Anonymous users are cookie-bound. Clearing cookies creates a new guest and loses access to previous records.

### URLs

Authentication → URL Configuration:

- Site URL: `https://your-domain.com`
- Redirect URLs: `https://your-domain.com/**`, `https://*.vercel.app/**` for previews.

For a public product, add IP-based limits, CAPTCHA, and account linking/upgrade. SMTP is only needed if you later add email accounts.

## 5. Deploy

GitHub + Vercel:

1. Import the repository.
2. Framework preset: Next.js.
3. Node.js: 20 or 22.
4. Add environment variables for Preview and Production.
5. Deploy.
6. Add the Vercel domain to Supabase redirect allowlist.
7. Test with a real browser and microphone.

CLI:

```bash
npm i -g vercel
vercel login
vercel link
vercel env add DASHSCOPE_API_KEY
# repeat for every variable
vercel --prod
```

## 6. Smoke test

- `GET /api/health` shows the expected provider configuration flags.
- First visit automatically logs into the fixed account, or creates an anonymous guest if fixed env vars are absent.
- Access code is requested once per browser session when configured.
- Clearing cookies for anonymous fallback creates a new guest; old data is not accessible.
- Text chat and JSON correction.
- Refresh history; switch conversations; create a new conversation.
- Review page shows due items; grading updates counts.
- Vocabulary add/delete; mistakes mark mastered.
- Settings export downloads JSON.
- Delete one memory; delete account data.
- Missing key returns a safe actionable error.
- Upstash limit works across multiple serverless instances.
- WebRTC: SDP answer, `session.created`, `session.updated`, audio upload/download, subtitles, transcript persistence, cleanup.
- Cross-user RLS denial.
- Privacy and terms pages load without authentication.

## 7. China / cross-border networking

Vercel functions do not run in mainland China by default. Calling a Beijing Bailian endpoint from a US/EU function can add latency or fail. For mainland users:

- Prefer a Vercel function region close to China (for example Hong Kong or Singapore) if your plan allows it.
- Or keep the UI on Vercel and move text/SDP API routes to an Alibaba Cloud or Hong Kong server.
- Realtime media is browser-to-Bailian WebRTC, so audio does not depend on the Vercel function region.

## 8. Vercel function settings

- `/api/chat` and `/api/voice/turn` use `maxDuration = 60`.
- `/api/voice/sdp` uses `maxDuration = 30`.
- Audio itself never passes through a Vercel function.
- If your plan limits durations, lower `maxDuration` in route files or upgrade the plan.

## 9. Production checklist

- Custom domain + HTTPS (microphone requires a secure context).
- Provider spend alerts and per-user quotas.
- Error monitoring and structured logs without personal content.
- Database backups and restore drill.
- Data retention and account deletion runbook.
- Legal review for privacy, terms, age policy, and jurisdiction.
- Replace contact placeholders in `/privacy` and `/terms`.