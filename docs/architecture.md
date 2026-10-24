# Architecture

## Runtime shape

- Next.js App Router on Vercel.
- Supabase Auth with cookie-based SSR sessions. The UI no longer shows a login form; first visit calls `signInAnonymously()` and reuses the anonymous session from cookies. All API routes still require a valid Supabase JWT and RLS still isolates users.
- Supabase PostgreSQL for all structured learning data. RLS is enabled on every user-owned table.
- Bailian OpenAI-compatible text API for text coaching and structured correction.
- Bailian Qwen-Audio-Realtime over WebRTC for live voice. The browser talks to Bailian directly for media; Vercel only proxies the SDP exchange.
- Bailian Memory API is an optional semantic layer. It is never the source of truth.

## Guest session flow

1. `AppShell` and the home page call `ensureGuestSession()`.
2. If `auth.getUser()` already returns a session, that user is reused.
3. Otherwise the browser calls `supabase.auth.signInAnonymously()`.
4. The anonymous user gets a normal Supabase JWT and a `profiles` row via the existing trigger.
5. `/login` redirects to `/`; there is no email/password UI.

Anonymous identity is cookie-bound: clearing cookies creates a new guest and cannot recover the old records. Public deployments should add IP-based limits, CAPTCHA, and an account-upgrade flow.

## Text request flow

1. Browser sends `{ conversationId?, message }` to `/api/chat`.
2. Route handler authenticates with `auth.getUser()` and applies a per-user rate limit.
3. Ownership of an existing conversation is checked; otherwise a new conversation is created.
4. History is read BEFORE inserting the current user message to avoid duplicate prompting.
5. `loadLearnerContext` loads profile, recent unmastered corrections, and due vocabulary.
6. `searchBailianMemory` optionally retrieves semantic memory.
7. The model returns strict JSON. `TutorResultSchema` validates it before persistence.
8. User message, assistant message, corrections, and vocabulary are saved.
9. Memory ingestion runs in `after()` and never blocks the response.

## Voice request flow

1. `/api/voice/context` builds per-user instructions from the same learner context and optional memory.
2. Browser creates `RTCPeerConnection`, adds a bidirectional audio transceiver, creates a DataChannel, and waits for ICE gathering.
3. Browser posts the Offer SDP to `/api/voice/sdp`. The route authenticates the user, rate limits, and forwards the Offer to Bailian with the server-only API key.
4. The browser sets the Answer SDP.
5. Client waits for `pc.connectionState === "connected"`, DataChannel `open`, and `session.created`.
6. Client sends `session.update` with voice, instructions, PCM formats, VAD, and transcription language.
7. After `session.updated`, the client calls `sender.replaceTrack(localTrack)`. No microphone audio is sent before model readiness.
8. Audio travels over RTP. JSON events travel over DataChannel. Both the browser-created `oai-events` channel and the server-created `txt` channel are handled.
9. Final transcripts are saved through `/api/voice/turn` with `client_turn_id` idempotency.
10. User transcripts are asynchronously analyzed for structured corrections. Raw audio is never persisted.

## Memory layers

1. Recent conversation turns (12 messages) for local coherence.
2. Structured records (profiles, corrections, vocabulary, review records, sessions) for reliable long-term state.
3. Optional Bailian semantic memory for cross-session facts.

Retrieved memory is explicitly marked as untrusted context in prompts. It is never treated as instructions.

## Review scheduling

`src/lib/review.ts` implements a compact SRS:

- quality < 3: reset to level 0, review in 10 minutes.
- quality 3: keep level, minimum level 1.
- quality 4: +1 level.
- quality 5: +2 levels.
- Intervals: 1, 3, 7, 14, 30 days (plus the 10-minute reset).
- `review_records` stores every grade for future analytics.

## Trust boundaries

- Never accept `user_id` from request payloads; derive it from verified Supabase Auth.
- RLS is a second layer, not a replacement for server-side ownership checks.
- Model output is untrusted until schema-validated.
- Memory provider deletion is only allowed after verifying the node belongs to the current user.
- Service-role credentials are server-only and used only for auth-account deletion.
- Provider endpoints come from environment variables, never from user input (no SSRF surface).