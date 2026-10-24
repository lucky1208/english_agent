import Link from "next/link";
import { Sprout } from "lucide-react";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="legal-wrap">
      <article className="legal-card">
        <div className="legal-top">
          <Link href="/" className="brand" style={{ padding: 0 }}>
            <span className="brand-mark"><Sprout size={18} /></span>
            <span>English Mate</span>
          </Link>
          <Link className="inline-muted" href="/">返回应用</Link>
        </div>
        <div className="eyebrow" style={{ marginTop: 28 }}>LEGAL</div>
        <h1 className="page-heading">{title}</h1>
        <p className="inline-muted">最后更新：{updated}</p>
        <div className="legal-content">{children}</div>
        <div className="legal-footer">
          <Link href="/privacy" className="inline-muted">隐私政策</Link>
          <Link href="/terms" className="inline-muted">服务条款</Link>
          <Link href="/settings" className="inline-muted">数据管理</Link>
        </div>
      </article>
    </main>
  );
}