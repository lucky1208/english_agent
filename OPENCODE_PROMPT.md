# OpenCode continuation prompt (historical)

> Status: the scaffold has been audited and extended. See `README.md` for the current implementation, setup, model configuration, and deployment steps.

Read `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/security.md`, and the current source before making changes. This repository is an implementation scaffold; do not assume external services have been configured or integration tests have passed.

Your task is to finish and audit this English AI tutor so it can be deployed to Vercel. Work in small phases and actually edit files, run commands, and verify results. Do not merely explain.

1. Install dependencies and fix all TypeScript, ESLint, test, and production build errors.
2. Compare all Bailian API routes, regional endpoint rules, memory payloads, Qwen Audio event names, and WebRTC state transitions against the latest official documentation. Do not guess.
3. Add tests for auth requirements, user isolation, malformed model JSON, rate limits, correction persistence, vocabulary persistence, and realtime cleanup.
4. Ensure a voice session's model prompt has per-user profile/memory context; save final user and assistant transcripts; avoid duplicate saving from both text and audio transcript events.
5. Add user controls to view/delete memory, export learning data, and delete an account including provider-side memory. Do not implement account deletion with a service-role key in the browser.
6. Add privacy policy and terms placeholder pages; disclose that audio is streamed to the selected provider, and do not store raw audio by default.
7. Audit SSRF, prompt injection, CSRF, abuse, API spend, logging of personal data, cookie behavior, and RLS.
8. Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`; report command output truthfully.
9. End with changed files, test evidence, deployment steps, and known limitations.

Never hard-code secrets, never expose server-only variables through `NEXT_PUBLIC_`, and never claim voice end-to-end verification without a real configured account and browser test.
