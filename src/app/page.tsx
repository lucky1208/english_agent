"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Bot, History, Mic, MicOff, PhoneOff, Plus, Send, Settings, Sparkles, Trash2, Volume2, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
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

type Conversation = { id: string; title: string; mode: string; created_at?: string; updated_at?: string };
type Profile = { level: string; goals: string; preferences: string; display_name?: string };
type Stats = { corrections: number; vocabulary: number; due: number; reviewedToday: number };

type RealtimeEvent = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function waitForIceComplete(pc: RTCPeerConnection, timeoutMs = 15_000) {
  return new Promise<void>((resolve, reject) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const timeout = window.setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", check);
      reject(new Error("ICE 收集超时，请检查网络后重试。"));
    }, timeoutMs);
    function check() {
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(timeout);
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [pauseMs, setPauseMs] = useState(4000);
  const endRef = useRef<HTMLDivElement>(null);

  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceStarting, setVoiceStarting] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("语音待开始");
  const [micMuted, setMicMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [liveUser, setLiveUser] = useState("");
  const [liveAssistant, setLiveAssistant] = useState("");
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelsRef = useRef<Set<RTCDataChannel>>(new Set());
  const eventChannelRef = useRef<RTCDataChannel | null>(null);
  const instructionsRef = useRef("");
  const realtimeVoiceRef = useRef("longanqian_v3.1");
  const savedVoiceKeys = useRef<Set<string>>(new Set());
  const sessionCreatedRef = useRef(false);
  const sessionUpdateSentRef = useRef(false);
  const sessionReadyRef = useRef(false);
  const voiceSessionIdRef = useRef(0);
  const liveAssistantRef = useRef("");

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

  const stopVoice = useCallback(() => {
    voiceSessionIdRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    channelsRef.current.forEach((channel) => {
      try { channel.close(); } catch { /* already closed */ }
    });
    channelsRef.current.clear();
    pcRef.current?.close();
    pcRef.current = null;
    eventChannelRef.current = null;
    sessionCreatedRef.current = false;
    sessionUpdateSentRef.current = false;
    sessionReadyRef.current = false;
    liveAssistantRef.current = "";
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setVoiceActive(false);
    setVoiceStarting(false);
    setMicMuted(false);
    setAudioBlocked(false);
    setLiveUser("");
    setLiveAssistant("");
    setVoiceStatus("语音已结束");
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
  }, [messages, liveUser, liveAssistant]);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem("english-mate-pause-ms"));
      if (Number.isFinite(stored) && stored >= 1000 && stored <= 4000) setPauseMs(stored);
    } catch {
      // Keep the default.
    }
  }, []);

  useEffect(() => () => stopVoice(), [stopVoice]);

  function updatePauseMs(value: number) {
    const next = Math.min(4000, Math.max(1000, value));
    setPauseMs(next);
    try {
      window.localStorage.setItem("english-mate-pause-ms", String(next));
    } catch {
      // Storage may be unavailable in private mode.
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: profile.display_name ?? "", level: profile.level, goals: profile.goals, preferences: profile.preferences }),
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
    if (voiceActive || voiceStarting) stopVoice();
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

  async function deleteConversation(id: string) {
    if (!window.confirm("确定删除这条对话及其消息、错题和摘要吗？此操作不可恢复。")) return;
    setDeletingId(id);
    setError("");
    try {
      const response = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "删除对话失败");
      const remaining = conversations.filter((item) => item.id !== id);
      setConversations(remaining);
      if (conversation?.id === id) {
        if (voiceActive || voiceStarting) stopVoice();
        const next = remaining[0] ?? null;
        setConversation(next);
        conversationIdRef.current = next?.id ?? null;
        if (next) await loadMessages(next.id);
        else setMessages([]);
      }
      void loadSideData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除对话失败");
    } finally {
      setDeletingId("");
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = text.trim();
    if (!content || busy || voiceStarting) return;
    setText("");
    setError("");
    setBusy(true);
    const tempId = crypto.randomUUID();
    setMessages((current) => [...current, { id: tempId, role: "user", content }]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation?.id, message: content }),
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
          title: data.conversation.title || conversation?.title || content.slice(0, 50),
          mode: data.conversation.mode || "text",
        };
        setConversation(nextConversation);
        conversationIdRef.current = nextConversation.id;
        setConversations((current) => [nextConversation, ...current.filter((item) => item.id !== nextConversation.id)]);
      }
      setMessages((current) => [
        ...current.filter((message) => message.id !== tempId),
        ...(data.userMessage ? [data.userMessage] : [{ id: crypto.randomUUID(), role: "user" as const, content }]),
        ...(data.assistantMessage
          ? [data.assistantMessage]
          : data.result
            ? [{ id: crypto.randomUUID(), role: "assistant" as const, content: data.result.reply, metadata: { correction: data.result.correction, vocabulary: data.result.vocabulary } }]
            : []),
      ]);
      void loadSideData();
    } catch (e) {
      setMessages((current) => current.filter((message) => message.id !== tempId));
      setText(content);
      setError(e instanceof Error ? e.message : "发送失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  const saveVoiceTurn = useCallback(async (role: "user" | "assistant", content: string, key: string, clientTurnId: string) => {
    const conversationId = conversationIdRef.current;
    if (!content.trim() || savedVoiceKeys.current.has(key) || !conversationId) return;
    savedVoiceKeys.current.add(key);
    setMessages((current) => (current.some((message) => message.id === key) ? current : [...current, { id: key, role, content }]));
    try {
      const response = await fetch("/api/voice/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, role, content: content.slice(0, 3000), clientTurnId: `${role}:${clientTurnId}`.slice(0, 200) }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "语音转写已显示，但保存失败。");
      }
    } catch {
      setError("语音转写已显示，但保存失败。请检查网络。");
    }
  }, []);

  async function startVoice() {
    if (voiceActive || voiceStarting) return;
    const sessionId = voiceSessionIdRef.current + 1;
    voiceSessionIdRef.current = sessionId;
    const isCurrent = () => voiceSessionIdRef.current === sessionId;
    setVoiceStarting(true);
    setVoiceStatus("正在请求麦克风权限…");
    setError("");
    setLiveUser("");
    setLiveAssistant("");
    setAudioBlocked(false);
    liveAssistantRef.current = "";
    savedVoiceKeys.current.clear();
    sessionCreatedRef.current = false;
    sessionUpdateSentRef.current = false;
    sessionReadyRef.current = false;

    try {
      let currentConversation = conversation;
      if (!currentConversation) {
        const created = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Voice practice", mode: "voice" }),
        });
        if (!created.ok) throw new Error("无法创建语音会话");
        currentConversation = ((await created.json()) as { conversation: Conversation }).conversation;
        setConversation(currentConversation);
        conversationIdRef.current = currentConversation.id;
        setConversations((current) => [currentConversation as Conversation, ...current.filter((item) => item.id !== currentConversation?.id)]);
        setMessages([]);
      }
      if (!isCurrent()) return;
      conversationIdRef.current = currentConversation.id;

      const contextResponse = await fetch("/api/voice/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: currentConversation.id }),
      });
      const contextData = (await contextResponse.json()) as { instructions?: string; voice?: string; error?: string };
      if (!contextResponse.ok) throw new Error(contextData.error || "无法读取学习档案");
      instructionsRef.current = contextData.instructions || "You are a friendly English conversation tutor.";
      realtimeVoiceRef.current = contextData.voice || "longanqian_v3.1";
      if (!isCurrent()) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (!isCurrent()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const sender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;

      const tryInitialize = () => {
        if (!isCurrent() || sessionUpdateSentRef.current || !sessionCreatedRef.current) return;
        const channel = eventChannelRef.current;
        if (!channel || channel.readyState !== "open" || pc.connectionState !== "connected") return;
        sessionUpdateSentRef.current = true;
        channel.send(JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            voice: realtimeVoiceRef.current,
            instructions: instructionsRef.current,
            input_audio_format: "pcm",
            output_audio_format: "pcm",
            input_audio_transcription: { language: "en" },
            output_audio: { language: "en" },
            max_history_turns: 20,
            turn_detection: { type: "server_vad", threshold: 0.55, silence_duration_ms: Math.min(4000, Math.max(1000, pauseMs)) },
          },
        }));
        setVoiceStatus("会话已创建，正在初始化英语教练…");
      };

      const bindChannel = (channel: RTCDataChannel) => {
        channelsRef.current.add(channel);
        channel.onopen = () => {
          if (!isCurrent()) return;
          setVoiceStatus("数据通道已连接，等待模型就绪…");
          tryInitialize();
        };
        channel.onmessage = (messageEvent) => {
          if (!isCurrent()) return;
          let realtimeEvent: RealtimeEvent;
          try {
            realtimeEvent = JSON.parse(String(messageEvent.data)) as RealtimeEvent;
          } catch {
            return;
          }
          const type = typeof realtimeEvent.type === "string" ? realtimeEvent.type : "";

          if (type === "session.created") {
            sessionCreatedRef.current = true;
            eventChannelRef.current = channel;
            tryInitialize();
            return;
          }

          if (type === "session.updated") {
            if (sessionReadyRef.current) return;
            sessionReadyRef.current = true;
            const localTrack = stream.getAudioTracks()[0];
            if (!localTrack) {
              setError("没有可用的麦克风轨道。");
              setVoiceStatus("麦克风不可用");
              stopVoice();
              return;
            }
            void sender.replaceTrack(localTrack).then(() => {
              if (!isCurrent()) return;
              setVoiceActive(true);
              setVoiceStarting(false);
              setVoiceStatus("正在实时对话 · 直接说英语即可");
            }).catch((replaceError: unknown) => {
              if (!isCurrent()) return;
              setError(replaceError instanceof Error ? replaceError.message : "无法开启麦克风上行。");
              stopVoice();
            });
            return;
          }

          if (type === "input_audio_buffer.speech_started") {
            setVoiceStatus("正在聆听…");
            setLiveUser("");
            return;
          }

          if (type === "input_audio_buffer.speech_stopped") {
            setVoiceStatus("已听到，正在理解…");
            return;
          }

          if (type === "conversation.item.input_audio_transcription.delta") {
            const confirmed = typeof realtimeEvent.text === "string" ? realtimeEvent.text : "";
            const pending = typeof realtimeEvent.stash === "string" ? realtimeEvent.stash : "";
            setLiveUser(`${confirmed}${pending}`);
            return;
          }

          if (type === "conversation.item.input_audio_transcription.completed") {
            const transcript = typeof realtimeEvent.transcript === "string" ? realtimeEvent.transcript : "";
            const itemId = typeof realtimeEvent.item_id === "string" ? realtimeEvent.item_id : crypto.randomUUID();
            setLiveUser("");
            void saveVoiceTurn("user", transcript, `voice-user-${itemId}`, itemId);
            return;
          }

          if (type === "conversation.item.input_audio_transcription.failed") {
            setError("这次语音识别失败，请再说一遍。");
            return;
          }

          if (type === "response.created") {
            setVoiceStatus("AI 正在回答…");
            setLiveAssistant("");
            liveAssistantRef.current = "";
            return;
          }

          if (type === "response.audio_transcript.delta" || type === "response.text.delta") {
            const delta = typeof realtimeEvent.delta === "string" ? realtimeEvent.delta : "";
            if (!delta) return;
            const next = `${liveAssistantRef.current}${delta}`;
            liveAssistantRef.current = next;
            setLiveAssistant(next);
            return;
          }

          if (type === "response.audio_transcript.done" || type === "response.text.done") {
            const transcript = typeof realtimeEvent.transcript === "string"
              ? realtimeEvent.transcript
              : typeof realtimeEvent.text === "string"
                ? realtimeEvent.text
                : liveAssistantRef.current;
            const itemId = typeof realtimeEvent.item_id === "string" ? realtimeEvent.item_id : crypto.randomUUID();
            if (transcript.trim()) void saveVoiceTurn("assistant", transcript, `voice-assistant-${itemId}`, itemId);
            liveAssistantRef.current = "";
            setLiveAssistant("");
            return;
          }

          if (type === "response.done") {
            const responseObject = isRecord(realtimeEvent.response) ? realtimeEvent.response : null;
            const status = responseObject && typeof responseObject.status === "string" ? responseObject.status : "";
            const output = responseObject && Array.isArray(responseObject.output) ? responseObject.output : [];
            if (status !== "cancelled") {
              for (const item of output) {
                if (!isRecord(item)) continue;
                const itemId = typeof item.id === "string" ? item.id : crypto.randomUUID();
                const content = Array.isArray(item.content) ? item.content : [];
                const transcript = content
                  .filter(isRecord)
                  .map((part) => (typeof part.transcript === "string" ? part.transcript : typeof part.text === "string" ? part.text : ""))
                  .find((value) => value.trim());
                if (transcript) void saveVoiceTurn("assistant", transcript, `voice-assistant-${itemId}`, itemId);
              }
            }
            if (status === "cancelled") {
              liveAssistantRef.current = "";
              setLiveAssistant("");
            }
            setVoiceStatus("正在聆听… 你可以继续说");
            return;
          }

          if (type === "error") {
            const errorObject = isRecord(realtimeEvent.error) ? realtimeEvent.error : null;
            const message = errorObject && typeof errorObject.message === "string" ? errorObject.message : "实时语音模型返回错误。";
            const errorType = errorObject && typeof errorObject.type === "string" ? errorObject.type : "";
            setError(message);
            if (errorType === "server_error") setVoiceStatus("语音连接发生错误");
            return;
          }
        };
        channel.onclose = () => {
          channelsRef.current.delete(channel);
          if (eventChannelRef.current === channel) eventChannelRef.current = null;
        };
      };

      pc.ondatachannel = (event) => bindChannel(event.channel);
      bindChannel(pc.createDataChannel("oai-events"));

      pc.ontrack = (event) => {
        if (!isCurrent()) return;
        const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          void remoteAudioRef.current.play()
            .then(() => setAudioBlocked(false))
            .catch(() => {
              setAudioBlocked(true);
              setVoiceStatus("浏览器阻止了自动播放，请点击播放按钮允许声音。");
            });
        }
      };

      pc.onconnectionstatechange = () => {
        if (!isCurrent()) return;
        if (pc.connectionState === "connected") {
          setVoiceStatus("连接已建立，正在初始化模型…");
          tryInitialize();
        } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
          setError("语音连接中断，请重新开始。");
          stopVoice();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceComplete(pc);
      if (!isCurrent()) return;
      setVoiceStatus("正在与百炼建立 WebRTC 连接…");
      const response = await fetch("/api/voice/sdp", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription?.sdp || "",
      });
      if (!isCurrent()) return;
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `SDP 协商失败（HTTP ${response.status}）。`);
      }
      const answerSdp = await response.text();
      if (!isCurrent()) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      if (!isCurrent()) return;
      setVoiceStatus("正在连接百炼实时语音模型…");
      window.setTimeout(() => {
        if (!isCurrent() || sessionReadyRef.current) return;
        setError("实时语音初始化超时，请检查模型权限和网络后重试。");
        stopVoice();
        setVoiceStatus("语音初始化超时");
      }, 30_000);
    } catch (e) {
      if (!isCurrent()) return;
      stopVoice();
      setError(e instanceof Error ? e.message : "无法启动实时语音。");
      setVoiceStatus("语音连接失败");
    }
  }

  function toggleMute() {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicMuted(!track.enabled);
    setVoiceStatus(track.enabled ? "正在实时对话 · 麦克风已开启" : "麦克风已静音，AI 仍会继续说完");
  }

  return (
    <AppShell title="英语对话">
      <main className="main-content chat-page">
        <div className="chat-only">
          <section className="panel">
            <div className="panel-head panel-head-wrap">
              <div>
                <div className="panel-title">{conversation?.title || "新对话"}</div>
                <div className="panel-subtitle">英语纠错 · 学习记录</div>
              </div>
              <div className="panel-actions">
                <button className="btn btn-small" type="button" onClick={() => void switchConversation("")} disabled={busy || voiceStarting || voiceActive}>
                  <Plus size={14} />
                  新对话
                </button>
                <button className="btn btn-icon" type="button" aria-label="历史对话" title="历史对话" onClick={() => setHistoryOpen(true)}>
                  <History size={17} />
                </button>
                <button className="btn btn-icon" type="button" aria-label="打开设置" title="设置" onClick={() => setSettingsOpen(true)}>
                  <Settings size={17} />
                </button>
              </div>
            </div>

            <div className="chat-list">
              {messages.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon"><Bot size={30} /></div>
                  <strong className="empty-title">Start with a simple sentence.</strong>
                  <br />
                  输入英文，或点麦克风直接说话。
                </div>
              )}
              {messages.map((message) => (
                <div className={`chat-row ${message.role}`} key={message.id}>
                  <div className="avatar">{message.role === "user" ? "You" : <Bot size={17} />}</div>
                  <div className="message-body">
                    <div className="bubble">{message.content}</div>
                    {message.role === "assistant" && (
                      <button className="btn btn-small speak-message" type="button" aria-label="朗读这条回答" onClick={() => speak(message.content)}>
                        <Volume2 size={14} />
                        发音
                      </button>
                    )}
                    {message.metadata?.correction && <CorrectionCard correction={message.metadata.correction} />}
                    {message.metadata?.vocabulary && <VocabularyChips items={message.metadata.vocabulary} />}
                  </div>
                </div>
              ))}
              {liveUser && (
                <div className="chat-row user live-row">
                  <div className="avatar">You</div>
                  <div className="bubble live-bubble">{liveUser}<span className="typing-dots" /></div>
                </div>
              )}
              {liveAssistant && (
                <div className="chat-row live-row">
                  <div className="avatar"><Bot size={17} /></div>
                  <div className="bubble live-bubble">{liveAssistant}<span className="typing-dots" /></div>
                </div>
              )}
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
                    placeholder="Type in English…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage(e as unknown as FormEvent);
                      }
                    }}
                    rows={1}
                  />
                  <button type="submit" className="btn btn-primary btn-icon" aria-label="发送" disabled={busy || voiceStarting || !text.trim()}>
                    <Send size={17} />
                  </button>
                </div>
              </form>
              <div className="voice-status">
                <span className={`dot ${voiceActive ? "live" : ""}`} />
                {voiceStatus}
              </div>
              <div className="composer-actions">
                <div className="composer-buttons">
                  {audioBlocked && (
                    <button
                      className="btn btn-small"
                      type="button"
                      onClick={() => {
                        void remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setError("仍无法播放音频，请检查浏览器权限。"));
                      }}
                    >
                      <Volume2 size={15} />
                      播放 AI 声音
                    </button>
                  )}
                  {voiceActive && (
                    <button className="btn btn-small" type="button" onClick={toggleMute}>
                      {micMuted ? <MicOff size={15} /> : <Mic size={15} />}
                      {micMuted ? "取消静音" : "静音"}
                    </button>
                  )}
                  <button
                    className={`btn ${voiceActive || voiceStarting ? "btn-danger" : ""}`}
                    type="button"
                    onClick={() => {
                      if (voiceActive || voiceStarting) {
                        stopVoice();
                        window.setTimeout(() => { void loadSideData(); }, 2500);
                      } else {
                        void startVoice();
                      }
                    }}
                  >
                    {voiceActive || voiceStarting ? <PhoneOff size={16} /> : <Mic size={16} />}
                    {voiceStarting ? "取消连接" : voiceActive ? "结束语音" : "实时语音对话"}
                  </button>
                </div>
              </div>
              {error && <div className="error-text">{error}</div>}
              <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />
            </div>
          </section>
        </div>

        {settingsOpen && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSettingsOpen(false);
            }}
          >
            <div className="modal-card" role="dialog" aria-modal="true" aria-label="设置">
              <div className="modal-head">
                <div className="modal-title">设置</div>
                <button className="btn btn-icon" type="button" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}>
                  <X size={17} />
                </button>
              </div>

              <section className="modal-section">
                <h3>语音停顿</h3>
                <p className="inline-muted">AI 等你停顿多久后接话。修改后重新开始语音生效。</p>
                <input
                  type="range"
                  className="range"
                  min={1000}
                  max={4000}
                  step={500}
                  value={pauseMs}
                  onChange={(e) => updatePauseMs(Number(e.target.value))}
                  aria-label="语音停顿时间"
                />
                <div className="pause-row">
                  <span>1 秒</span>
                  <strong className="pause-value">{(pauseMs / 1000).toFixed(1)} 秒</strong>
                  <span>4 秒</span>
                </div>
              </section>

              <section className="modal-section">
                <h3><BookOpen size={14} /> 学习档案</h3>
                <label className="field-label" htmlFor="displayName">你的名字</label>
                <input
                  id="displayName"
                  className="field"
                  value={profile.display_name ?? ""}
                  onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                  placeholder="AI 会这样称呼你"
                  maxLength={60}
                />
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
                <button className="btn btn-primary" onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile ? "保存中…" : "保存学习档案"}
                </button>
              </section>

              <section className="modal-section">
                <h3><Sparkles size={14} /> 学习状态</h3>
                <div className="modal-stats">
                  <div><strong>{stats.due}</strong><span>待复习</span></div>
                  <div><strong>{stats.corrections}</strong><span>错题</span></div>
                  <div><strong>{stats.vocabulary}</strong><span>词汇</span></div>
                </div>
                <div className="modal-actions">
                  <Link className="btn" href="/review">今日复习</Link>
                  <Link className="btn" href="/progress">学习进度</Link>
                  <Link className="btn" href="/settings">数据与账户</Link>
                </div>
              </section>
            </div>
          </div>
        )}

        {historyOpen && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setHistoryOpen(false);
            }}
          >
            <div className="modal-card" role="dialog" aria-modal="true" aria-label="历史对话">
              <div className="modal-head">
                <div className="modal-title">历史对话</div>
                <button className="btn btn-icon" type="button" aria-label="关闭历史对话" onClick={() => setHistoryOpen(false)}>
                  <X size={17} />
                </button>
              </div>

              {conversations.length === 0 ? (
                <p className="inline-muted">还没有历史对话。</p>
              ) : (
                <div className="history-list">
                  {conversations.map((item) => {
                    const date = item.updated_at || item.created_at;
                    return (
                      <div className={`history-item ${item.id === conversation?.id ? "active" : ""}`} key={item.id}>
                        <button
                          className="history-main"
                          type="button"
                          onClick={() => {
                            setHistoryOpen(false);
                            void switchConversation(item.id);
                          }}
                        >
                          <span className="history-title">{item.title || "未命名对话"}</span>
                          <span className="history-meta">
                            {item.mode === "voice" ? "语音" : "文字"}
                            {date ? ` · ${new Date(date).toLocaleDateString()}` : ""}
                          </span>
                        </button>
                        <button
                          className="btn btn-small btn-danger"
                          type="button"
                          aria-label={`删除 ${item.title || "对话"}`}
                          disabled={deletingId === item.id}
                          onClick={() => void deleteConversation(item.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {error && <div className="error-text">{error}</div>}
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}