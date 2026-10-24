# Security checklist

## Secrets

- [ ] `DASHSCOPE_API_KEY`, `BAILIAN_MEMORY_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` exist only in server environment variables.
- [ ] No secret starts with `NEXT_PUBLIC_`.
- [ ] `.env.local` is gitignored.
- [ ] Rotate any key that was pasted into chat, logs, screenshots, or source code.

## Authentication and authorization

- [ ] Every user-owned API calls `auth.getUser()`.
- [ ] User IDs are derived from the verified session, never from request payloads.
- [ ] Object IDs from the browser are checked against ownership.
- [ ] Supabase RLS is enabled for profiles, conversations, messages, corrections, vocabulary, review_records, learning_sessions, and user_memory_refs.
- [ ] Two-account isolation test passes.
- [ ] Supabase Auth redirect URLs contain only intended domains.
- [ ] Fixed-account mode sets `FIXED_ACCOUNT_EMAIL`, `FIXED_ACCOUNT_PASSWORD`, and a strong `FIXED_ACCOUNT_ACCESS_CODE`; all are server-only.
- [ ] Anonymous Sign-Ins are enabled only if using the fallback; session expiry is configured for production.
- [ ] Public deployments add IP-based rate limiting/CAPTCHA because a guest can clear cookies and create a new anonymous identity to bypass per-user limits.
- [ ] Add account linking/upgrade if users need to keep data across devices.

## Input and model safety

- [ ] All API inputs are validated with Zod.
- [ ] Chat input is bounded (4000 chars) and content length is checked.
- [ ] Model output is schema-validated before persistence.
- [ ] Memory/profile text is marked as untrusted context in prompts.
- [ ] No user-controlled URLs are fetched by the server.
- [ ] Provider endpoints are fixed environment variables (no SSRF).
- [ ] Rate limits are active in production; AI routes fail closed without Upstash.

## Data protection

- [ ] Raw audio is not stored.
- [ ] Transcript storage is disclosed in the privacy policy.
- [ ] Logs do not include full conversations or personal data.
- [ ] Data export is available from settings.
- [ ] Individual memory deletion is available from settings.
- [ ] Account deletion removes structured data and provider memory; auth deletion requires a server-only service role key.
- [ ] Backups and retention follow the stated policy.

## Abuse and cost

- [ ] Per-user rate limits cover chat, voice SDP, voice transcript save, review, profile, vocabulary, conversations, and memory deletion.
- [ ] Bailian and Supabase budget alerts are configured.
- [ ] Public launch adds plan-based quotas and voice-minute limits.
- [ ] Error responses do not leak provider headers, keys, or stack traces.

## Browser and deployment

- [ ] HTTPS/custom domain configured; microphone works only in secure contexts.
- [ ] Security headers configured (nosniff, frame deny, referrer policy, permissions policy, HSTS).
- [ ] CORS is not opened unnecessarily; Supabase cookies are SameSite-protected.
- [ ] Dependency audit and lockfile review before release.
- [ ] Privacy, terms, age policy, and contact details reviewed by counsel.