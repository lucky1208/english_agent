export type ReviewItemType = "vocabulary" | "correction";

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

export const REVIEW_INTERVALS_MINUTES = [10, 24 * 60, 3 * 24 * 60, 7 * 24 * 60, 14 * 24 * 60, 30 * 24 * 60] as const;

export type ReviewSchedule = {
  masteryLevel: number;
  intervalMinutes: number;
  nextReviewAt: Date;
};

export function scheduleReview(quality: number, currentLevel: number, now = new Date()): ReviewSchedule {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new Error("Review quality must be an integer between 0 and 5.");
  }
  const level = Math.min(5, Math.max(0, Math.trunc(currentLevel)));
  if (quality < 3) {
    return {
      masteryLevel: 0,
      intervalMinutes: REVIEW_INTERVALS_MINUTES[0],
      nextReviewAt: new Date(now.getTime() + REVIEW_INTERVALS_MINUTES[0] * 60_000),
    };
  }
  const nextLevel = Math.min(5, Math.max(1, level + (quality === 4 ? 1 : quality === 5 ? 2 : 0)));
  const intervalMinutes = REVIEW_INTERVALS_MINUTES[nextLevel];
  return {
    masteryLevel: nextLevel,
    intervalMinutes,
    nextReviewAt: new Date(now.getTime() + intervalMinutes * 60_000),
  };
}

export function isReviewDue(nextReviewAt: string | null | undefined, now = new Date()) {
  if (!nextReviewAt) return true;
  return new Date(nextReviewAt).getTime() <= now.getTime();
}

export function formatReviewInterval(intervalMinutes: number) {
  if (intervalMinutes < 60) return `${intervalMinutes} 分钟`;
  const hours = Math.round(intervalMinutes / 60);
  if (hours < 48) return `${hours} 小时`;
  return `${Math.round(hours / 24)} 天`;
}