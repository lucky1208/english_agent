import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { countDueReviews } from "@/lib/learner-context";
import { scheduleReview } from "@/lib/review";

export const runtime = "nodejs";

type VocabularyRow = {
  id: string;
  word: string;
  meaning: string;
  example: string;
  mastery_level: number;
  next_review_at: string | null;
};

type CorrectionRow = {
  id: string;
  original_text: string;
  corrected_text: string;
  explanation_zh: string;
  error_types: string[] | null;
  severity: string;
  review_count: number;
  next_review_at: string | null;
};

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

    const now = new Date().toISOString();
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCHours(0, 0, 0, 0);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

    const [vocabularyResult, correctionResult, counts, vocabularyTotal, correctionTotal, reviewedToday, reviewActivity] = await Promise.all([
      supabase
        .from("vocabulary")
        .select("id,word,meaning,example,mastery_level,next_review_at")
        .eq("user_id", user.id)
        .or(`next_review_at.is.null,next_review_at.lte.${now}`)
        .order("next_review_at", { ascending: true, nullsFirst: true })
        .limit(30),
      supabase
        .from("corrections")
        .select("id,original_text,corrected_text,explanation_zh,error_types,severity,review_count,next_review_at")
        .eq("user_id", user.id)
        .eq("mastered", false)
        .or(`next_review_at.is.null,next_review_at.lte.${now}`)
        .order("next_review_at", { ascending: true, nullsFirst: true })
        .limit(30),
      countDueReviews(supabase, user.id),
      supabase.from("vocabulary").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("corrections").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("review_records").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("reviewed_at", startOfDay.toISOString()),
      supabase.from("review_records").select("reviewed_at").eq("user_id", user.id).gte("reviewed_at", sevenDaysAgo.toISOString()).limit(5000),
    ]);

    if (vocabularyResult.error) throw vocabularyResult.error;
    if (correctionResult.error) throw correctionResult.error;

    const vocabularyQueue = ((vocabularyResult.data ?? []) as VocabularyRow[]).map((item) => ({
      id: item.id,
      itemType: "vocabulary" as const,
      front: item.word,
      back: item.meaning,
      example: item.example,
      explanationZh: "",
      errorTypes: [] as string[],
      masteryLevel: item.mastery_level,
      nextReviewAt: item.next_review_at,
    }));
    const correctionQueue = ((correctionResult.data ?? []) as CorrectionRow[]).map((item) => ({
      id: item.id,
      itemType: "correction" as const,
      front: item.original_text,
      back: item.corrected_text,
      example: "",
      explanationZh: item.explanation_zh,
      errorTypes: (item.error_types ?? []).filter((type) => type !== "none"),
      masteryLevel: item.review_count,
      nextReviewAt: item.next_review_at,
    }));

    const activityMap = new Map<string, number>();
    for (let index = 0; index < 7; index += 1) {
      const day = new Date(sevenDaysAgo);
      day.setUTCDate(sevenDaysAgo.getUTCDate() + index);
      activityMap.set(day.toISOString().slice(0, 10), 0);
    }
    for (const row of reviewActivity.data ?? []) {
      const reviewedAt = typeof row.reviewed_at === "string" ? row.reviewed_at.slice(0, 10) : "";
      if (activityMap.has(reviewedAt)) activityMap.set(reviewedAt, (activityMap.get(reviewedAt) ?? 0) + 1);
    }
    const activity = [...activityMap.entries()].map(([date, count]) => ({ date, count }));

    return NextResponse.json({
      activity,
      queue: [...vocabularyQueue, ...correctionQueue],
      counts: {
        ...counts,
        totalVocabulary: vocabularyTotal.count ?? 0,
        totalCorrections: correctionTotal.count ?? 0,
        reviewedToday: reviewedToday.count ?? 0,
      },
    });
  } catch (error) {
    console.error("review GET failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "读取复习计划失败。请确认数据库迁移已执行。" }, { status: 500 });
  }
}

const ReviewSchema = z.object({
  itemType: z.enum(["vocabulary", "correction"]),
  itemId: z.string().uuid(),
  quality: z.number().int().min(0).max(5),
});

export async function POST(request: Request) {
  try {
    const input = ReviewSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "复习参数不正确。" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    const rate = await enforceRateLimit(user.id, "review", 40);
    if (!rate.allowed) return NextResponse.json({ error: "复习操作太频繁，请稍后再试。" }, { status: rate.configurationError ? 503 : 429 });

    const now = new Date();
    if (input.data.itemType === "vocabulary") {
      const { data: row } = await supabase
        .from("vocabulary")
        .select("id,mastery_level,review_count")
        .eq("id", input.data.itemId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!row) return NextResponse.json({ error: "词汇不存在或无权访问。" }, { status: 404 });

      const schedule = scheduleReview(input.data.quality, Number(row.mastery_level ?? 0), now);
      const { error } = await supabase
        .from("vocabulary")
        .update({
          mastery_level: schedule.masteryLevel,
          next_review_at: schedule.nextReviewAt.toISOString(),
          last_reviewed_at: now.toISOString(),
          review_count: Number(row.review_count ?? 0) + 1,
        })
        .eq("id", row.id)
        .eq("user_id", user.id);
      if (error) throw error;

      await supabase.from("review_records").insert({
        user_id: user.id,
        item_type: "vocabulary",
        item_id: row.id,
        quality: input.data.quality,
        next_review_at: schedule.nextReviewAt.toISOString(),
      });

      return NextResponse.json({
        ok: true,
        masteryLevel: schedule.masteryLevel,
        intervalMinutes: schedule.intervalMinutes,
        nextReviewAt: schedule.nextReviewAt.toISOString(),
      });
    }

    const { data: row } = await supabase
      .from("corrections")
      .select("id,review_count")
      .eq("id", input.data.itemId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "错题不存在或无权访问。" }, { status: 404 });

    const schedule = scheduleReview(input.data.quality, Number(row.review_count ?? 0), now);
    const { error } = await supabase
      .from("corrections")
      .update({
        review_count: Number(row.review_count ?? 0) + 1,
        next_review_at: schedule.nextReviewAt.toISOString(),
        last_reviewed_at: now.toISOString(),
        mastered: input.data.quality === 5,
      })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (error) throw error;

    await supabase.from("review_records").insert({
      user_id: user.id,
      item_type: "correction",
      item_id: row.id,
      quality: input.data.quality,
      next_review_at: schedule.nextReviewAt.toISOString(),
    });

    return NextResponse.json({
      ok: true,
      masteryLevel: schedule.masteryLevel,
      intervalMinutes: schedule.intervalMinutes,
      nextReviewAt: schedule.nextReviewAt.toISOString(),
    });
  } catch (error) {
    console.error("review POST failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "保存复习结果失败。" }, { status: 500 });
  }
}