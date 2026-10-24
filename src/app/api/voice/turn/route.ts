import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { addBailianMemory } from "@/lib/memory/bailian";
import { analyzeSpokenEnglish } from "@/lib/ai/analyze-correction";

export const runtime = "nodejs";
export const maxDuration = 60;

const VoiceTurnSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(3000),
  clientTurnId: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const input = VoiceTurnSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "语音转写内容不正确。" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    const rate = await enforceRateLimit(user.id, "voice-turn", 60);
    if (!rate.allowed) return NextResponse.json({ error: "语音转写保存太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", input.data.conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conversation) return NextResponse.json({ error: "会话不存在或无权访问。" }, { status: 404 });

    if (input.data.clientTurnId) {
      const { data: existing } = await supabase
        .from("messages")
        .select("id,role,content,metadata,created_at")
        .eq("user_id", user.id)
        .eq("client_turn_id", input.data.clientTurnId)
        .maybeSingle();
      if (existing) return NextResponse.json({ message: existing, duplicate: true }, { status: 200 });
    }

    const { data: saved, error } = await supabase
      .from("messages")
      .insert({
        user_id: user.id,
        conversation_id: conversation.id,
        role: input.data.role,
        content: input.data.content,
        client_turn_id: input.data.clientTurnId ?? null,
        metadata: { source: "realtime_voice" },
      })
      .select("id,role,content,metadata,created_at")
      .single();
    if (error || !saved) throw error ?? new Error("保存语音转写失败");

    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id).eq("user_id", user.id);

    if (input.data.role === "user") {
      after(async () => {
        try {
          const analysis = await analyzeSpokenEnglish(input.data.content);
          const correction = analysis?.correction;
          if (correction?.shouldSave && correction.severity !== "none") {
            const { data: duplicate } = await supabase
              .from("corrections")
              .select("id")
              .eq("user_id", user.id)
              .eq("conversation_id", conversation.id)
              .eq("original_text", correction.originalText)
              .limit(1)
              .maybeSingle();
            if (!duplicate) {
              await supabase.from("corrections").insert({
                user_id: user.id,
                conversation_id: conversation.id,
                message_id: saved.id,
                original_text: correction.originalText,
                corrected_text: correction.correctedText,
                explanation_zh: correction.explanationZh,
                error_types: correction.errorTypes,
                severity: correction.severity,
              });
            }
          }
          if (analysis?.vocabulary.length) {
            const rows = analysis.vocabulary
              .map((word) => ({
                user_id: user.id,
                word: word.word.trim(),
                meaning: word.meaning.trim(),
                example: word.example.trim(),
              }))
              .filter((word) => word.word.length > 0);
            const uniqueRows = [...new Map(rows.map((word) => [word.word.toLowerCase(), word])).values()];
            if (uniqueRows.length) await supabase.from("vocabulary").upsert(uniqueRows, { onConflict: "user_id,word" });
          }
        } catch (error) {
          console.error("voice correction analysis failed", error instanceof Error ? error.message : "unknown");
        }
      });
    } else {
      const { data: previousUserMessage } = await supabase
        .from("messages")
        .select("content")
        .eq("user_id", user.id)
        .eq("conversation_id", conversation.id)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      after(async () => {
        if (previousUserMessage?.content) {
          await addBailianMemory(user.id, [
            { role: "user", content: previousUserMessage.content },
            { role: "assistant", content: input.data.content },
          ]);
        }
      });
    }

    return NextResponse.json({ message: saved }, { status: 201 });
  } catch (error) {
    console.error("voice turn POST failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "保存语音转写失败。" }, { status: 500 });
  }
}