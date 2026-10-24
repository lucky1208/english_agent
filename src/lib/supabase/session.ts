import type { SupabaseClient, User } from "@supabase/supabase-js";

export const ACCESS_CODE_STORAGE_KEY = "english-mate-access-code";

export class AccessCodeRequiredError extends Error {
  constructor(message = "需要访问码。") {
    super(message);
    this.name = "AccessCodeRequiredError";
  }
}

export type SessionUser = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  label: string;
};

type FixedAuthResponse = {
  user?: { id: string; email: string | null; isAnonymous?: boolean };
  configured?: boolean;
  requiresCode?: boolean;
  error?: string;
};

let inFlight: Promise<SessionUser> | null = null;

function fromSupabaseUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email ?? null,
    isAnonymous: Boolean(user.is_anonymous),
    label: user.is_anonymous ? "游客模式" : user.email ?? "已登录",
  };
}

export async function ensureSession(supabase: SupabaseClient): Promise<SessionUser> {
  if (inFlight) return inFlight;

  const task = (async () => {
    const accessCode = typeof window !== "undefined"
      ? window.sessionStorage.getItem(ACCESS_CODE_STORAGE_KEY)
      : null;
    const response = await fetch("/api/auth/fixed", {
      method: "POST",
      headers: accessCode ? { "x-access-code": accessCode } : undefined,
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as FixedAuthResponse;

    if (response.ok && payload.user) {
      return {
        id: payload.user.id,
        email: payload.user.email,
        isAnonymous: Boolean(payload.user.isAnonymous),
        label: payload.user.email ?? "固定账户",
      };
    }

    if (response.status === 401 && payload.requiresCode) {
      throw new AccessCodeRequiredError(payload.error || "需要访问码。");
    }

    if (response.status === 503 && payload.configured === false) {
      const { data } = await supabase.auth.getUser();
      if (data.user) return fromSupabaseUser(data.user);
      const { data: anonymous, error } = await supabase.auth.signInAnonymously({
        options: { data: { display_name: "游客" } },
      });
      if (error) throw error;
      if (!anonymous.user) throw new Error("匿名登录没有返回用户。");
      return fromSupabaseUser(anonymous.user);
    }

    throw new Error(payload.error || "固定账户登录失败。");
  })();

  inFlight = task;
  try {
    return await task;
  } finally {
    if (inFlight === task) inFlight = null;
  }
}

export function sessionAuthErrorMessage(error: unknown) {
  if (error instanceof AccessCodeRequiredError) return error.message;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/anonymous.*disabled|anonymous sign-?ins?.*disabled/i.test(message)) {
    return "Supabase 未开启匿名登录。请在 Supabase → Authentication → Providers → Anonymous Sign-Ins 中启用后重新部署。";
  }
  if (/Supabase 环境变量|NEXT_PUBLIC_SUPABASE/i.test(message)) {
    return "请先在 Vercel 配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY，然后重新部署。";
  }
  return message || "无法创建登录会话。";
}