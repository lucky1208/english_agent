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
- [ ] Supabase RLS is enabled for all user-owned tables.
- [ ] Two-account isolation test passes.
- [ ] Supabase Auth redirect URLs contain only intended domains.
- [ ] Anonymous Sign-Ins are enabled only if using the fallback.
- [ ] Fixed-account mode sets a strong access code; public deployments add IP limits/CAPTCHA.

## Input and model safety

- [ ] All API inputs are validated with Zod.
- [ ] Chat input is bounded and content length is checked.
- [ ] Model output is schema-validated before persistence.
- [ ] Memory/profile text is marked as untrusted context in prompts.
- [ ] No user-controlled URLs are fetched by the server.
- [ ] Rate limits are active for public production; fixed personal mode uses a per-instance fallback.

## Data protection

- [ ] Raw audio is not stored.
- [ ] Browser speech recognition is disclosed in the privacy policy.
- [ ] Logs do not include full conversations or personal data.
- [ ] Data export and account deletion are available from settings.
- [ ] Individual memory deletion is available from settings.
- [ ] Backups and retention follow the stated policy.

## Browser and deployment

- [ ] HTTPS/custom domain configured; microphone works only in secure contexts.
- [ ] Security headers configured (nosniff, frame deny, referrer policy, permissions policy, HSTS).
- [ ] Browser speech recognition may depend on an external browser service; text is the fallback.
- [ ] Dependency audit and lockfile review before release.
- [ ] Privacy, terms, age policy, and contact details reviewed by counsel.