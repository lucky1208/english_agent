export type CoachState = "idle" | "listening" | "thinking" | "speaking" | "error";

const COPY: Record<CoachState, { title: string; sub: string }> = {
  idle: {
    title: "准备好了就开始",
    sub: "直接输入英文，或点麦克风说完后自动发送。",
  },
  listening: {
    title: "我在听，慢慢说",
    sub: "说完后会自动发送；识别不准可以再说一次，或切回文字输入。",
  },
  thinking: {
    title: "正在理解你的意思",
    sub: "组织更自然的表达和纠错，稍等一下。",
  },
  speaking: {
    title: "正在用英语回答你",
    sub: "先听完，再继续表达你的想法。",
  },
  error: {
    title: "遇到一点问题",
    sub: "查看下方提示，稍后再试。",
  },
};

export function CoachStage({ state }: { state: CoachState }) {
  const copy = COPY[state];
  return (
    <section className={`coach-stage state-${state}`}>
      <div className="dh-avatar" aria-hidden="true">
        <span className="dh-ring" />
        <span className="dh-ring dh-ring-2" />
        <svg viewBox="0 0 160 160" className="dh-svg" role="img" aria-label="AI 英语教练">
          <defs>
            <radialGradient id="dh-bg" cx="35%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#dcebe2" />
            </radialGradient>
            <linearGradient id="dh-shirt" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#426b56" />
              <stop offset="100%" stopColor="#294b3a" />
            </linearGradient>
          </defs>
          <circle cx="80" cy="80" r="76" fill="url(#dh-bg)" />
          <circle cx="80" cy="80" r="76" fill="none" stroke="#cfe0d5" strokeWidth="1.5" />
          <path d="M35 158 C38 122 54 108 80 108 C106 108 122 122 125 158 Z" fill="url(#dh-shirt)" />
          <g className="dh-head">
            <rect x="71" y="96" width="18" height="22" rx="9" fill="#e9b99e" />
            <ellipse cx="80" cy="80" rx="35" ry="39" fill="#f2c9b2" />
            <path d="M45 76 C45 43 115 43 115 76 C115 60 104 48 80 48 C56 48 45 60 45 76 Z" fill="#2f3e35" />
            <path d="M45 74 C41 84 42 94 47 101 C49 90 47 82 45 74 Z" fill="#2f3e35" />
            <path d="M115 74 C119 84 118 94 113 101 C111 90 113 82 115 74 Z" fill="#2f3e35" />
            <ellipse className="dh-eye" cx="66" cy="78" rx="3.4" ry="4.4" fill="#26332c" />
            <ellipse className="dh-eye" cx="94" cy="78" rx="3.4" ry="4.4" fill="#26332c" />
            <path d="M61 69 C64 66 69 66 72 69" stroke="#3a4a40" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M88 69 C91 66 96 66 99 69" stroke="#3a4a40" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M80 82 C78 88 77 91 81 92" stroke="#d99d85" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <ellipse className="dh-mouth" cx="80" cy="102" rx="9" ry="3.2" fill="#a94f4c" />
            <ellipse cx="57" cy="91" rx="6" ry="3.5" fill="#e8a892" opacity=".55" />
            <ellipse cx="103" cy="91" rx="6" ry="3.5" fill="#e8a892" opacity=".55" />
            <path d="M44 78 C44 46 116 46 116 78" stroke="#2c3e35" strokeWidth="5" fill="none" strokeLinecap="round" />
            <rect x="34" y="70" width="14" height="28" rx="7" fill="#2c3e35" />
            <rect x="112" y="70" width="14" height="28" rx="7" fill="#2c3e35" />
            <circle cx="41" cy="84" r="3" fill="#6b9479" />
            <path d="M112 98 C112 118 95 120 86 113" stroke="#2c3e35" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="86" cy="113" r="4" fill="#426b56" />
          </g>
        </svg>
      </div>
      <div className="coach-copy">
        <div className="coach-meta"><span className="pill">AI Coach</span></div>
        <div className="coach-title" aria-live="polite">{copy.title}</div>
        <div className="coach-sub">{copy.sub}</div>
      </div>
      <div className="dh-wave" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </div>
    </section>
  );
}