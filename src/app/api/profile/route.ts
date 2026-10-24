import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const ProfileSchema = z.object({
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  goals: z.string().trim().max(1000),
  preferences: z.string().trim().max(1000),
});

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  let { data, error } = await supabase
    .from("profiles")
    .select("level,goals,preferences,display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "读取学习档案失败。" }, { status: 500 });
  if (!data) {
    const created = await supabase
      .from("profiles")
      .upsert({ user_id: user.id })
      .select("level,goals,preferences,display_name")
      .single();
    data = created.data;
    error = created.error;
  }
  if (error) return NextResponse.json({ error: "无法初始化学习档案，请执行数据库迁移。" }, { status: 500 });
  return NextResponse.json({ profile: data });
}

export async function PATCH(request: Request) {
  const input = ProfileSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: "档案内容不正确。" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const rate = await enforceRateLimit(user.id, "profile", 20);
  if (!rate.allowed) return NextResponse.json({ error: "保存太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, ...input.data })
    .select("level,goals,preferences,display_name")
    .single();
  if (error) return NextResponse.json({ error: "保存失败，请检查数据库结构。" }, { status: 500 });
  return NextResponse.json({ profile: data });
}