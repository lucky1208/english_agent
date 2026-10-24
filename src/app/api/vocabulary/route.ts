import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const VocabularySchema = z.object({
  word: z.string().trim().min(1).max(100),
  meaning: z.string().trim().max(400).default(""),
  example: z.string().trim().max(500).default(""),
});

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { data, error } = await supabase
    .from("vocabulary")
    .select("id,word,meaning,example,mastery_level,next_review_at,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: "读取词汇失败。" }, { status: 500 });
  return NextResponse.json({ vocabulary: data ?? [] });
}

export async function POST(request: Request) {
  const input = VocabularySchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: "词汇格式不正确。" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const rate = await enforceRateLimit(user.id, "vocabulary", 40);
  if (!rate.allowed) return NextResponse.json({ error: "操作太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });
  const { data, error } = await supabase
    .from("vocabulary")
    .upsert({ user_id: user.id, ...input.data }, { onConflict: "user_id,word" })
    .select("id,word,meaning,example,mastery_level,next_review_at,created_at")
    .single();
  if (error) return NextResponse.json({ error: "保存词汇失败。" }, { status: 500 });
  return NextResponse.json({ vocabulary: data });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "缺少或无效的词汇 ID。" }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const rate = await enforceRateLimit(user.id, "vocabulary", 40);
  if (!rate.allowed) return NextResponse.json({ error: "操作太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });
  const { error } = await supabase.from("vocabulary").delete().eq("user_id", user.id).eq("id", id);
  if (error) return NextResponse.json({ error: "删除失败。" }, { status: 500 });
  return NextResponse.json({ ok: true });
}