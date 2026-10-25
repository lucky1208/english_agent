"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, RefreshCcw, Volume2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { formatReviewInterval, scheduleReview } from "@/lib/review";

type ReviewItem = {
  id: string;
  itemType: "vocabulary" | "correction";
  front: string;
  back: string;
  example: string;
  explanationZh: string;
  errorTypes: string[];
  masteryLevel: number;
  nextReviewAt: string | null;
};

type ReviewData = {
  queue: ReviewItem[];
  counts: {
    vocabulary: number;
    corrections: number;
    total: number;
    totalVocabulary: number;
    totalCorrections: number;
    reviewedToday: number;
  };
};

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

const QUALITY_OPTIONS = [
  { quality: 1, label: "忘了", hint: "重新开始" },
  { quality: 3, label: "有点难", hint: "保持进度" },
  { quality: 4, label: "记得", hint: "正常前进" },
  { quality: 5, label: "太简单", hint: "快速前进" },
] as const;

export default function ReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastInterval, setLastInterval] = useState("");
  const [done, setDone] = useState({ total: 0, again: 0 });
  const [finished, setFinished] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setFinished(false);
    setIndex(0);
    setRevealed(false);
    setLastInterval("");
    setDone({ total: 0, again: 0 });
    try {
      const response = await fetch("/api/review", { cache: "no-store" });
      const payload = (await response.json()) as ReviewData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "读取复习计划失败");
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取复习计划失败");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const item = data?.queue[index];
  const remaining = data ? data.counts.total : 0;

  async function grade(quality: number) {
    if (!item || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType: item.itemType, itemId: item.id, quality }),
      });
      const payload = (await response.json()) as { error?: string; intervalMinutes?: number };
      if (!response.ok) throw new Error(payload.error || "保存复习结果失败");
      const nextDone = { total: done.total + 1, again: done.again + (quality < 3 ? 1 : 0) };
      setDone(nextDone);
      setLastInterval(payload.intervalMinutes ? formatReviewInterval(payload.intervalMinutes) : "");
      setData((current) => current ? {
        ...current,
        counts: {
          ...current.counts,
          total: Math.max(0, current.counts.total - 1),
          reviewedToday: current.counts.reviewedToday + 1,
        },
      } : current);
      if (data && index + 1 >= data.queue.length) {
        setFinished(true);
      } else {
        setIndex((current) => current + 1);
        setRevealed(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存复习结果失败");
    } finally {
      setBusy(false);
    }
  }

  const counts = data?.counts;

  return (
    <AppShell title="今日复习">
      <main className="main-content">
        <div className="eyebrow">SPACED REPETITION</div>
        <h1 className="page-heading">把不会的，练成会用的。</h1>
        <p className="page-lede">系统会把对话中记录的错误和词汇按遗忘曲线安排复习。先自己回忆，再看答案；按真实感受选择难度。</p>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{counts ? counts.total : "—"}</div>
            <div className="stat-label">待复习</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{counts ? counts.reviewedToday : "—"}</div>
            <div className="stat-label">今天已复习</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{counts ? counts.totalVocabulary : "—"}</div>
            <div className="stat-label">词汇总量</div>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="review-stage">
          {!data && !error && <div className="panel empty-state">正在读取复习计划…</div>}

          {data && (finished || !item) && (
            <div className="panel review-empty">
              <div className="review-empty-icon"><CheckCircle2 size={34} /></div>
              <h2>{finished ? (remaining > 0 ? "这一批完成了" : "今天的复习完成了") : "今天没有到期内容"}</h2>
              <p>
                {finished
                  ? `本轮复习 ${done.total} 项${done.again ? `，其中 ${done.again} 项需要重新巩固` : ""}。${remaining > 0 ? `还有 ${remaining} 项待复习，可以继续读取下一批。` : ""}${lastInterval ? `最近一项的下次复习在 ${lastInterval} 后。` : ""}`
                  : "继续对话，新的错题和词汇会自动进入复习计划。"}
              </p>
              <div className="review-empty-actions">
                <button className="btn" type="button" onClick={() => void load()}><RefreshCcw size={15} />重新读取</button>
                <Link className="btn btn-primary" href="/">继续对话<ArrowRight size={15} /></Link>
                <Link className="btn" href="/vocabulary"><BookOpen size={15} />查看词汇本</Link>
              </div>
            </div>
          )}

          {data && item && !finished && (
            <section className="panel review-card">
              <div className="review-card-head">
                <span className="pill">{item.itemType === "vocabulary" ? "个人词汇" : "错题复习"}</span>
                <span className="inline-muted">剩余 {remaining} 项</span>
              </div>
              <div className="review-prompt">
                <div className="review-kicker">{item.itemType === "vocabulary" ? "这个单词/短语是什么意思？" : "这句话哪里不自然？"}</div>
                <div className="review-front-row">
                  <div className="review-front">{item.front}</div>
                  {item.itemType === "vocabulary" && (
                    <button className="btn btn-small" type="button" aria-label="朗读单词" onClick={() => speak(item.front)}>
                      <Volume2 size={14} />
                      发音
                    </button>
                  )}
                </div>
                {item.errorTypes.length > 0 && (
                  <div className="review-tags">
                    {item.errorTypes.map((type) => <span className="pill" key={type}>{type}</span>)}
                  </div>
                )}
              </div>

              {!revealed ? (
                <button className="btn btn-primary review-reveal" type="button" onClick={() => setRevealed(true)}>
                  显示答案
                </button>
              ) : (
                <>
                  <div className="review-answer">
                    <div className="review-kicker">{item.itemType === "vocabulary" ? "释义" : "更自然的表达"}</div>
                    <div className="review-back">{item.back || "还没有记录释义。"}</div>
                    {item.example && (
                      <div className="review-example-row">
                        <div className="review-example">Example: {item.example}</div>
                        <button className="btn btn-small" type="button" aria-label="朗读例句" onClick={() => speak(item.example)}>
                          <Volume2 size={14} />
                          发音
                        </button>
                      </div>
                    )}
                    {item.explanationZh && <div className="review-explanation">{item.explanationZh}</div>}
                  </div>
                  <div className="review-grades">
                    {QUALITY_OPTIONS.map((option) => {
                      const schedule = scheduleReview(option.quality, item.masteryLevel);
                      return (
                        <button className="review-grade" type="button" key={option.quality} onClick={() => void grade(option.quality)} disabled={busy}>
                          <strong>{option.label}</strong>
                          <span>{formatReviewInterval(schedule.intervalMinutes)}后</span>
                        </button>
                      );
                    })}
                  </div>
                  {lastInterval && <p className="review-last">上一项已安排：{lastInterval}后复习</p>}
                </>
              )}
            </section>
          )}
        </div>
      </main>
    </AppShell>
  );
}