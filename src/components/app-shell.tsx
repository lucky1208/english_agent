"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookMarked, BookOpen, MessageCircle, RefreshCcw, Settings, Sprout } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ACCESS_CODE_STORAGE_KEY,
  AccessCodeRequiredError,
  ensureSession,
  sessionAuthErrorMessage,
} from "@/lib/supabase/session";

const nav = [
  { href: "/", label: "练习对话", icon: MessageCircle },
  { href: "/review", label: "今日复习", icon: RefreshCcw },
  { href: "/mistakes", label: "错题本", icon: BookMarked },
  { href: "/vocabulary", label: "词汇本", icon: BookOpen },
  { href: "/progress", label: "学习进度", icon: BarChart3 },
  { href: "/settings", label: "设置与数据", icon: Settings },
];

export function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  const path = usePathname();
  const [userLabel, setUserLabel] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [codeRequired, setCodeRequired] = useState(false);
  const [accessCode, setAccessCode] = useState("");

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const supabase = createSupabaseBrowserClient();
      ensureSession(supabase)
        .then((user) => {
          setUserLabel(user.label);
          setAuthError("");
          setCodeRequired(false);
        })
        .catch((error) => {
          if (error instanceof AccessCodeRequiredError) setCodeRequired(true);
          setAuthError(sessionAuthErrorMessage(error));
        })
        .finally(() => {
          setAuthReady(true);
        });

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUserLabel(session.user.is_anonymous ? "游客模式" : session.user.email ?? "已登录");
          setAuthError("");
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch (error) {
      setAuthError(sessionAuthErrorMessage(error));
      setAuthReady(true);
    }
    return () => unsubscribe?.();
  }, []);

  function submitAccessCode(event: FormEvent) {
    event.preventDefault();
    const code = accessCode.trim();
    if (!code) return;
    window.sessionStorage.setItem(ACCESS_CODE_STORAGE_KEY, code);
    window.location.reload();
  }

  if (!authReady || !userLabel) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="brand"><span className="brand-mark"><Sprout size={18} /></span><span>English Mate</span></div>
          <p className="page-lede" style={{ marginTop: 20 }}>
            {authError || (codeRequired ? "请输入访问码。" : "正在创建登录会话…")}
          </p>
          {codeRequired ? (
            <form onSubmit={submitAccessCode}>
              <label className="field-label" htmlFor="accessCode">访问码</label>
              <input
                id="accessCode"
                className="field"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="输入固定账户访问码"
              />
              <button className="btn btn-primary" type="submit" disabled={!accessCode.trim()}>进入</button>
            </form>
          ) : (
            <>
              <p className="inline-muted" style={{ marginTop: 12 }}>
                固定账户会自动登录；未配置固定账户时回退到 Supabase 匿名游客。请在 Vercel 配置 Supabase URL、anon key，并在 Supabase 开启 Anonymous Sign-Ins。
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <a className="btn btn-primary" href="/api/health" target="_blank" rel="noreferrer">检查配置状态</a>
                <Link className="btn" href="/privacy">隐私政策</Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark"><Sprout size={18} /></span><span className="brand-text">English Mate</span></Link>
      <div style={{ width: "100%" }}>{nav.map((item) => { const Icon = item.icon; const active = path === item.href; return <Link className={`nav-link ${active ? "active" : ""}`} key={item.href} href={item.href} title={item.label}><Icon size={18}/><span className="nav-text">{item.label}</span></Link>; })}</div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div className="topbar-title">{title}</div></header>
      {children}
    </div>
  </div>;
}