import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 240);
  return "请求失败，请稍后重试。";
}