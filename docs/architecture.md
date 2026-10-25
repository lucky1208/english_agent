# Architecture

## Runtime shape

- Next.js App Router on Vercel.
- Supabase Auth with cookie-based SSR sessions. First visit signs into a fixed account, or falls back to an anonymous guest.
- Supabase PostgreSQL for structured learning data. RLS is enabled on every user-owned table.
- Bailian OpenAI-compatible text API for conversation, correction, and vocabulary.
- Browser `SpeechRecognition` for voice input and `speechSynthesis` for reading replies. No WebRTC, SDP, TURN, or realtime media server.

## Session flow

1. `AppShell` and the home page call `ensureSession()`.
2. The browser calls `/api/auth/fixed`.
3. If fixed credentials are configured, the server signs into that Supabase user, optionally requiring an access code.
4. If fixed credentials are absent, the browser falls back to `supabase.auth.signInAnonymously()`.
5. `/login` redirects to `/`.

## Text request flow

1. Browser sends `{ conversationId?, message }` to `/api/chat`.
2. The route authenticates with `auth.getUser()` and applies a per-user rate limit.
3. Ownership of an existing conversation is checked; otherwise a new one is created.
4. History is read before inserting the current user message to avoid duplicate prompting.
5. `loadLearnerContext` loads profile, recent unmastered corrections, and due vocabulary.
6. `searchBailianMemory` optionally retrieves semantic memory.
7. The model returns strict JSON; `TutorResultSchema` validates it before persistence.
8. User message, assistant message, corrections, and vocabulary are saved.
9. Memory ingestion runs in `after()` and never blocks the response.

## Browser voice flow

1. User clicks the mic button.
2. `SpeechRecognition` transcribes English speech in the browser.
3. A final transcript is sent to `/api/chat` and stored as a normal message.
4. The AI reply is read with `speechSynthesis` if auto-read is enabled.
5. The digital human animates listening, thinking, and speaking states.

This is turn-based voice, not full-duplex realtime. Browser recognition may be unavailable in some networks; text remains the fallback.

## Memory layers

1. Recent conversation turns (12 messages) for local coherence.
2. Structured records (profiles, corrections, vocabulary, review records, sessions) for reliable long-term state.
3. Optional Bailian semantic memory for cross-session facts.

Retrieved memory is explicitly marked as untrusted context in prompts.

## Review scheduling

`src/lib/review.ts` implements a compact SRS:

- quality < 3: reset to level 0, review in 10 minutes.
- quality 3: keep level, minimum level 1.
- quality 4: +1 level.
- quality 5: +2 levels.
- Intervals: 1, 3, 7, 14, 30 days.

`review_records` stores every grade for future analytics.

## Trust boundaries

- Never accept `user_id` from request payloads; derive it from verified Supabase Auth.
- RLS is a second layer, not a replacement for server-side ownership checks.
- Model output is untrusted until schema-validated.
- Service-role credentials are server-only and used only for auth-account deletion.
- Provider endpoints come from environment variables, never from user input.