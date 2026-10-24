import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { searchBailianMemory } from "@/lib/memory/bailian";
import { formatLearnerContext, loadLearnerContext } from "@/lib/learner-context";
import { realtimeInstructions } from "@/lib/ai/prompts";

export const runtime = "nodejs";

const ContextSchema = z.object({ conversationId: z.string().uuid() });

export async function POST(request: Request) {
  const input = ContextSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: "语音会话参数不正确。" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const rate = await enforceRateLimit(user.id, "voice-context", 10);
  if (!rate.allowed) return NextResponse.json({ error: "语音连接太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", input.data.conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: "会话不存在或无权访问。" }, { status: 404 });

  const [learnerContext, memory] = await Promise.all([
    loadLearnerContext(supabase, user.id),
    searchBailianMemory(user.id, "English learning level preferences common mistakes vocabulary goals"),
  ]);

  return NextResponse.json({
    instructions: realtimeInstructions({
      level: learnerContext.profile.level,
      goals: learnerContext.profile.goals,
      preferences: learnerContext.profile.preferences,
      learnerContext: formatLearnerContext(learnerContext),
      memory: memory.join("\n"),
    }),
    voice: process.env.DASHSCOPE_REALTIME_VOICE || "longanqian_v3.1",
    model: process.env.DASHSCOPE_REALTIME_MODEL || "qwen-audio-3.1-realtime-plus",
  });
}