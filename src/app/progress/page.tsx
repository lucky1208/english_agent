"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCcw } from "lucide-react";
import { AppShell } from "@/components/app-shell";

type Correction = { id: string; mastered: boolean; error_types: string[]; created_at: string };
type Word = { id: string; word: string; mastery_level: number; created_at: string };
type ReviewCounts = { total: number; reviewedToday: number };
type Activity = { date: string; count: number };

export default function ProgressPage() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [review, setReview] = useState<ReviewCounts>({ total: 0, reviewedToday: 0 });
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/corrections", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/vocabulary", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/review", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([correctionData, vocabularyData, reviewData]) => {
      setCorrections(correctionData.corrections || []);
      setWords(vocabularyData.vocabulary || []);
      setReview(reviewData.counts || { total: 0, reviewedToday: 0 });
      setActivity(reviewData.activity || []);
    }).finally(() => setLoading(false));
  }, []);

  const mastered = corrections.filter((item) => item.mastered).length;
  const types = new Map<string, number>();
  corrections.forEach((item) => item.error_types.forEach((type) => types.set(type, (types.get(type) || 0) + 1)));
  const common = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const strongWords = words.filter((item) => item.mastery_level >= 4).length;
  const maxActivity = Math.max(1, ...activity.map((item) => item.count));

  return (
    <AppShell title="学习进度">
      <main className="main-content">
        <div className="eyebrow">YOUR GROWTH, OVER TIME</div>
        <h1 className="page-heading">看见自己正在变好的地方。</h1>
        <p className="page-lede">这里汇总已经保存的错题、词汇和复习记录。持续练习后，你会看到更清晰的学习趋势。</p>

        <div className="stats-grid stats-grid-four">
          <div className="stat-card"><div className="stat-value">{loading ? "—" : corrections.length}</div><div className="stat-label">已记录的表达问题</div></div>
          <div className="stat-card"><div className="stat-value">{loading ? "—" : mastered}</div><div className="stat-label">标记为已掌握</div></div>
          <div className="stat-card"><div className="stat-value">{loading ? "—" : words.length}</div><div className="stat-label">个人词汇</div></div>
          <div className="stat-card"><div className="stat-value">{loading ? "—" : review.total}</div><div className="stat-label">今日待复习</div></div>
        </div>

        <div className="panel panel-pad">
          <div className="panel-head panel-head-bare">
            <div>
              <div className="panel-title">最近 7 天复习</div>
              <div className="panel-subtitle">每天完成的复习次数</div>
            </div>
          </div>
          <div className="activity-chart">
            {activity.length === 0 && <div className="inline-muted">还没有复习记录。</div>}
            {activity.map((day) => (
              <div className="activity-column" key={day.date}>
                <div className="activity-bar-track">
                  <div className="activity-bar-fill" style={{ height: `${Math.max(4, day.count / maxActivity * 100)}%` }} />
                </div>
                <div className="activity-count">{day.count}</div>
                <div className="activity-label">{day.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel panel-pad">
          <div className="panel-head panel-head-bare">
            <div>
              <div className="panel-title">常见错误类型</div>
              <div className="panel-subtitle">基于已保存的错题统计</div>
            </div>
            <Link className="btn" href="/review"><RefreshCcw size={15} />去复习</Link>
          </div>
          {common.length === 0 ? (
            <div className="empty-state">还没有足够的数据。先进行几次对话，系统会逐渐统计值得复习的错误类型。</div>
          ) : (
            <div className="progress-bars">
              {common.map(([name, count]) => (
                <div key={name} className="progress-row">
                  <div className="progress-labels"><strong>{name}</strong><span className="inline-muted">{count} 次</span></div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.min(100, count / common[0][1] * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel panel-pad">
          <div className="panel-title">学习建议</div>
          <p className="record-body">
            {strongWords > 0
              ? `已经有 ${strongWords} 个词汇进入较高掌握度。下一步可以尝试在实时语音中主动使用它们。`
              : "先把今天到期的错题和词汇复习完，再开始新的对话。短时高频复习比一次背很多更有效。"}
            {review.reviewedToday > 0 ? `今天已经完成 ${review.reviewedToday} 次复习。` : ""}
          </p>
          <p className="inline-muted">说明：当前统计的是应用内学习记录，不代表标准化英语水平考试成绩。</p>
        </div>
      </main>
    </AppShell>
  );
}