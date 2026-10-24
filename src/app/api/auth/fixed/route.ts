import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function allowAttempt(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  const email = process.env.FIXED_ACCOUNT_EMAIL?.trim();
  const password = process.env.FIXED_ACCOUNT_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ configured: false }, { status: 503 });
  }

  if (!allowAttempt(clientKey(request))) {
    return NextResponse.json({ error: "尝试次数过多，请稍后再试。" }, { status: 429 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.auth.getUser();
  if (existing.user?.email?.toLowerCase() === email.toLowerCase()) {
    return NextResponse.json({
      user: {
        id: existing.user.id,
        email: existing.user.email,
        isAnonymous: Boolean(existing.user.is_anonymous),
      },
    });
  }

  const accessCode = process.env.FIXED_ACCOUNT_ACCESS_CODE?.trim();
  if (!accessCode && process.env.NODE_ENV === "production") {
    return NextResponse.json({
      configured: true,
      error: "固定账户未配置访问码。请设置 FIXED_ACCOUNT_ACCESS_CODE 后重新部署。",
    }, { status: 503 });
  }

  if (accessCode) {
    const provided = request.headers.get("x-access-code")?.trim();
    if (!provided) {
      return NextResponse.json({ requiresCode: true, error: "请输入访问码。" }, { status: 401 });
    }
    if (provided !== accessCode) {
      return NextResponse.json({ requiresCode: true, error: "访问码不正确。" }, { status: 401 });
    }
  }

  if (existing.user) {
    await supabase.auth.signOut();
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json({
      configured: true,
      error: "固定账户登录失败，请检查 FIXED_ACCOUNT_EMAIL、FIXED_ACCOUNT_PASSWORD 和 Supabase 用户状态。",
    }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      isAnonymous: Boolean(data.user.is_anonymous),
    },
  });
}