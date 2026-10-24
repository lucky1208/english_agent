import { describe, expect, it } from "vitest";
import { parseTutorResult } from "@/lib/ai/schema";

describe("parseTutorResult", () => {
  it("parses valid tutor JSON", () => {
    const result = parseTutorResult(JSON.stringify({ reply: "Good job!", correction: null, vocabulary: [] }));
    expect(result.reply).toBe("Good job!");
    expect(result.correction).toBeNull();
  });

  it("parses a structured correction and vocabulary", () => {
    const result = parseTutorResult(JSON.stringify({
      reply: "That sounds like a busy week.",
      correction: {
        originalText: "I go to meeting yesterday",
        correctedText: "I went to a meeting yesterday",
        explanationZh: "yesterday 要用过去时。",
        errorTypes: ["tense", "article"],
        severity: "medium",
        shouldSave: true,
      },
      vocabulary: [{ word: "follow up", meaning: "跟进", example: "I'll follow up tomorrow." }],
    }));
    expect(result.correction?.correctedText).toBe("I went to a meeting yesterday");
    expect(result.vocabulary[0]?.word).toBe("follow up");
  });

  it("falls back to plain text without trusting malformed corrections", () => {
    const result = parseTutorResult("A natural answer");
    expect(result.reply).toBe("A natural answer");
    expect(result.correction).toBeNull();
    expect(result.vocabulary).toEqual([]);
  });

  it("does not trust an invalid correction shape", () => {
    const result = parseTutorResult(JSON.stringify({
      reply: "Okay",
      correction: { originalText: "x", correctedText: "y", errorTypes: ["not-a-type"] },
      vocabulary: [],
    }));
    expect(result.correction).toBeNull();
    expect(result.reply).toBe("Okay");
    expect(result.vocabulary).toEqual([]);
  });
});