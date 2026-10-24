import { NextResponse } from "next/server";
import { isBailianMemoryConfigured } from "@/lib/memory/bailian";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "english-mate",
    time: new Date().toISOString(),
    config: {
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      bailianText: Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_BASE_URL && process.env.DASHSCOPE_TEXT_MODEL),
      bailianRealtime: Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_REALTIME_URL),
      bailianMemory: isBailianMemoryConfigured(),
      rateLimit: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
      authAccountDeletion: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
  });
}