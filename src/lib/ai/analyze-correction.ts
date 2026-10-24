import { getBailianClient, getTextModel } from "@/lib/ai/client";
import { CORRECTION_ANALYSIS_PROMPT } from "@/lib/ai/prompts";
import { TutorResultSchema } from "@/lib/ai/schema";

export async function analyzeSpokenEnglish(text: string) {
  const client = getBailianClient();
  const response = await client.chat.completions.create({
    model: getTextModel(),
    messages: [
      { role: "system", content: CORRECTION_ANALYSIS_PROMPT },
      { role: "user", content: text.slice(0, 1800) },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });
  const content = response.choices[0]?.message?.content;
  if (!content) return null;
  try {
    const parsed = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    const validated = TutorResultSchema.safeParse({
      reply: parsed.reply || "Okay.",
      correction: parsed.correction ?? null,
      vocabulary: parsed.vocabulary || [],
    });
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}