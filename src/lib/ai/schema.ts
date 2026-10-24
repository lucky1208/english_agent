import { z } from "zod";

export const TutorResultSchema = z.object({
  reply: z.string().min(1).max(6000),
  correction: z.object({
    originalText: z.string().max(1500),
    correctedText: z.string().max(1500),
    explanationZh: z.string().max(2000).default(""),
    errorTypes: z.array(z.enum(["grammar", "tense", "article", "word_choice", "word_order", "collocation", "naturalness", "pronunciation", "none"])).max(8).default([]),
    severity: z.enum(["none", "low", "medium", "high"]).default("medium"),
    shouldSave: z.boolean().default(true),
  }).nullable(),
  vocabulary: z.array(z.object({
    word: z.string().min(1).max(100),
    meaning: z.string().max(400).default(""),
    example: z.string().max(500).default(""),
  })).max(5).default([]),
});

export type TutorResult = z.infer<typeof TutorResultSchema>;

export function parseTutorResult(text: string): TutorResult {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = null;
  }
  const validated = TutorResultSchema.safeParse(parsed);
  if (validated.success) return validated.data;
  const reply = parsed && typeof parsed === "object" && "reply" in parsed && typeof parsed.reply === "string"
    ? parsed.reply
    : text;
  return {
    reply: reply.slice(0, 6000) || "I’m sorry, could you say that another way?",
    correction: null,
    vocabulary: [],
  };
}