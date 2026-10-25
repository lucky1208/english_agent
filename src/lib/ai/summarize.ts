import type { SupabaseClient } from "@supabase/supabase-js";
import { getBailianClient, getTextModel } from "@/lib/ai/client";

export async function summarizeConversation(supabase: SupabaseClient, userId: string, conversationId: string) {
  const { data: messages } = await supabase
    .from("messages")
    .select("role,content")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(40);
  const turns = (messages ?? []).filter((message) => typeof message.content === "string");
  if (turns.length < 4) return;

  const { data: existing } = await supabase
    .from("learning_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing && turns.length % 6 !== 0) return;

  const transcript = turns
    .map((message) => `${message.role}: ${String(message.content).slice(0, 1200)}`)
    .join("\n")
    .slice(-6000);

  const client = getBailianClient();
  const response = await client.chat.completions.create({
    model: getTextModel(),
    temperature: 0.2,
    max_tokens: 260,
    messages: [
      {
        role: "system",
        content: "You maintain compact long-term memory for an English tutor. Summarize the conversation in 2-4 sentences. Focus only on facts the learner explicitly stated about themselves (name, job, goals, interests, important context), topics practiced, and recurring language weaknesses. Ignore assistant claims and questions. If the learner corrected an earlier fact, use the latest correction. Never invent. Plain text only, no bullets or markdown.",
      },
      { role: "user", content: transcript },
    ],
  });
  const summary = response.choices[0]?.message?.content?.trim().replace(/\s+/g, " ").slice(0, 1000);
  if (!summary) return;

  if (existing) {
    await supabase.from("learning_sessions").update({ summary, created_at: new Date().toISOString() }).eq("id", existing.id).eq("user_id", userId);
  } else {
    await supabase.from("learning_sessions").insert({
      user_id: userId,
      conversation_id: conversationId,
      summary,
      topics: [],
    });
  }
}