import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { deleteAllBailianMemory, isBailianMemoryConfigured } from "@/lib/memory/bailian";

export const runtime = "nodejs";
export const maxDuration = 60;

const DeleteSchema = z.object({ confirm: z.literal("DELETE") });

export async function POST(request: Request) {
  const input = DeleteSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: "请输入 DELETE 以确认删除。" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const rate = await enforceRateLimit(user.id, "account-delete", 3);
  if (!rate.allowed) return NextResponse.json({ error: "操作太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });

  let deletedMemories = 0;
  let memoryError = "";
  if (isBailianMemoryConfigured()) {
    try {
      deletedMemories = await deleteAllBailianMemory(user.id);
    } catch (error) {
      memoryError = error instanceof Error ? error.message : "unknown";
      console.error("account delete memory cleanup failed", memoryError);
    }
  }

  const tables = ["messages", "corrections", "review_records", "learning_sessions", "user_memory_refs", "conversations", "vocabulary", "profiles"] as const;
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("user_id", user.id);
    if (error) {
      console.error(`account delete ${table} failed`, error.message);
      return NextResponse.json({ error: `删除 ${table} 数据失败，请稍后重试或联系支持。` }, { status: 500 });
    }
  }

  const fixedEmail = process.env.FIXED_ACCOUNT_EMAIL?.trim().toLowerCase();
  if (fixedEmail && user.email?.toLowerCase() === fixedEmail) {
    return NextResponse.json({
      ok: true,
      authDeleted: false,
      deletedMemories,
      memoryError: memoryError || undefined,
      note: "固定账户已保留，学习数据已清空。刷新页面即可继续使用。",
    });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({
      ok: true,
      authDeleted: false,
      deletedMemories,
      memoryError: memoryError || undefined,
      note: "学习数据已删除。未配置 SUPABASE_SERVICE_ROLE_KEY，因此登录账户本身仍保留；请再次执行或联系管理员删除认证账户。",
    });
  }

  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error("account delete auth user failed", authError.message);
    return NextResponse.json({
      ok: true,
      authDeleted: false,
      deletedMemories,
      memoryError: memoryError || undefined,
      note: "学习数据已删除，但认证账户删除失败。请稍后重试或联系支持。",
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    authDeleted: true,
    deletedMemories,
    memoryError: memoryError || undefined,
  });
}