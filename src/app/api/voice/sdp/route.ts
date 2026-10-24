import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

function normalizeSdp(sdp: string) {
  return `${sdp.trim().replace(/\r?\n/g, "\r\n")}\r\n`;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const rate = await enforceRateLimit(user.id, "voice-sdp", 10);
  if (!rate.allowed) return NextResponse.json({ error: "语音连接请求过于频繁，稍后再试。" }, { status: rate.configurationError ? 503 : 429 });

  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  const model = process.env.DASHSCOPE_REALTIME_MODEL?.trim() || "qwen-audio-3.1-realtime-plus";
  const endpoint = process.env.DASHSCOPE_REALTIME_URL?.trim();
  if (!apiKey || !endpoint) {
    return NextResponse.json(
      { error: "未配置 DASHSCOPE_API_KEY 或 DASHSCOPE_REALTIME_URL。请按百炼 WebRTC 文档设置地域/业务空间专属 endpoint。" },
      { status: 503 },
    );
  }

  const sdp = await request.text();
  if (!sdp || sdp.length > 250_000 || !sdp.includes("v=0")) {
    return NextResponse.json({ error: "SDP 请求格式不正确。" }, { status: 400 });
  }

  try {
    const url = new URL(endpoint);
    url.searchParams.set("model", model);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/sdp",
        Accept: "application/sdp",
      },
      body: normalizeSdp(sdp),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const answer = await response.text();
    if (!response.ok) {
      console.error("Bailian SDP exchange failed", response.status, answer.slice(0, 200));
      return NextResponse.json(
        { error: `百炼 SDP 协商失败（HTTP ${response.status}）。请核对地域、模型权限、Workspace endpoint 与 API Key。` },
        { status: 502 },
      );
    }
    if (!answer.trim().startsWith("v=0")) {
      console.error("Bailian SDP answer was not valid SDP", answer.slice(0, 160));
      return NextResponse.json({ error: "百炼返回了非 SDP 内容，请检查 endpoint 是否为 /api/v1/webrtc/realtime。" }, { status: 502 });
    }
    return new Response(normalizeSdp(answer), {
      status: 200,
      headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("SDP proxy error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "无法连接百炼实时语音服务。请检查 endpoint 与网络配置。" }, { status: 502 });
  }
}