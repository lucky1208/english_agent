"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus, RefreshCcw, Trash2, Volume2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";

type Word = {
  id: string;
  word: string;
  meaning: string;
  example: string;
  mastery_level: number;
  next_review_at: string | null;
  created_at: string;
};

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export default function VocabularyPage() {
  const [items, setItems] = useState<Word[]>([]);
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [example, setExample] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/vocabulary", { cache: "no-store" });
    const data = (await response.json()) as { vocabulary?: Word[]; error?: string };
    if (response.ok) setItems(data.vocabulary ?? []);
    else setError(data.error || "读取失败");
  }

  useEffect(() => { void load(); }, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/vocabulary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, meaning, example }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "保存失败");
      return;
    }
    setWord("");
    setMeaning("");
    setExample("");
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/vocabulary?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  const due = items.filter((item) => !item.next_review_at || new Date(item.next_review_at) <= new Date()).length;

  return (
    <AppShell title="个人词汇">
      <main className="main-content">
        <div className="eyebrow">WORDS THAT STICK</div>
        <h1 className="page-heading">把遇见的表达，变成自己的词汇。</h1>
        <p className="page-lede">对话中出现的实用表达会自动收录。你也可以自己添加词汇与例句，系统会按遗忘曲线提醒复习。</p>

        <div className="page-actions">
          <span className="inline-muted">共 {items.length} 个 · 待复习 {due} 个</span>
          <Link className="btn btn-primary" href="/review"><RefreshCcw size={15} />开始复习</Link>
        </div>

        <div className="panel panel-pad">
          <h3 className="section-title">添加一个表达</h3>
          <form onSubmit={add}>
            <div className="form-grid">
              <div>
                <label className="field-label" htmlFor="word">Word / Phrase</label>
                <input className="field" id="word" required value={word} onChange={(e) => setWord(e.target.value)} placeholder="e.g. follow up" />
              </div>
              <div>
                <label className="field-label" htmlFor="meaning">中文含义</label>
                <input className="field" id="meaning" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="跟进" />
              </div>
            </div>
            <label className="field-label" htmlFor="example">例句</label>
            <input className="field" id="example" value={example} onChange={(e) => setExample(e.target.value)} placeholder="I'll follow up with you tomorrow." />
            <button className="btn btn-primary"><Plus size={15} />保存词汇</button>
          </form>
          {error && <div className="error-text">{error}</div>}
        </div>

        <div className="list-stack">
          {items.length === 0 && (
            <div className="panel empty-state">
              <BookOpen size={27} style={{ margin: "0 auto 12px" }} />
              词汇本还是空的。和 AI 聊天或添加你的第一个表达吧。
            </div>
          )}
          {items.map((item) => (
            <article className="record" key={item.id}>
              <div className="record-meta">
                <div className="record-title" style={{ marginBottom: 0 }}>{item.word}</div>
                <div className="record-inline-actions">
                  <span className="pill">掌握 {item.mastery_level}/5</span>
                  <button className="btn btn-small" type="button" aria-label={`朗读 ${item.word}`} onClick={() => speak(item.word)}>
                    <Volume2 size={14} />
                  </button>
                  <button className="btn btn-small" aria-label={`删除 ${item.word}`} onClick={() => void remove(item.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="record-body">{item.meaning || "还没有记录释义。"}</div>
              {item.example && <div className="record-example">{item.example}</div>}
              <div className="inline-muted" style={{ marginTop: 8 }}>
                {item.next_review_at ? `下次复习：${new Date(item.next_review_at).toLocaleDateString()}` : "等待首次复习"}
              </div>
            </article>
          ))}
        </div>
      </main>
    </AppShell>
  );
}