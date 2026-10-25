import { NextResponse } from "next/server";
import { isBailianMemoryConfigured } from "@/lib/memory/bailian";

export const runtime = "nodejs";

function hostOf(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

function realtimeUrlReady(value: string | undefined) {
  if (!value || value.includes("{") || value.includes("}")) return false;
  return hostOf(value) !== "invalid-url";
}

function realtimePathReady(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value).pathname.replace(/\/+$/, "").endsWith("/api/v1/webrtc/realtime");
  } catch {
    return false;
  }
}

export async function GET() {
  const realtimeUrl = process.env.DASHSCOPE_REALTIME_URL?.trim();
  const textKey = process.env.DASHSCOPE_API_KEY?.trim();
  const dedicatedRealtimeKey = process.env.DASHSCOPE_REALTIME_API_KEY?.trim();
  const realtimeKey = dedicatedRealtimeKey || textKey;
  return NextResponse.json({
    ok: true,
    service: "english-mate",
    time: new Date().toISOString(),
    deploymentRegion: process.env.VERCEL_REGION || null,
    config: {
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)),
      bailianText: Boolean(process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_BASE_URL && process.env.DASHSCOPE_TEXT_MODEL),
      bailianTextHost: hostOf(process.env.DASHSCOPE_BASE_URL),
      bailianRealtime: Boolean(realtimeKey && realtimeUrlReady(realtimeUrl) && realtimePathReady(realtimeUrl)),
      bailianRealtimeKey: Boolean(process.env.DASHSCOPE_REALTIME_API_KEY),
      bailianRealtimeKeySource: dedicatedRealtimeKey
        ? "dedicated"
        : textKey
          ? "fallback"
          : "none",
      bailianRealtimeKeySameAsText: Boolean(dedicatedRealtimeKey && textKey && dedicatedRealtimeKey === textKey),
      bailianRealtimeHost: hostOf(realtimeUrl),
      bailianRealtimePlaceholder: Boolean(realtimeUrl && (realtimeUrl.includes("{") || realtimeUrl.includes("}"))),
      bailianRealtimePathValid: realtimePathReady(realtimeUrl),
      bailianMemory: isBailianMemoryConfigured(),
      rateLimit: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
      rateLimitMode: process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? "upstash"
        : process.env.FIXED_ACCOUNT_EMAIL
          ? "memory-fallback"
          : "none",
      authAccountDeletion: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      fixedAccount: Boolean(process.env.FIXED_ACCOUNT_EMAIL && process.env.FIXED_ACCOUNT_PASSWORD),
      fixedAccountAccessCode: Boolean(process.env.FIXED_ACCOUNT_ACCESS_CODE),
    },
  });
}