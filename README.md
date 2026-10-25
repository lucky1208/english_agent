# English Mate — AI 英语文字教练

一个可部署到 Vercel 的 Next.js 全栈英语学习应用：文字对话、结构化纠错、长期学习档案、错题本、词汇本、间隔复习、数据分析，以及浏览器语音输入 + AI 朗读。

> 当前版本已移除 WebRTC 实时语音。语音输入使用浏览器 `SpeechRecognition`，AI 朗读使用 `speechSynthesis`；这是按轮次对话，不是全双工实时语音。文字聊天、纠错、复习和数据保存不受影响。

## 1. 功能

- 免登录固定账户：配置一个 Supabase 账户后自动登录，适合个人使用；未配置时回退到 Supabase 匿名游客。
- 百炼文本接口（默认 `qwen-plus`）生成对话、纠错和词汇建议。
- 浏览器语音输入：说完自动发送；识别不准可以直接改用文字。
- AI 回复自动朗读（可关闭）。
- 动态 2D 数字人：思考、朗读、说话状态动画。
- 学习档案：CEFR 水平、目标、交流偏好。
- 错题本：原句、自然表达、中文解释、错误类型、掌握状态。
- 词汇本：自动收录、手动添加、浏览器发音。
- 间隔复习：词汇和错题按遗忘曲线安排复习，记录每次评分。
- 长期记忆：Supabase 结构化记录是事实来源；可选接入百炼长期记忆 API。
- 会话历史切换、新对话、7 天复习活动图、学习进度统计。
- 数据导出、逐条删除百炼记忆、删除账户与全部学习数据。
- 隐私政策 / 服务条款页面。
- Zod 输入校验、Upstash 限流、服务端密钥隔离、安全响应头。

## 2. 技术架构

```text
Browser (Next.js App Router)
  │
  ├─ Anonymous / fixed Supabase Auth cookie ──► Supabase Auth
  │
  ├─ Browser SpeechRecognition ───────────────► speech to text (browser service)
  ├─ Browser speechSynthesis ─────────────────► read AI reply aloud
  │
  └─ /api/chat ───────────────────────────────► Next.js Route Handler
                                                 ├─ Supabase PostgreSQL (RLS)
                                                 ├─ Bailian OpenAI-compatible text API
                                                 └─ Bailian Memory API (optional)
```

关键设计：

- **文字是主链路**：模型返回严格 JSON（回复、纠错、词汇），Zod 校验后入库。
- **语音不经过 WebRTC**：浏览器负责语音识别和朗读，不需要 SDP、TURN 或实时媒体服务器。
- **结构化记忆优先**：Supabase 中的档案、错题、词汇和复习记录是事实来源。
- **语义记忆可选**：百炼长期记忆失败时不影响应用。
- **服务端密钥隔离**：`DASHSCOPE_API_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 永远不进入 `NEXT_PUBLIC_*`。
- **RLS 双重保护**：服务端根据 `auth.getUser()` 推导用户，数据库再用 RLS 隔离。

## 3. 模型选择

| 场景 | 默认模型 | 说明 |
| --- | --- | --- |
| 文字教练 / 结构化纠错 | `qwen-plus` | 成本、速度、JSON 稳定性平衡好；模型 ID 以控制台为准 |
| 高质量对话（可选） | 控制台当前旗舰文本模型 | 改 `DASHSCOPE_TEXT_MODEL` 即可 |
| 长期记忆 | 百炼长期记忆 API | 可选 |

当前版本不使用 Qwen-Audio-Realtime、WebRTC、SDP 或实时语音模型。

## 4. 代码目录

```text
english-ai-tutor/
├─ src/app/
│  ├─ page.tsx                     # 主对话页：文字 + 浏览器语音输入
│  ├─ login/page.tsx               # 旧链接兼容：重定向首页
│  ├─ review/page.tsx              # 间隔复习
│  ├─ mistakes/page.tsx            # 错题本
│  ├─ vocabulary/page.tsx          # 词汇本
│  ├─ progress/page.tsx            # 学习进度
│  ├─ settings/page.tsx            # 导出 / 记忆管理 / 删除账户
│  ├─ privacy/page.tsx             # 隐私政策
│  ├─ terms/page.tsx               # 服务条款
│  └─ api/
│     ├─ chat/route.ts             # 文字教练
│     ├─ review/route.ts           # 复习队列与评分
│     ├─ auth/fixed/route.ts       # 固定账户服务端登录
│     ├─ memory/route.ts           # 百炼记忆查看 / 删除
│     ├─ account/export/route.ts   # 学习数据导出
│     └─ account/delete/route.ts   # 删除账户与数据
├─ src/components/
│  ├─ coach-avatar.tsx             # 动态数字人
│  ├─ app-shell.tsx                # 布局与游客会话
│  └─ legal-page.tsx
├─ src/lib/
│  ├─ ai/                          # 模型客户端、Prompt、JSON Schema、消息构造
│  ├─ memory/bailian.ts            # 百炼长期记忆适配器
│  ├─ learner-context.ts           # 档案 + 错题 + 到期词汇汇总
│  ├─ review.ts                    # 纯函数 SRS 调度
│  ├─ rate-limit.ts                # Upstash / 本地限流
│  └─ supabase/                    # 浏览器 / 服务端 / 管理端 / 会话
├─ src/types/speech.d.ts           # 浏览器语音识别类型
├─ supabase/schema.sql             # 数据表、索引、触发器、RLS
├─ docs/                           # 架构、部署、安全、百炼配置
└─ tests/                          # 单元测试
```

## 5. 本地启动

要求：Node.js 20.9+（推荐 22 LTS）、npm、Supabase 项目、百炼账号。

```bash
cp .env.example .env.local
npm install
npm run dev
```

### 5.1 Supabase

1. 新建 Supabase 项目。
2. SQL Editor 执行 `supabase/schema.sql`。
3. 新版控制台点击顶部绿色 **Connect**，或 Settings → **API Keys**，复制 Project URL 与 Publishable/anon key。
4. **固定账户模式（推荐个人使用）**：
   - Authentication → Users → Add user，创建邮箱 + 密码账户，勾选自动确认。
   - Vercel 配置 `FIXED_ACCOUNT_EMAIL`、`FIXED_ACCOUNT_PASSWORD`、`FIXED_ACCOUNT_ACCESS_CODE`。
5. **游客回退模式（不配置固定账户时）**：Authentication → Providers → 开启 Anonymous Sign-Ins。
6. Authentication → URL Configuration：
   - Site URL：`http://localhost:3000`
   - Redirect URLs：`http://localhost:3000/**`、Vercel Preview 域名和正式域名。

### 5.2 百炼文字模型

```env
DASHSCOPE_API_KEY=
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_TEXT_MODEL=qwen-plus
```

也可以使用业务空间专属地址，例如：

```env
DASHSCOPE_BASE_URL=https://{真实 WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
```

### 5.3 启动与检查

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run verify
```

配置完成后访问 `GET /api/health`，确认 Supabase、百炼文字、长期记忆和 Upstash 的配置状态（不返回密钥）。

## 6. 浏览器语音输入

- 使用 `SpeechRecognition` / `webkitSpeechRecognition`。
- 说完一句后自动发送给 `/api/chat`。
- AI 回复通过 `speechSynthesis` 朗读，可在右侧“语音输入”卡片关闭自动朗读。
- 这是按轮次对话，不支持全双工打断。
- Chrome 在中国大陆可能提示 `network`，因为浏览器语音识别依赖外部服务；此时请改用 Microsoft Edge，或直接输入文字。
- 当前版本不使用 WebRTC、SDP 或百炼实时语音模型，因此不会出现跨境媒体连接问题。

## 7. 数据表

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `profiles` | 学习档案 | `level`、`goals`、`preferences` |
| `conversations` | 会话 | `mode`、`updated_at` |
| `messages` | 消息 | `role`、`content`、`metadata`、`client_turn_id` |
| `corrections` | 错题 | `original_text`、`corrected_text`、`severity`、`review_count`、`next_review_at` |
| `vocabulary` | 词汇 | `word`、`meaning`、`mastery_level`、`next_review_at` |
| `review_records` | 复习历史 | `item_type`、`item_id`、`quality`、`next_review_at` |
| `learning_sessions` | 学习会话摘要（预留） | `duration_seconds`、`topics`、`summary` |
| `user_memory_refs` | 百炼记忆引用（预留） | `provider_memory_id` |

所有表启用 RLS，策略均基于 `auth.uid() = user_id`。`messages` 还要求会话属于当前用户。

## 8. 部署到 Vercel

1. 把仓库推送到 GitHub。
2. Vercel → Add New → Project → 导入仓库。
3. Framework Preset 选择 Next.js，Node.js 版本 20 或 22。
4. 在 Preview 和 Production 设置 `.env.example` 中的变量。
5. 在 Supabase Auth 中开启 Anonymous Sign-Ins 或创建固定账户，并配置 Site URL / Redirect URLs。
6. 在 Supabase SQL Editor 执行最新 `supabase/schema.sql`。
7. 创建 Upstash Redis，填入 REST URL / Token（公开多用户生产环境必需）。
8. Deploy，验证：自动会话、文字聊天、纠错入库、词汇、复习、浏览器语音输入、数据导出、删除记忆。
9. 绑定自定义域名并开启 HTTPS（麦克风需要安全上下文）。

### Vercel CLI

```bash
npm i -g vercel
vercel login
vercel link
vercel env add DASHSCOPE_API_KEY
vercel env add DASHSCOPE_BASE_URL
vercel env add DASHSCOPE_TEXT_MODEL
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add FIXED_ACCOUNT_EMAIL
vercel env add FIXED_ACCOUNT_PASSWORD
vercel env add FIXED_ACCOUNT_ACCESS_CODE
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel --prod
```

`SUPABASE_SERVICE_ROLE_KEY` 只能放在服务端环境变量，绝不能加 `NEXT_PUBLIC_`。

面向中国大陆用户时，Vercel 函数不在中国大陆；文字接口使用 `dashscope.aliyuncs.com` 或新加坡 `dashscope-intl.aliyuncs.com` 通常可用。当前版本不使用实时语音媒体，因此没有跨境 WebRTC 问题。

## 9. 安全与上线清单

- [ ] `DASHSCOPE_API_KEY`、`BAILIAN_MEMORY_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 只存在服务端。
- [ ] Supabase 所有用户表启用 RLS，并用两个测试账号验证隔离。
- [ ] 所有 API 用 `auth.getUser()` 鉴权，绝不信任前端传来的 `user_id`。
- [ ] 公开多用户生产环境配置 Upstash；固定账户个人模式可用内存回退。
- [ ] 百炼和 Supabase 设置费用/配额告警。
- [ ] 固定账户模式必须配置 `FIXED_ACCOUNT_ACCESS_CODE`；不要把密码或访问码写进前端。
- [ ] 完成隐私政策、服务条款、适龄政策和目标法域合规审查。
- [ ] 配置错误监控、数据库备份、恢复演练和日志脱敏。
- [ ] 公开产品增加分层配额、付费方案、防滥用和内容安全策略。

## 10. 已知边界

- 当前语音是浏览器按轮次识别 + 朗读，不是全双工实时对话，不支持实时打断。
- Chrome 在中国大陆的语音识别可能不可用；Edge 或文字输入是替代方案。
- 文本模型不能可靠判断发音，不应宣传“发音评分”。
- 公开上线前还需要账号升级/绑定、支付、监控、备份和法务审查。

## 11. 官方资料

- 百炼 OpenAI 兼容接口：<https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope>
- 百炼长期记忆 API：<https://help.aliyun.com/zh/model-studio/long-term-memory-2-0>
- Supabase SSR Auth：<https://supabase.com/docs/guides/auth/server-side/nextjs>
- Vercel 环境变量：<https://vercel.com/docs/environment-variables>