import type { SupabaseClient, User } from "@supabase/supabase-js";

let inFlight: Promise<User> | null = null;

export async function ensureGuestSession(supabase: SupabaseClient): Promise<User> {
  if (inFlight) return inFlight;

  const task = (async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) return data.user;

    const { data: anonymous, error } = await supabase.auth.signInAnonymously({
      options: { data: { display_name: "游客" } },
    });
    if (error) throw error;
    if (!anonymous.user) throw new Error("匿名登录没有返回用户。");
    return anonymous.user;
  })();

  inFlight = task;
  try {
    return await task;
  } finally {
    if (inFlight === task) inFlight = null;
  }
}

export function guestLabel(user: User) {
  return user.is_anonymous ? "游客模式" : user.email ?? "已登录";
}

export function guestAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/anonymous.*disabled|anonymous sign-?ins?.*disabled/i.test(message)) {
    return "Supabase 未开启匿名登录。请在 Supabase → Authentication → Providers → Anonymous Sign-Ins 中启用后重新部署。";
  }
  if (/Supabase 环境变量|NEXT_PUBLIC_SUPABASE/i.test(message)) {
    return "请先在 Vercel 配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY，然后重新部署。";
  }
  return message || "无法创建游客会话。";
}