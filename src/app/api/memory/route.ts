import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { deleteBailianMemory, isBailianMemoryConfigured, listBailianMemory } from "@/lib/memory/bailian";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const rate = await enforceRateLimit(user.id, "memory-read", 20);
  if (!rate.allowed) return NextResponse.json({ error: "操作太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });

  if (!isBailianMemoryConfigured()) {
    return NextResponse.json({ configured: false, memories: [], total: 0 });
  }

  try {
    const { memories, total } = await listBailianMemory(user.id, 1, 50);
    return NextResponse.json({
      configured: true,
      memories: memories.map((node) => ({
        id: node.memory_node_id,
        content: node.content,
        memoryType: node.memory_type ?? "observation",
        createdAt: node.created_at ?? null,
      })),
      total,
    });
  } catch (error) {
    console.error("memory GET failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "读取百炼长期记忆失败，请检查记忆 API 配置。" }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少记忆 ID。" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const rate = await enforceRateLimit(user.id, "memory-delete", 20);
  if (!rate.allowed) return NextResponse.json({ error: "操作太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });

  if (!isBailianMemoryConfigured()) {
    return NextResponse.json({ error: "百炼长期记忆未配置。" }, { status: 503 });
  }

  try {
    const owned = new Set<string>();
    for (let page = 1; page <= 3; page += 1) {
      const { memories } = await listBailianMemory(user.id, page, 100);
      memories.forEach((node) => owned.add(node.memory_node_id));
      if (memories.length < 100) break;
    }
    if (!owned.has(id)) return NextResponse.json({ error: "记忆不存在或无权访问。" }, { status: 404 });
    await deleteBailianMemory(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("memory DELETE failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "删除长期记忆失败。" }, { status: 502 });
  }
}