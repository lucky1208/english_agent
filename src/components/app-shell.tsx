"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookMarked, BookOpen, MessageCircle, RefreshCcw, Settings, Sprout } from "lucide-react";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureGuestSession, guestAuthErrorMessage, guestLabel } from "@/lib/supabase/guest";

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

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const supabase = createSupabaseBrowserClient();
      ensureGuestSession(supabase)
        .then((user) => {
          setUserLabel(guestLabel(user));
          setAuthError("");
        })
        .catch((error) => {
          setAuthError(guestAuthErrorMessage(error));
        })
        .finally(() => {
          setAuthReady(true);
        });

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUserLabel(guestLabel(session.user));
          setAuthError("");
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch (error) {
      setAuthError(guestAuthErrorMessage(error));
      setAuthReady(true);
    }
    return () => unsubscribe?.();
  }, []);

  if (!authReady || !userLabel) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="brand"><span className="brand-mark"><Sprout size={18} /></span><span>English Mate</span></div>
          <p className="page-lede" style={{ marginTop: 20 }}>
            {authError || "正在创建游客会话…"}
          </p>
          <p className="inline-muted" style={{ marginTop: 12 }}>
            免登录模式会自动创建一个 Supabase 匿名用户。请在 Supabase 开启 Anonymous Sign-Ins，并在 Vercel 配置 Supabase URL 与 anon key。
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <a className="btn btn-primary" href="/api/health" target="_blank" rel="noreferrer">检查配置状态</a>
            <Link className="btn" href="/privacy">隐私政策</Link>
          </div>
        </div>
      </div>
    );
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark"><Sprout size={18} /></span><span className="brand-text">English Mate</span></Link>
      <div style={{ width: "100%" }}><div className="nav-label">WORKSPACE</div>{nav.map((item) => { const Icon = item.icon; const active = path === item.href; return <Link className={`nav-link ${active ? "active" : ""}`} key={item.href} href={item.href} title={item.label}><Icon size={18}/><span className="nav-text">{item.label}</span></Link>; })}</div>
      <div className="sidebar-bottom"><strong>Small steps, every day.</strong><br/>每一次真实对话，都会变成你的英语进步。</div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div><div className="topbar-title">{title}</div><div className="topbar-subtitle">{userLabel}</div></div><span className="pill">{userLabel}</span></header>
      {children}
    </div>
  </div>;
}