# Project instructions for OpenCode

- Read `README.md` and `docs/architecture.md` before changing architecture.
- Use TypeScript strict mode; validate all API input with Zod.
- Never expose `DASHSCOPE_API_KEY`, memory API keys, or service credentials to client code.
- All user-owned database operations must be authenticated and scoped to the current Supabase user. Never trust a user ID sent by the browser.
- Supabase RLS is mandatory. The SQL in `supabase/schema.sql` is the source of truth for schema/policies.
- Bailian text API, Realtime WebRTC API, and memory API have separate adapters. Do not guess model names, endpoints, event names, or payload schemas; verify against current official docs.
- Do not persist raw audio by default. Persist transcriptions only after users are informed.
- Do not claim tests passed unless they have actually run. Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` after significant changes.
- For production, configure Upstash rate limiting; the application fails closed on AI endpoints if rate limiting is missing in production.
- Keep changes small, tested, and reversible. Update docs when behavior or environment variables change.