import { TUTOR_SYSTEM_PROMPT } from "@/lib/ai/prompts";

export type TutorChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function buildTutorMessages(input: {
  learnerContext: string;
  history: { role: string; content: string }[];
  message: string;
}): TutorChatMessage[] {
  const history = input.history
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({ role: item.role as "user" | "assistant", content: item.content }));

  return [
    { role: "system", content: TUTOR_SYSTEM_PROMPT },
    { role: "system", content: input.learnerContext },
    ...history,
    { role: "user", content: input.message },
  ];
}