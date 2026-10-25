"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Bot, Mic, MicOff, Plus, Send, Sparkles, Volume2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CoachStage, type CoachState } from "@/components/coach-avatar";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureSession, sessionAuthErrorMessage } from "@/lib/supabase/session";

type Correction = {
  originalText: string;
  correctedText: string;
  explanationZh: string;
  errorTypes: string[];
  severity: string;
  shouldSave?: boolean;
};

type Vocabulary = { word: string; meaning: string; example: string };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: { correction?: Correction | null; vocabulary?: Vocabulary[]; source?: string };
};

type Conversation = { id: string; title: string; mode: string };
type Profile = { level: string; goals: string; preferences: string; display_name?: string };
type Stats = { corrections: number; vocabulary: number; due: number; reviewedToday: number };

function speak(text: string, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) {
    onEnd?.();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function CorrectionCard({ correction }: { correction: Correction }) {
  return (
    <div className="correction-card">
      <div className="inline-muted">更自然的表达</div>
      <div className="correction-original">{correction.originalText}</div>
      <div className="correction-fixed">{correction.correctedText}</div>
      {correction.explanationZh && <div className="correction-explain">{correction.explanationZh}</div>}
      <div className="correction-actions">
        {correction.errorTypes.filter((type) => type !== "none").map((type) => <span className="pill" key={type}>{type}</span>)}
        <button className="btn btn-small" type="button" aria-label="朗读正确表达" onClick={() => speak(correction.correctedText)}>
          <Volume2 size={13} />
          听
        </button>
      </div>
    </div>
  );
}

function VocabularyChips({ items }: { items: Vocabulary[] }) {
  if (!items.length) return null;
  return (
    <div className="vocab-chips">
      {items.map((item) => (
        <span className="vocab-chip" key={`${item.word}-${item.example}`} title={`${item.meaning}${item.example ? ` — ${item.example}` : ""}`}>
          <BookOpen size={12} />
          {item.word}
        </span>
      ))}
    </div>
  );
}

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<Profile>({ level: "A2", goals: "", preferences: "" });
  const [stats, setStats] = useState<Stats>({ corrections: 0, vocabulary: 0, due: 0, reviewedToday: 0 });
  const [savingProfile, setSavingProfile] = useState(false);
  const [coachState, setCoachState] = useState<CoachState>("idle");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [autoRead, setAutoRead] = useState(true);
  const speakingTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  function markSpeakingBriefly() {
    if (speakingTimerRef.current) window.clearTimeout(speakingTimerRef.current);
    setCoachState("speaking");
    speakingTimerRef.current = window.setTimeout(() => {
      setCoachState("idle");
      speakingTimerRef.current = null;
    }, 2600);
  }

  function speakWithState(content: string) {
    speak(content, () => setCoachState("speaking"), () => setCoachState("idle"));
  }

  function updateAutoRead(value: boolean) {
    setAutoRead(value);
    try {
      window.localStorage.setItem("english-mate-auto-read", String(value));
    } catch {
      // Storage may be unavailable in private mode.
    }
  }

  const loadSideData = useCallback(async () => {
    const [profileRes, reviewRes, correctionsRes, vocabularyRes] = await Promise.all([
      fetch("/api/profile", { cache: "no-store" }),
      fetch("/api/review", { cache: "no-store" }),
      fetch("/api/corrections", { cache: "no-store" }),
      fetch("/api/vocabulary", { cache: "no-store" }),
    ]);
    if (profileRes.ok) {
      const data = (await profileRes.json()) as { profile: Profile };
      setProfile(data.profile);
    }
    let correctionCount = 0;
    let vocabularyCount = 0;
    let due = 0;
    let reviewedToday = 0;
    if (reviewRes.ok) {
      const data = (await reviewRes.json()) as { counts?: { totalCorrections?: number; totalVocabulary?: number; total?: number; reviewedToday?: number } };
      correctionCount = data.counts?.totalCorrections ?? 0;
      vocabularyCount = data.counts?.totalVocabulary ?? 0;
      due = data.counts?.total ?? 0;
      reviewedToday = data.counts?.reviewedToday ?? 0;
    } else {
      if (correctionsRes.ok) correctionCount = ((await correctionsRes.json()) as { corrections?: unknown[] }).corrections?.length ?? 0;
      if (vocabularyRes.ok) vocabularyCount = ((await vocabularyRes.json()) as { vocabulary?: unknown[] }).vocabulary?.length ?? 0;
    }
    setStats({ corrections: correctionCount, vocabulary: vocabularyCount, due, reviewedToday });
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const response = await fetch(`/api/conversations/${conversationId}/messages`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { messages: ChatMessage[] };
    setMessages(data.messages ?? []);
  }, []);

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { conversations: Conversation[] };
    setConversations(data.conversations ?? []);
    const current = data.conversations?.[0];
    if (current) {
      setConversation(current);
      conversationIdRef.current = current.id;
      await loadMessages(current.id);
    } else {
      setConversation(null);
      conversationIdRef.current = null;
      setMessages([]);
    }
  }, [loadMessages]);

  useEffect(() => {
    try {
      const supabase = createSupabaseBrowserClient();
      ensureSession(supabase)
        .then(() => {
          void loadConversations();
          void loadSideData();
        })
        .catch((e) => {
          setError(sessionAuthErrorMessage(e));
        });
    } catch (e) {
      setError(sessionAuthErrorMessage(e));
    }
  }, [loadConversations, loadSideData]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try {
      const storedAutoRead = window.localStorage.getItem("english-mate-auto-read");
      if (storedAutoRead !== null) setAutoRead(storedAutoRead === "true");
    } catch {
      // Keep the default.
    }
    setVoiceSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  useEffect(() => () => {
    if (speakingTimerRef.current) window.clearTimeout(speakingTimerRef.current);
    try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: profile.level, goals: profile.goals, preferences: profile.preferences }),
      });
      const data = (await response.json()) as { error?: string; profile?: Profile };
      if (!response.ok) throw new Error(data.error || "无法保存档案");
      if (data.profile) setProfile(data.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingProfile(false);
    }
  }

  async function switchConversation(conversationId: string) {
    if (conversationId === (conversation?.id ?? "")) return;
    setError("");
    if (!conversationId) {
      setConversation(null);
      conversationIdRef.current = null;
      setMessages([]);
      return;
    }
    const selected = conversations.find((item) => item.id === conversationId);
    if (!selected) return;
    setConversation(selected);
    conversationIdRef.current = selected.id;
    await loadMessages(selected.id);
  }

  async function submitMessage(content: string) {
    const message = content.trim();
    if (!message || busy) return;
    setText("");
    setError("");
    setBusy(true);
    setCoachState("thinking");
    const tempId = crypto.randomUUID();
    setMessages((current) => [...current, { id: tempId, role: "user", content: message }]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation?.id, message }),
      });
      const data = (await response.json()) as {
        error?: string;
        conversation?: Conversation;
        userMessage?: ChatMessage;
        assistantMessage?: ChatMessage;
        result?: { reply: string; correction?: Correction | null; vocabulary?: Vocabulary[] };
      };
      if (!response.ok) throw new Error(data.error || "发送失败");
      if (data.conversation) {
        const nextConversation: Conversation = {
          id: data.conversation.id,
          title: data.conversation.title || conversation?.title || message.slice(0, 50),
          mode: data.conversation.mode || "text",
        };
        setConversation(nextConversation);
        conversationIdRef.current = nextConversation.id;
        setConversations((current) => [nextConversation, ...current.filter((item) => item.id !== nextConversation.id)]);
      }
      const assistantMessage = data.assistantMessage
        ?? (data.result ? { id: crypto.randomUUID(), role: "assistant" as const, content: data.result.reply, metadata: { correction: data.result.correction, vocabulary: data.result.vocabulary } } : null);
      setMessages((current) => [
        ...current.filter((item) => item.id !== tempId),
        ...(data.userMessage ? [data.userMessage] : [{ id: crypto.randomUUID(), role: "user" as const, content: message }]),
        ...(assistantMessage ? [assistantMessage] : []),
      ]);
      if (autoRead && assistantMessage?.content) speakWithState(assistantMessage.content);
      else markSpeakingBriefly();
      void loadSideData();
    } catch (e) {
      setMessages((current) => current.filter((item) => item.id !== tempId));
      setText(message);
      setError(e instanceof Error ? e.message : "发送失败，请稍后重试。");
      setCoachState("idle");
    } finally {
      setBusy(false);
    }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    void submitMessage(text);
  }

  function stopListening() {
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    setVoiceListening(false);
    setCoachState("idle");
  }

  function startListening() {
    if (busy) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceSupported(false);
      setError("当前浏览器不支持语音识别，请使用 Chrome/Edge，或直接输入文字。");
      return;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setVoiceListening(true);
      setCoachState("listening");
      setError("");
      setText("");
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interim += transcript;
      }
      setText(finalText || interim);
      if (finalText.trim()) {
        setVoiceListening(false);
        setText("");
        setCoachState("thinking");
        recognition.stop();
        void submitMessage(finalText.trim());
      }
    };
    recognition.onerror = (event) => {
      setVoiceListening(false);
      recognitionRef.current = null;
      if (event.error === "aborted") return;
      setCoachState("error");
      if (event.error === "not-allowed") {
        setError("麦克风权限被拒绝。请在浏览器地址栏允许麦克风后重试。");
      } else if (event.error === "network") {
        setError("浏览器语音识别服务不可用（国内 Chrome 常见）。请改用 Microsoft Edge，或直接输入文字。");
      } else if (event.error === "no-speech") {
        setError("没有识别到语音，请再说一次。");
      } else {
        setError(`语音识别失败：${event.error}`);
      }
    };
    recognition.onend = () => {
      setVoiceListening(false);
      setCoachState((current) => current === "listening" ? "idle" : current);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoiceListening(false);
      setCoachState("error");
      setError("无法启动语音识别，请刷新页面后重试。");
    }
  }

  return (
    <AppShell title="英语对话">
      <main className="main-content">
        <div className="eyebrow">YOUR DAILY PRACTICE</div>
        <h1 className="page-heading">Speak more. Worry less.</h1>
        <p className="page-lede">把英语放进真实交流里。AI 会先理解你想说什么，再帮你把表达变得更自然，并把值得复习的内容留下来。</p>

        <div className="grid-main">
          <section className="panel">
            <div className="panel-head panel-head-wrap">
              <div>
                <div className="panel-title">{conversation?.title || "新对话"}</div>
                <div className="panel-subtitle">文字 / 语音输入 · 英语纠错 · 长期学习记录</div>
              </div>
              <div className="panel-actions">
                <select
                  aria-label="选择对话"
                  className="conversation-select"
                  value={conversation?.id ?? ""}
                  onChange={(e) => void switchConversation(e.target.value)}
                  disabled={busy}
                >
                  <option value="">新对话</option>
                  {conversations.map((item) => <option value={item.id} key={item.id}>{item.title || "未命名对话"}</option>)}
                </select>
                <button className="btn btn-small" type="button" onClick={() => void switchConversation("")} disabled={busy}>
                  <Plus size={14} />
                  新对话
                </button>
              </div>
            </div>

            <CoachStage state={coachState} />

            <div className="chat-list">
              {messages.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon"><Bot size={30} /></div>
                  <strong className="empty-title">Hi! What would you like to talk about today?</strong>
                  <br />
                  直接在下面输入英文，或点麦克风说完自动发送。
                  <br />
                  试试：<code>I want to practice English for work.</code>
                </div>
              )}
              {messages.map((message) => (
                <div className={`chat-row ${message.role}`} key={message.id}>
                  <div className="avatar">{message.role === "user" ? "You" : <Bot size={17} />}</div>
                  <div className="message-body">
                    <div className="bubble">
                      {message.content}
                      {message.role === "assistant" && (
                        <button className="speak-inline" type="button" aria-label="朗读这条回答" onClick={() => speakWithState(message.content)}>
                          <Volume2 size={12} />
                        </button>
                      )}
                    </div>
                    {message.metadata?.correction && <CorrectionCard correction={message.metadata.correction} />}
                    {message.metadata?.vocabulary && <VocabularyChips items={message.metadata.vocabulary} />}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="chat-row">
                  <div className="avatar"><Bot size={17} /></div>
                  <div className="bubble">正在组织回答…</div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="chat-composer">
              <form onSubmit={sendMessage}>
                <div className="composer-row">
                  <textarea
                    className="textarea"
                    aria-label="输入英文"
                    placeholder="Type in English…  用英语说说你今天想聊什么"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submitMessage(text);
                      }
                    }}
                    rows={1}
                  />
                  <button type="submit" className="btn btn-primary btn-icon" aria-label="发送" disabled={busy || !text.trim()}>
                    <Send size={17} />
                  </button>
                </div>
              </form>
              <div className="composer-actions">
                <span className="inline-muted">Enter 发送 · Shift+Enter 换行</span>
                <div className="composer-buttons">
                  <button
                    className={`btn ${voiceListening ? "btn-danger" : ""}`}
                    type="button"
                    onClick={voiceListening ? stopListening : startListening}
                    disabled={busy || !voiceSupported}
                    title={voiceSupported ? "浏览器语音输入" : "当前浏览器不支持语音识别"}
                  >
                    {voiceListening ? <MicOff size={16} /> : <Mic size={16} />}
                    {voiceListening ? "停止" : "语音输入"}
                  </button>
                </div>
              </div>
              {error && <div className="error-text">{error}</div>}
            </div>
          </section>

          <aside className="side-stack">
            <section className="side-card">
              <h3><BookOpen size={15} /> 我的学习档案</h3>
              <label className="field-label" htmlFor="level">英语水平</label>
              <select id="level" className="field" value={profile.level} onChange={(e) => setProfile({ ...profile, level: e.target.value })}>
                <option value="A1">A1 · 入门</option>
                <option value="A2">A2 · 初级</option>
                <option value="B1">B1 · 中级</option>
                <option value="B2">B2 · 中高级</option>
                <option value="C1">C1 · 高级</option>
                <option value="C2">C2 · 熟练</option>
              </select>
              <label className="field-label" htmlFor="goals">学习目标</label>
              <textarea id="goals" className="field" rows={2} value={profile.goals} onChange={(e) => setProfile({ ...profile, goals: e.target.value })} />
              <label className="field-label" htmlFor="preferences">交流偏好</label>
              <textarea id="preferences" className="field" rows={2} value={profile.preferences} onChange={(e) => setProfile({ ...profile, preferences: e.target.value })} />
              <button className="btn" style={{ width: "100%" }} onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? "保存中…" : "保存学习档案"}
              </button>
            </section>

            <section className="side-card">
              <h3><Mic size={15} /> 语音输入</h3>
              <label className="check-row">
                <input type="checkbox" checked={autoRead} onChange={(e) => updateAutoRead(e.target.checked)} />
                AI 回复后自动朗读
              </label>
              <p className="inline-muted" style={{ margin: "8px 0 0" }}>
                使用浏览器语音识别，不是 WebRTC。说完会自动发送。Chrome 若提示网络错误，请改用 Microsoft Edge，或直接输入文字。
              </p>
              {!voiceSupported && <p className="error-text">当前浏览器不支持语音识别。</p>}
            </section>

            <section className="side-card">
              <h3><Sparkles size={15} /> 学习状态</h3>
              <div className="mini-stat"><span>待复习</span><strong>{stats.due}</strong></div>
              <div className="mini-stat"><span>今天已复习</span><strong>{stats.reviewedToday}</strong></div>
              <div className="mini-stat"><span>错题总数</span><strong>{stats.corrections}</strong></div>
              <div className="mini-stat"><span>个人词汇</span><strong>{stats.vocabulary}</strong></div>
              <Link className="btn btn-primary review-cta" href="/review">开始今日复习</Link>
            </section>

            <section className="side-card">
              <h3><Volume2 size={15} /> 练习建议</h3>
              <p className="record-body" style={{ margin: 0 }}>
                先说完整意思，不用追求每句话都完美。AI 会先回应你的意思，再帮你把表达变得更自然。语音识别不准时，可以直接改用文字；所有学习记录都会保存。
              </p>
            </section>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}