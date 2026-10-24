import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { data, error } = await supabase
    .from("corrections")
    .select("id,original_text,corrected_text,explanation_zh,error_types,severity,mastered,review_count,next_review_at,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "读取错题失败。" }, { status: 500 });
  return NextResponse.json({ corrections: data ?? [] });
}

const PatchSchema = z.object({ id: z.string().uuid(), mastered: z.boolean() });

export async function PATCH(request: Request) {
  const input = PatchSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: "参数不正确。" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const rate = await enforceRateLimit(user.id, "corrections", 30);
  if (!rate.allowed) return NextResponse.json({ error: "操作太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });
  const { error } = await supabase
    .from("corrections")
    .update({ mastered: input.data.mastered })
    .eq("id", input.data.id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "更新失败。" }, { status: 500 });
  return NextResponse.json({ ok: true });
}