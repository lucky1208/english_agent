import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

function normalizeSdp(sdp: string) {
  return `${sdp.trim().replace(/\r?\n/g, "\r\n")}\r\n`;
}

function networkFailureCode(error: unknown) {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: { code?: string } }).cause;
    if (cause?.code) return cause.code;
    if (error.name === "TimeoutError" || error.name === "AbortError") return "TIMEOUT";
    return error.message.slice(0, 80);
  }
  return "UNKNOWN";
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
  if (endpoint.includes("{") || endpoint.includes("}")) {
    return NextResponse.json(
      { error: "DASHSCOPE_REALTIME_URL 仍包含 {WorkspaceId} 占位符。请替换成百炼控制台里的真实业务空间 ID。" },
      { status: 503 },
    );
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return NextResponse.json(
      { error: "DASHSCOPE_REALTIME_URL 不是有效 URL。正确格式：https://{真实 WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime" },
      { status: 503 },
    );
  }
  url.searchParams.set("model", model);

  const sdp = await request.text();
  if (!sdp || sdp.length > 250_000 || !sdp.includes("v=0")) {
    return NextResponse.json({ error: "SDP 请求格式不正确。" }, { status: 400 });
  }

  try {
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
      console.error("Bailian SDP exchange failed", url.host, response.status, answer.slice(0, 200));
      return NextResponse.json(
        { error: `百炼 SDP 协商失败（HTTP ${response.status}）。请核对地域、模型权限、Workspace endpoint 与 API Key。`, host: url.host },
        { status: 502 },
      );
    }
    if (!answer.trim().startsWith("v=0")) {
      console.error("Bailian SDP answer was not valid SDP", url.host, answer.slice(0, 160));
      return NextResponse.json({ error: "百炼返回了非 SDP 内容，请检查 endpoint 是否为 /api/v1/webrtc/realtime。", host: url.host }, { status: 502 });
    }
    return new Response(normalizeSdp(answer), {
      status: 200,
      headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = networkFailureCode(error);
    console.error("SDP proxy network error", url.host, code);
    const hint = code === "ENOTFOUND"
      ? "域名解析失败，endpoint 可能写错。"
      : code === "TIMEOUT"
        ? "连接超时，可能是 Vercel 所在区域无法访问该百炼地域。"
        : "请检查 endpoint、地域和网络配置。";
    return NextResponse.json({
      error: `无法连接百炼实时语音服务（${code}）。${hint}`,
      host: url.host,
      detail: code,
    }, { status: 502 });
  }
}