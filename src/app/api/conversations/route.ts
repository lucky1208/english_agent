import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    const { data, error } = await supabase
      .from("conversations")
      .select("id,title,mode,created_at,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return NextResponse.json({ conversations: data ?? [] });
  } catch (error) {
    console.error("conversations GET", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "读取会话失败。" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  mode: z.enum(["text", "voice"]).default("text"),
});

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    const rate = await enforceRateLimit(user.id, "conversations", 20);
    if (!rate.allowed) return NextResponse.json({ error: "创建会话太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });
    const parsed = CreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "会话参数不正确。" }, { status: 400 });
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        title: parsed.data.title ?? (parsed.data.mode === "voice" ? "Voice practice" : "English practice"),
        mode: parsed.data.mode,
      })
      .select("id,title,mode,created_at,updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ conversation: data }, { status: 201 });
  } catch (error) {
    console.error("conversations POST", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "创建会话失败。请确认数据库迁移已执行。" }, { status: 500 });
  }
}