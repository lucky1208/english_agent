"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sprout } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (mode === "signup") {
        const result = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
        if (result.error) throw result.error;
        if (!result.data.session) setMessage("注册成功。请按邮件提示确认邮箱后登录。若未收到邮件，请检查垃圾邮件和 Supabase 邮件配置。");
        else router.replace("/");
      } else {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        router.replace("/"); router.refresh();
      }
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败，请检查配置后重试。"); }
    finally { setBusy(false); }
  }

  return <main className="auth-wrap"><section className="auth-card">
    <div className="brand" style={{ padding: 0 }}><span className="brand-mark"><Sprout size={18}/></span><span>English Mate</span></div>
    <div className="eyebrow" style={{ marginTop: 30 }}>YOUR PERSONAL ENGLISH COACH</div>
    <h1 className="page-heading" style={{ fontSize: 29 }}>{mode === "signin" ? "让英语自然发生。" : "开启你的英语旅程。"}</h1>
    <p className="page-lede" style={{ marginBottom: 24 }}>和 AI 自然对话，记录每一次进步。</p>
    <form onSubmit={submit}>
      {mode === "signup" && <><label className="field-label" htmlFor="displayName">怎么称呼你？</label><input className="field" id="displayName" autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="昵称（可选）"/></>}
      <label className="field-label" htmlFor="email">邮箱</label><input className="field" id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/>
      <label className="field-label" htmlFor="password">密码</label><input className="field" id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位"/>
      <button className="btn btn-primary" style={{ width: "100%", marginTop: 4 }} disabled={busy}>{busy ? "请稍候…" : mode === "signin" ? "登录" : "创建账户"}<ArrowRight size={15}/></button>
    </form>
    {error && <p className="error-text">{error}</p>}{message && <p className="success-text">{message}</p>}
    <p className="inline-muted" style={{ marginTop: 20 }}>{mode === "signin" ? "还没有账户？" : "已经有账户？"} <button className="btn" style={{ border: 0, padding: "4px 6px", color: "var(--accent)" }} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>{mode === "signin" ? "免费注册" : "返回登录"}</button></p>
    <p className="inline-muted" style={{ marginTop: 12 }}>
      继续使用代表你同意 <Link href="/terms" style={{ color: "var(--accent)" }}>服务条款</Link> 与 <Link href="/privacy" style={{ color: "var(--accent)" }}>隐私政策</Link>。
    </p>
    <div style={{ marginTop: 20 }}><Link href="/" className="inline-muted">返回首页</Link></div>
  </section></main>;
}