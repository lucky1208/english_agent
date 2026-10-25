"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearCachedSession } from "@/lib/supabase/session";

type MemoryItem = { id: string; content: string; memoryType: string; createdAt: number | null };
type MemoryData = { configured: boolean; memories: MemoryItem[]; total: number; error?: string };

export default function SettingsPage() {
  const router = useRouter();
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [loadingMemory, setLoadingMemory] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadMemory = useCallback(async () => {
    setLoadingMemory(true);
    setError("");
    try {
      const response = await fetch("/api/memory", { cache: "no-store" });
      const data = (await response.json()) as MemoryData;
      if (!response.ok) throw new Error(data.error || "读取长期记忆失败");
      setMemory(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取长期记忆失败");
    } finally {
      setLoadingMemory(false);
    }
  }, []);

  useEffect(() => { void loadMemory(); }, [loadMemory]);

  async function deleteMemory(id: string) {
    if (!window.confirm("确定删除这条长期记忆吗？此操作不可恢复。")) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "删除记忆失败");
      setMessage("长期记忆已删除。");
      await loadMemory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除记忆失败");
    }
  }

  async function deleteAccount() {
    if (confirmText !== "DELETE") {
      setError("请输入 DELETE 以确认删除。");
      return;
    }
    if (!window.confirm("这会删除你的学习档案、对话、错题、词汇、复习记录和长期记忆。确定继续吗？")) return;
    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const data = (await response.json()) as { error?: string; authDeleted?: boolean; note?: string; deletedMemories?: number };
      if (!response.ok && !data.note) throw new Error(data.error || "删除失败");
      if (data.note) {
        setMessage(data.note);
      } else {
        setMessage(`账户与学习数据已删除${data.deletedMemories ? `，并清理了 ${data.deletedMemories} 条长期记忆` : ""}。`);
      }
      if (data.authDeleted) {
        clearCachedSession();
        try {
          const supabase = createSupabaseBrowserClient();
          await supabase.auth.signOut();
        } catch {
          // The session is already invalid after server-side account deletion.
        }
        router.replace("/");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell title="设置与数据">
      <main className="main-content">
        <div className="eyebrow">YOUR DATA, YOUR CONTROL</div>
        <h1 className="page-heading">管理你的学习数据。</h1>
        <p className="page-lede">学习档案、对话、错题、词汇和复习记录保存在你的 Supabase 项目中。百炼长期记忆是可选语义层，可以单独查看和删除。</p>

        {error && <p className="error-text">{error}</p>}
        {message && <p className="success-text">{message}</p>}

        <div className="settings-grid">
          <section className="panel settings-card">
            <h2><Download size={17} /> 导出学习数据</h2>
            <p className="record-body">下载 JSON 备份，包含档案、会话、消息、错题、词汇、复习记录和长期记忆引用。原始音频不会被保存或导出。</p>
            <a className="btn btn-primary" href="/api/account/export">
              <Download size={15} />
              下载 JSON
            </a>
          </section>

          <section className="panel settings-card">
            <h2><ShieldCheck size={17} /> 隐私控制</h2>
            <p className="record-body">语音通过浏览器 WebRTC 实时发送给阿里云百炼处理，应用默认只保存转写文本。你可以随时删除单条长期记忆或全部学习数据。</p>
            <div className="settings-links">
              <Link className="btn" href="/privacy">隐私政策</Link>
              <Link className="btn" href="/terms">服务条款</Link>
            </div>
          </section>
        </div>

        <section className="panel settings-card settings-memory">
          <h2>百炼长期记忆</h2>
          {loadingMemory && <p className="record-body">正在读取…</p>}
          {!loadingMemory && memory && !memory.configured && (
            <p className="record-body">尚未配置百炼长期记忆 API。当前学习档案、错题、词汇和复习计划仍然保存在 Supabase 中，不影响使用。</p>
          )}
          {!loadingMemory && memory?.configured && memory.memories.length === 0 && (
            <p className="record-body">还没有提取出长期记忆。完成几轮对话后，百炼会逐步整理出可检索的事实记忆。</p>
          )}
          {!loadingMemory && memory?.configured && memory.memories.length > 0 && (
            <>
              <p className="inline-muted">共 {memory.total} 条，当前显示最近 {memory.memories.length} 条。</p>
              <div className="memory-list">
                {memory.memories.map((item) => (
                  <article className="memory-item" key={item.id}>
                    <div>
                      <div className="record-body">{item.content}</div>
                      <div className="inline-muted" style={{ marginTop: 6 }}>
                        {item.memoryType}{item.createdAt ? ` · ${new Date(item.createdAt * 1000).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                    <button className="btn btn-small btn-danger" type="button" onClick={() => void deleteMemory(item.id)}>
                      <Trash2 size={14} />
                      删除
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="panel settings-card settings-danger">
          <h2>删除账户与学习数据</h2>
          <p className="record-body">此操作不可恢复。会删除学习档案、会话、消息、错题、词汇、复习记录和百炼长期记忆。若配置了服务端服务角色密钥，登录账户也会一并删除。</p>
          <label className="field-label" htmlFor="confirmDelete">输入 DELETE 确认</label>
          <input id="confirmDelete" className="field" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" autoComplete="off" />
          <button className="btn btn-danger" type="button" onClick={() => void deleteAccount()} disabled={deleting || confirmText !== "DELETE"}>
            <Trash2 size={15} />
            {deleting ? "正在删除…" : "删除账户与全部数据"}
          </button>
        </section>
      </main>
    </AppShell>
  );
}