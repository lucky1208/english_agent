import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabasePublicConfig();
  if (!url || !anonKey) throw new Error("请先配置 Supabase 环境变量（Project URL 和 anon/publishable key）。");
  return createBrowserClient(url, anonKey);
}