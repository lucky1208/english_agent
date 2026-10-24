import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  try {
    const { conversationId } = await context.params;
    if (!z.string().uuid().safeParse(conversationId).success) {
      return NextResponse.json({ error: "会话 ID 无效。" }, { status: 400 });
    }
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    const { data: conversation } = await supabase.from("conversations").select("id").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
    if (!conversation) return NextResponse.json({ error: "会话不存在。" }, { status: 404 });
    const { data, error } = await supabase.from("messages").select("id,role,content,metadata,created_at").eq("conversation_id", conversationId).eq("user_id", user.id).order("created_at", { ascending: true }).limit(100);
    if (error) throw error;
    return NextResponse.json({ messages: data ?? [] });
  } catch { return NextResponse.json({ error: "读取消息失败。" }, { status: 500 }); }
}