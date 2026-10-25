"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck, BookMarked, RefreshCcw, Volume2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

type Mistake = {
  id: string;
  original_text: string;
  corrected_text: string;
  explanation_zh: string;
  error_types: string[];
  severity: string;
  mastered: boolean;
  review_count?: number;
  next_review_at?: string | null;
  created_at: string;
};

export default function MistakesPage() {
  const [items, setItems] = useState<Mistake[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/corrections", { cache: "no-store" });
    const data = (await response.json()) as { corrections?: Mistake[]; error?: string };
    if (response.ok) setItems(data.corrections ?? []);
    else setError(data.error || "读取失败");
  }

  useEffect(() => { void load(); }, []);

  async function toggle(item: Mistake) {
    await fetch("/api/corrections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, mastered: !item.mastered }),
    });
    await load();
  }

  const due = items.filter((item) => !item.mastered && (!item.next_review_at || new Date(item.next_review_at) <= new Date())).length;

  return (
    <AppShell title="错题本">
      <main className="main-content">
        <div className="eyebrow">LEARN FROM YOUR MISTAKES</div>
        <h1 className="page-heading">每一次错误，都是进步线索。</h1>
        <p className="page-lede">AI 会将值得复习的英语表达保存下来，帮助你识别反复出现的模式，并按遗忘曲线安排复习。</p>
        <div className="page-actions">
          <span className="inline-muted">共 {items.length} 条 · 待复习 {due} 条</span>
          <Link className="btn btn-primary" href="/review"><RefreshCcw size={15} />开始复习</Link>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="list-stack">
          {items.length === 0 && !error ? (
            <div className="panel empty-state">
              <BookMarked size={28} style={{ margin: "0 auto 12px" }} />
              还没有错题记录。开始一次英语对话，值得复习的表达会显示在这里。
            </div>
          ) : items.map((item) => (
            <article className="record" key={item.id}>
              <div className="record-meta">
                <span className="pill">{item.error_types.join(" · ") || "English"}</span>
                <span className="inline-muted">
                  {new Date(item.created_at).toLocaleDateString()}
                  {item.next_review_at ? ` · 下次复习 ${new Date(item.next_review_at).toLocaleDateString()}` : ""}
                </span>
              </div>
              <div className="record-body record-wrong">{item.original_text}</div>
              <div className="record-correct-row">
                <div className="record-title record-right">{item.corrected_text}</div>
                <button className="btn btn-small" type="button" aria-label="朗读纠正后的句子" onClick={() => speak(item.corrected_text)}>
                  <Volume2 size={14} />
                  发音
                </button>
              </div>
              <div className="record-body">{item.explanation_zh}</div>
              <button className="btn" style={{ marginTop: 13 }} onClick={() => void toggle(item)}>
                <CheckCheck size={15} />
                {item.mastered ? "已掌握 · 重新复习" : "标记为已掌握"}
              </button>
            </article>
          ))}
        </div>
      </main>
    </AppShell>
  );
}