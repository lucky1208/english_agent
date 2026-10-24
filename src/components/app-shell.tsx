"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BookMarked, BookOpen, LogOut, MessageCircle, RefreshCcw, Settings, Sprout } from "lucide-react";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    try {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getUser().then(({ data }) => {
        setEmail(data.user?.email ?? "");
        setAuthReady(true);
        if (!data.user) router.replace("/login");
      }).catch(() => { setAuthReady(true); router.replace("/login"); });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setEmail(session?.user?.email ?? "");
        if (!session?.user) router.replace("/login");
      });
      return () => listener.subscription.unsubscribe();
    } catch (error) {
      setAuthReady(true);
      setAuthError(error instanceof Error ? error.message : "请配置 Supabase 环境变量。");
    }
  }, [router]);

  async function signOut() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // The login page will show the configuration error if env vars are missing.
    }
    router.replace("/login");
  }

  if (!authReady || !email) return <div className="auth-wrap"><div className="auth-card"><div className="brand"><span className="brand-mark"><Sprout size={18}/></span><span>English Mate</span></div><p className="page-lede" style={{ marginTop: 20 }}>{authError ? `配置提示：${authError}` : "正在检查登录状态…"}</p><p className="inline-muted" style={{ marginTop: 12 }}>请在 .env.local 中配置 Supabase URL 和 anon key，然后重启开发服务器。</p><Link className="btn btn-primary" style={{ marginTop: 10 }} href="/login">前往登录</Link></div></div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark"><Sprout size={18}/></span><span className="brand-text">English Mate</span></Link>
      <div style={{ width: "100%" }}><div className="nav-label">WORKSPACE</div>{nav.map((item) => { const Icon = item.icon; const active = path === item.href; return <Link className={`nav-link ${active ? "active" : ""}`} key={item.href} href={item.href} title={item.label}><Icon size={18}/><span className="nav-text">{item.label}</span></Link>; })}</div>
      <div className="sidebar-bottom"><strong>Small steps, every day.</strong><br/>每一次真实对话，都会变成你的英语进步。</div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div><div className="topbar-title">{title}</div><div className="topbar-subtitle">{email}</div></div><button className="btn" onClick={signOut}><LogOut size={15}/>退出</button></header>
      {children}
    </div>
  </div>;
}