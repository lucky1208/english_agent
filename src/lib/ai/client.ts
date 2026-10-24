import OpenAI from "openai";

export function getBailianClient() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseURL = process.env.DASHSCOPE_BASE_URL;
  if (!apiKey || !baseURL) throw new Error("请在服务端配置 DASHSCOPE_API_KEY 和 DASHSCOPE_BASE_URL。");
  return new OpenAI({ apiKey, baseURL, timeout: 25_000, maxRetries: 1 });
}

export function getTextModel() {
  const model = process.env.DASHSCOPE_TEXT_MODEL;
  if (!model) throw new Error("请配置 DASHSCOPE_TEXT_MODEL。");
  return model;
}