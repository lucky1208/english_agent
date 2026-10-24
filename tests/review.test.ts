import { describe, expect, it } from "vitest";
import { isReviewDue, scheduleReview } from "@/lib/review";

describe("scheduleReview", () => {
  it("resets a forgotten item to ten minutes", () => {
    const schedule = scheduleReview(1, 4, new Date("2026-01-01T00:00:00Z"));
    expect(schedule.masteryLevel).toBe(0);
    expect(schedule.intervalMinutes).toBe(10);
    expect(schedule.nextReviewAt.toISOString()).toBe("2026-01-01T00:10:00.000Z");
  });

  it("moves a new item to one day when rated good", () => {
    const schedule = scheduleReview(4, 0, new Date("2026-01-01T00:00:00Z"));
    expect(schedule.masteryLevel).toBe(1);
    expect(schedule.intervalMinutes).toBe(1440);
  });

  it("keeps a hard item at the current interval", () => {
    expect(scheduleReview(3, 3).masteryLevel).toBe(3);
    expect(scheduleReview(3, 3).intervalMinutes).toBe(7 * 24 * 60);
  });

  it("allows easy items to skip ahead but caps at level five", () => {
    const schedule = scheduleReview(5, 4);
    expect(schedule.masteryLevel).toBe(5);
    expect(schedule.intervalMinutes).toBe(30 * 24 * 60);
  });

  it("rejects invalid quality values", () => {
    expect(() => scheduleReview(6, 0)).toThrow();
    expect(() => scheduleReview(-1, 0)).toThrow();
  });
});

describe("isReviewDue", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  it("treats an unset review date as due", () => {
    expect(isReviewDue(null, now)).toBe(true);
  });
  it("compares review dates", () => {
    expect(isReviewDue("2026-01-01T11:00:00Z", now)).toBe(true);
    expect(isReviewDue("2026-01-01T13:00:00Z", now)).toBe(false);
  });
});