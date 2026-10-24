import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getBailianClient, getTextModel } from "@/lib/ai/client";
import { parseTutorResult } from "@/lib/ai/schema";
import { buildTutorMessages } from "@/lib/ai/chat-messages";
import { formatLearnerContext, loadLearnerContext } from "@/lib/learner-context";
import { searchBailianMemory, addBailianMemory } from "@/lib/memory/bailian";

export const runtime = "nodejs";
export const maxDuration = 60;

const ChatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 16_000) return NextResponse.json({ error: "请求内容过大。" }, { status: 413 });
    const input = ChatSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "消息不能为空，且不能超过 4000 个字符。" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "登录后才能聊天。" }, { status: 401 });
    const rate = await enforceRateLimit(user.id, "chat", 20);
    if (!rate.allowed) return NextResponse.json({ error: "请求太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });

    let conversationId = input.data.conversationId;
    let conversationTitle = input.data.message.slice(0, 50);
    let conversationMode = "text";
    if (conversationId) {
      const { data: owned } = await supabase.from("conversations").select("id,title,mode").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
      if (!owned) return NextResponse.json({ error: "会话不存在或无权访问。" }, { status: 404 });
      conversationTitle = owned.title;
      conversationMode = owned.mode;
    } else {
      const { data: created, error } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, title: input.data.message.slice(0, 50), mode: "text" })
        .select("id,title,mode")
        .single();
      if (error || !created) throw error ?? new Error("创建会话失败");
      conversationId = created.id;
      conversationTitle = created.title;
      conversationMode = created.mode;
    }

    const [{ data: history }, learnerContext, memories] = await Promise.all([
      supabase
        .from("messages")
        .select("role,content")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12),
      loadLearnerContext(supabase, user.id),
      searchBailianMemory(user.id, input.data.message),
    ]);

    const { data: userMessage, error: userInsertError } = await supabase
      .from("messages")
      .insert({ user_id: user.id, conversation_id: conversationId, role: "user", content: input.data.message, metadata: { source: "text" } })
      .select("id,role,content,metadata,created_at")
      .single();
    if (userInsertError || !userMessage) throw userInsertError ?? new Error("保存消息失败");

    const client = getBailianClient();
    const response = await client.chat.completions.create({
      model: getTextModel(),
      temperature: 0.5,
      max_tokens: 1200,
      messages: buildTutorMessages({
        learnerContext: formatLearnerContext(learnerContext, memories),
        history: (history ?? []).slice().reverse(),
        message: input.data.message,
      }),
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("模型没有返回可用内容");
    const result = parseTutorResult(content);

    const { data: assistantMessage, error: assistantInsertError } = await supabase
      .from("messages")
      .insert({
        user_id: user.id,
        conversation_id: conversationId,
        role: "assistant",
        content: result.reply,
        metadata: { correction: result.correction, vocabulary: result.vocabulary },
      })
      .select("id,role,content,metadata,created_at")
      .single();
    if (assistantInsertError || !assistantMessage) throw assistantInsertError ?? new Error("保存 AI 回答失败");

    if (result.correction?.shouldSave && result.correction.severity !== "none") {
      const { data: duplicate } = await supabase
        .from("corrections")
        .select("id")
        .eq("user_id", user.id)
        .eq("conversation_id", conversationId)
        .eq("original_text", result.correction.originalText)
        .limit(1)
        .maybeSingle();
      if (!duplicate) {
        await supabase.from("corrections").insert({
          user_id: user.id,
          conversation_id: conversationId,
          message_id: userMessage.id,
          original_text: result.correction.originalText,
          corrected_text: result.correction.correctedText,
          explanation_zh: result.correction.explanationZh,
          error_types: result.correction.errorTypes,
          severity: result.correction.severity,
        });
      }
    }

    if (result.vocabulary.length) {
      const rows = result.vocabulary
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

    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", user.id);
    after(async () => {
      await addBailianMemory(user.id, [
        { role: "user", content: input.data.message },
        { role: "assistant", content: result.reply },
      ]);
    });

    return NextResponse.json({
      conversation: { id: conversationId, title: conversationTitle, mode: conversationMode },
      userMessage,
      assistantMessage,
      result,
    });
  } catch (error) {
    console.error("chat POST failed", error instanceof Error ? error.message : "unknown");
    const message = error instanceof Error ? error.message : "服务暂时不可用。";
    const missingConfig = /配置|DASHSCOPE|Supabase/.test(message);
    return NextResponse.json(
      { error: missingConfig ? message : "AI 暂时无法回答，请检查模型权限、地域配置和服务日志后重试。" },
      { status: missingConfig ? 503 : 502 },
    );
  }
}