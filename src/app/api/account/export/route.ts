import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isBailianMemoryConfigured, listBailianMemory } from "@/lib/memory/bailian";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const rate = await enforceRateLimit(user.id, "account-export", 5);
  if (!rate.allowed) return NextResponse.json({ error: "导出太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });

  try {
    const [profile, conversations, messages, corrections, vocabulary, reviews, sessions, memoryRefs] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("conversations").select("*").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1000),
      supabase.from("messages").select("*").eq("user_id", user.id).order("created_at", { ascending: true }).limit(5000),
      supabase.from("corrections").select("*").eq("user_id", user.id).order("created_at", { ascending: true }).limit(2000),
      supabase.from("vocabulary").select("*").eq("user_id", user.id).order("created_at", { ascending: true }).limit(2000),
      supabase.from("review_records").select("*").eq("user_id", user.id).order("reviewed_at", { ascending: true }).limit(5000),
      supabase.from("learning_sessions").select("*").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1000),
      supabase.from("user_memory_refs").select("*").eq("user_id", user.id).limit(2000),
    ]);

    let memories: Awaited<ReturnType<typeof listBailianMemory>>["memories"] = [];
    if (isBailianMemoryConfigured()) {
      try {
        for (let page = 1; page <= 10; page += 1) {
          const result = await listBailianMemory(user.id, page, 100);
          memories.push(...result.memories);
          if (memories.length >= result.total || result.memories.length < 100) break;
        }
      } catch {
        memories = [];
      }
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, createdAt: user.created_at },
      profile: profile.data,
      conversations: conversations.data ?? [],
      messages: messages.data ?? [],
      corrections: corrections.data ?? [],
      vocabulary: vocabulary.data ?? [],
      reviewRecords: reviews.data ?? [],
      learningSessions: sessions.data ?? [],
      memoryRefs: memoryRefs.data ?? [],
      bailianMemories: memories,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="english-mate-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("account export failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "导出学习数据失败。" }, { status: 500 });
  }
}