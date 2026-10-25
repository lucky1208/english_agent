import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  try {
    const { conversationId } = await context.params;
    if (!z.string().uuid().safeParse(conversationId).success) {
      return NextResponse.json({ error: "对话 ID 无效。" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    const rate = await enforceRateLimit(user.id, "conversation-delete", 20);
    if (!rate.allowed) return NextResponse.json({ error: "操作太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conversation) return NextResponse.json({ error: "对话不存在或无权访问。" }, { status: 404 });

    const { data: corrections } = await supabase
      .from("corrections")
      .select("id")
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId);
    const correctionIds = (corrections ?? []).map((item) => item.id);

    if (correctionIds.length) {
      await supabase
        .from("review_records")
        .delete()
        .eq("user_id", user.id)
        .eq("item_type", "correction")
        .in("item_id", correctionIds);
    }
    await supabase.from("learning_sessions").delete().eq("user_id", user.id).eq("conversation_id", conversationId);
    await supabase.from("corrections").delete().eq("user_id", user.id).eq("conversation_id", conversationId);

    const { error } = await supabase.from("conversations").delete().eq("id", conversationId).eq("user_id", user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("conversation DELETE failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "删除对话失败，请稍后重试。" }, { status: 500 });
  }
}