# English Mate — 阿里云百炼英语私教

一个可部署到 Vercel 的 Next.js 全栈英语学习应用：文字对话、Qwen-Audio-Realtime 实时语音、结构化纠错、长期学习档案、错题本、词汇本、间隔复习和百炼长期记忆。

> 这是可运行的工程版，不是已经绑定你账户的线上成品。真实使用需要你自己的 Supabase 项目、百炼 API Key、实时语音模型权限和 Upstash（生产环境）。

## 1. 功能

- 免登录固定账户：配置一个 Supabase 账户后自动登录，适合个人使用；未配置时回退到 Supabase 匿名游客。所有数据仍由 PostgreSQL RLS 按用户隔离。
- 百炼 OpenAI 兼容文本接口（默认 `qwen-plus`）生成对话、纠错和词汇建议。
- 实时语音：浏览器 WebRTC 直连百炼，服务端只代理 SDP 鉴权，不经过 Vercel 转发音频。
- 语音实时字幕、打断、静音；通话结束后保存用户和 AI 的转写文本。
- 学习档案：CEFR 水平、目标、交流偏好。
- 错题本：原句、自然表达、中文解释、错误类型、掌握状态。
- 词汇本：自动收录 + 手动添加 + 发音朗读。
- 间隔复习：词汇和错题按遗忘曲线安排复习，记录每次评分。
- 长期记忆：Supabase 结构化记录是事实来源；可选接入百炼长期记忆 API。
- 会话历史切换、新对话、复习入口、7 天复习活动图和学习进度统计。
- 数据导出、逐条删除百炼记忆、删除账户与全部学习数据。
- 隐私政策 / 服务条款页面。
- Zod 输入校验、Upstash 限流、服务端密钥隔离、安全响应头。

## 2. 对原 GPT-6 脚手架的审计结论

原代码方向正确，但只是一个“能编译的起点”，不完全满足你的学习需求。本次已修复：

| 原问题 | 影响 | 本次处理 |
| --- | --- | --- |
| 聊天时先插入当前用户消息，又读取最近消息，导致当前消息在 Prompt 中出现两次 | 模型重复理解、浪费 Token | 先读历史再插入当前消息；新增纯函数和测试 |
| 只把 profile 和语义记忆注入模型，没有把近期错题、到期词汇注入 | 错误会反复出现，词汇不会复用 | `learner-context.ts` 汇总档案、错题、到期词汇，文字和语音共用 |
| 数据库有 `review_records` 但没有任何复习 API / UI | 不能“反复复习” | 新增 `/review` 页面、`/api/review`、SRS 调度和复习统计 |
| 页面固定加载最近一个会话，无法切换历史 | 长期使用后无法回顾 | 增加会话下拉、新对话、历史消息切换 |
| 实时语音没有等 WebRTC 真正 connected 再初始化，且无实时字幕 | 容易初始化失败、体验差 | 重写语音状态机：DataChannel + connected + session.created → session.update → session.updated → 挂载麦克风 |
| 语音转写可能重复入库 | 统计和记忆重复 | 增加 `client_turn_id` 唯一约束和幂等保存 |
| 没有记忆查看 / 删除、数据导出、账户删除 | 不满足公开产品的数据权利 | 新增设置页、导出 API、删除 API |
| 没有隐私 / 条款页面 | 不适合公开上线 | 新增 `/privacy`、`/terms` |
| TypeScript、ESLint、构建报错 | 无法部署 | 已修复并通过检查 |

仍然存在的边界：

- 文本模型不能可靠判断发音。语音纠错基于 ASR 转写，主要覆盖语法、用词、搭配和自然度，不应宣传“发音评分”。
- 真实语音端到端验证需要你自己的百炼账户、麦克风、HTTPS 域名和模型权限，本地无密钥无法代替。
- 固定账户模式适合个人使用，不适合多用户公开产品。公开产品需要支付/配额、账号升级/绑定、监控告警、备份、成本上限和法务审查。匿名回退账号与浏览器 cookie 绑定，清除 cookie 后会变成新游客，因此公开产品还需要按 IP 限流或验证码。

## 3. 技术架构

```text
Browser (Next.js App Router + WebRTC)
  │
  ├─ Anonymous Supabase Auth cookie ────► Supabase Auth
  │
  ├─ /api/chat ─────────────────────────► Next.js Route Handler
  │                                         ├─ Supabase PostgreSQL (RLS)
  │                                         ├─ Bailian OpenAI-compatible text API
  │                                         └─ Bailian Memory API (optional)
  │
  ├─ /api/voice/context ────────────────► profile + mistakes + due words + memory
  ├─ /api/voice/sdp ────────────────────► Bailian WebRTC SDP exchange (server-side API key)
  │                                        │
  │   audio RTP ◄─────────────────────────┘  (direct browser ⇄ Bailian, not via Vercel)
  │   DataChannel: Qwen-Audio-Realtime events
  │
  └─ /api/voice/turn ───────────────────► save transcript, async correction
```

关键设计：

- **结构化记忆优先**：Supabase 中的档案、错题、词汇和复习记录是事实来源。
- **语义记忆可选**：百炼长期记忆负责跨会话的事实抽取与检索，失败时不影响应用。
- **文字非流式**：为了稳定返回严格 JSON（回复 + 纠错 + 词汇），文字接口一次性返回；实时性由语音模式承担。
- **服务端密钥隔离**：`DASHSCOPE_API_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 永远不进入 `NEXT_PUBLIC_*`。
- **RLS 双重保护**：服务端根据 `auth.getUser()` 推导用户，数据库再用 RLS 隔离。

## 4. 模型选择

| 场景 | 默认模型 | 说明 |
| --- | --- | --- |
| 文字教练 / 结构化纠错 | `qwen-plus` | 成本、速度、JSON 稳定性平衡好；模型 ID 必须在百炼控制台确认已开通 |
| 高质量对话（可选） | `qwen3-max` 或控制台当前旗舰文本模型 | 质量更高、成本更高；改 `DASHSCOPE_TEXT_MODEL` 即可 |
| 实时语音 | `qwen-audio-3.1-realtime-plus` | 支持 WebRTC、VAD、输入/输出转写、中文解释 + 英语对话 |
| 实时语音备选 | `qwen-audio-3.0-realtime-plus` / `flash` | 能力/价格不同，事件字段以官方文档为准 |
| 音色 | `longanqian_v3.1` | 3.1 Plus 默认英语女声；可在百炼控制台试听后更换 |
| 长期记忆 | 百炼长期记忆 API | 可选；默认记忆库即可，也可配置 `BAILIAN_MEMORY_LIBRARY_ID` |

不要凭记忆填写模型 ID。以你账号控制台的“模型广场 / 模型列表”和官方文档为准。地域、业务空间、API Key、模型权限必须一致。

## 5. 代码目录

```text
english-ai-tutor/
├─ src/app/
│  ├─ page.tsx                     # 主对话页：文字 + 实时语音 + 会话切换
│  ├─ login/page.tsx               # 旧链接兼容：重定向首页；登录页已关闭
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
│     ├─ voice/context/route.ts    # 语音教练上下文
│     ├─ voice/sdp/route.ts        # WebRTC SDP 代理
│     ├─ voice/turn/route.ts       # 语音转写保存 + 异步纠错
│     ├─ memory/route.ts           # 百炼记忆查看 / 删除
│     ├─ account/export/route.ts   # 学习数据导出
│     └─ account/delete/route.ts   # 删除账户与数据
├─ src/lib/
│  ├─ ai/                          # 模型客户端、Prompt、JSON Schema、消息构造
│  ├─ memory/bailian.ts            # 百炼长期记忆适配器
│  ├─ learner-context.ts           # 档案 + 错题 + 到期词汇汇总
│  ├─ review.ts                    # 纯函数 SRS 调度
│  ├─ rate-limit.ts                # Upstash / 本地限流
│  └─ supabase/                    # 浏览器 / 服务端 / 管理端 / 游客会话客户端
├─ supabase/schema.sql             # 数据表、索引、触发器、RLS
├─ docs/                           # 架构、部署、安全、百炼配置
└─ tests/                          # 单元测试
```

## 6. 本地启动

要求：Node.js 20.9+（推荐 22 LTS）、npm、Supabase 项目、百炼账号。

```bash
cp .env.example .env.local
npm install
npm run dev
```

### 6.1 Supabase

1. 新建 Supabase 项目。
2. 打开 SQL Editor，执行 `supabase/schema.sql`。
3. 新版 Supabase 控制台：点击顶部绿色 **Connect**，或 Settings → **API Keys**，复制 **Project URL** 和 **Publishable key**（旧版叫 anon public key）。前者填 `NEXT_PUBLIC_SUPABASE_URL`，后者填 `NEXT_PUBLIC_SUPABASE_ANON_KEY`；如需删除账户，再复制 service_role/secret key（只放服务端）。
4. **固定账户模式（推荐个人使用）**：
   - Authentication → Users → Add user，创建一个邮箱 + 密码账户，并勾选自动确认邮箱。
   - 在 Vercel 配置 `FIXED_ACCOUNT_EMAIL`、`FIXED_ACCOUNT_PASSWORD`、`FIXED_ACCOUNT_ACCESS_CODE`。
   - 页面会自动登录这个账户；访问码只需在当前浏览器会话输入一次。
5. **游客回退模式（不配置固定账户时）**：Authentication → Providers → 开启 Anonymous Sign-Ins。
6. Authentication → URL Configuration：
   - Site URL：`http://localhost:3000`
   - Redirect URLs：`http://localhost:3000/**`、Vercel Preview 域名和正式域名。
7. 可选：以后要支持邮箱账号升级时，再开启邮箱确认并配置 SMTP。

### 6.2 阿里云百炼

详细步骤见 `docs/bailian-setup.md`。最少需要：

```env
DASHSCOPE_API_KEY=sk-...
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_TEXT_MODEL=qwen-plus
DASHSCOPE_REALTIME_URL=https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime
DASHSCOPE_REALTIME_MODEL=qwen-audio-3.1-realtime-plus
DASHSCOPE_REALTIME_VOICE=longanqian_v3.1
```

固定账户（可选，个人使用推荐）：

```env
FIXED_ACCOUNT_EMAIL=you@example.com
FIXED_ACCOUNT_PASSWORD=your-supabase-user-password
FIXED_ACCOUNT_ACCESS_CODE=a-long-random-string
```

`FIXED_ACCOUNT_EMAIL/PASSWORD` 只放服务端；`FIXED_ACCOUNT_ACCESS_CODE` 在生产环境是必需的，防止任何人直接使用你的固定账户。访问码由浏览器在第一次进入时询问，保存在当前标签页的 `sessionStorage`。

长期记忆可选：

```env
BAILIAN_MEMORY_BASE_URL=https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/
BAILIAN_MEMORY_API_KEY=sk-...
BAILIAN_MEMORY_PROJECT_ID=english-ai-tutor
```

生产环境限流：

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

未配置 Upstash 时，公开多用户生产环境会拒绝 AI 接口（fail closed）。配置了 `FIXED_ACCOUNT_EMAIL` 的个人模式会退回单实例内存限流，适合自用，但不适合公开流量。

### 6.3 启动与检查

```bash
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm run test
npm run build
npm run verify       # 依次执行以上四项
```

配置完成后访问 `GET /api/health`，确认 Supabase、百炼文本、实时语音、长期记忆和 Upstash 的配置状态（不返回任何密钥）。

当前测试覆盖：合法/非法模型 JSON、Prompt 不重复当前消息、学习上下文格式化、SRS 调度、复习到期判断。

## 7. 百炼控制台配置

1. 登录阿里云百炼控制台，完成服务开通。
2. 创建或进入一个业务空间，记下 Workspace ID。地域建议先用华北2（北京）。
3. API Key → 创建 API Key，关联同一个业务空间。
4. 模型广场确认 `qwen-plus` 和 `qwen-audio-3.1-realtime-plus` 已开通/可用。
5. 实时语音：
   - SDP 地址：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime`
   - 代码会自动追加 `?model=qwen-audio-3.1-realtime-plus`
   - 音色：`longanqian_v3.1`（可在控制台试听）
6. 长期记忆（可选）：
   - 记忆库 → 创建/使用默认记忆库
   - 服务地址：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/`
   - 使用同一个业务空间的 API Key
7. 为账号设置费用预警和模型限流，避免公开后被刷。

关键规则：

- API Key、业务空间、endpoint 地域必须一致。
- 不要把 Coding Plan / Token Plan 的交互式编码地址用于产品后端。
- WebRTC 音频由浏览器直连百炼，Vercel 只代理 SDP，不代理长时间音频。
- 如果用户网络无法建立 WebRTC，后续可增加 TURN 服务器；当前使用百炼默认接入方式。

## 8. 长期记忆设计

三层记忆：

1. **会话内上下文**：最近 12 条消息，保证当前对话连贯。
2. **结构化长期档案**：`profiles`、`corrections`、`vocabulary`、`review_records`、`learning_sessions`。这是最可靠、可查询、可删除的记忆。
3. **语义记忆**：百炼长期记忆 API 自动抽取事实，按语义检索后注入 Prompt。未配置时自动跳过。

每次文字 / 语音对话会把以下内容注入模型：

- 学习水平、目标、偏好；
- 最近未掌握错题（原句 → 自然表达、类型、中文解释）；
- 今日到期词汇（含掌握度和例句）；
- 百炼语义检索结果（标记为不可信上下文，防止提示注入）。

`/settings` 可以查看和逐条删除百炼记忆；`/api/account/delete` 会清理全部结构化数据和百炼记忆。

## 9. 实时语音流程

```text
1. 前端 getUserMedia 获取麦克风，创建 RTCPeerConnection
2. addTransceiver(audio, sendrecv)，创建 oai-events DataChannel
3. 创建 Offer，等待 ICE 完成
4. POST /api/voice/sdp → 服务端携带 API Key 转发给百炼
5. setRemoteDescription(Answer)
6. 等待 pc.connectionState=connected、DataChannel open、session.created
7. 发送 session.update（voice、instructions、VAD、语言）
8. 收到 session.updated 后 replaceTrack 挂载麦克风
9. 音频走 RTP；事件走 DataChannel
10. 保存 input_audio_transcription.completed / response.audio_transcript.done
11. 用户结束 → 停止轨道、关闭通道、关闭 PeerConnection
```

实现要点：

- 服务端会同时处理浏览器创建和服务端创建的 DataChannel（百炼通过名为 `txt` 的通道推事件）。
- 只有收到 `session.updated` 才发送音频，避免模型未初始化。
- 不保存原始音频；只保存最终转写文本。
- `client_turn_id` 唯一约束防止断线重试造成重复消息。
- 语音用户转写会异步调用文本模型生成结构化错题，避免实时语音模型只“口头纠正”而没有复习记录。

## 10. 数据表

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `profiles` | 学习档案 | `level`、`goals`、`preferences` |
| `conversations` | 会话 | `mode`、`updated_at` |
| `messages` | 消息 / 语音转写 | `role`、`content`、`metadata`、`client_turn_id` |
| `corrections` | 错题 | `original_text`、`corrected_text`、`severity`、`review_count`、`next_review_at` |
| `vocabulary` | 词汇 | `word`、`meaning`、`mastery_level`、`next_review_at` |
| `review_records` | 复习历史 | `item_type`、`item_id`、`quality`、`next_review_at` |
| `learning_sessions` | 学习会话摘要（预留） | `duration_seconds`、`topics`、`summary` |
| `user_memory_refs` | 百炼记忆引用（预留） | `provider_memory_id` |

所有表启用 RLS，策略均基于 `auth.uid() = user_id`。`messages` 还要求会话属于当前用户。

## 11. 部署到 Vercel

### 方式 A：GitHub + Vercel 控制台

1. 把 `english-ai-tutor` 推送到 GitHub（建议先私有仓库）。
2. Vercel → Add New → Project → 导入仓库。
3. Framework Preset 选择 Next.js，Node.js 版本 20 或 22。
4. 在 Preview 和 Production 分别设置 `.env.example` 中的变量。
5. 在 Supabase Auth 中开启 Anonymous Sign-Ins，并配置 Site URL / Redirect URLs 为 Vercel 域名。
6. 在 Supabase SQL Editor 执行最新 `supabase/schema.sql`（已有库也会幂等升级）。
7. 创建 Upstash Redis，填入 REST URL / Token。
8. Deploy Preview，逐项验证：自动游客会话、文字聊天、纠错入库、词汇、复习、语音 SDP、语音转写、数据导出、删除记忆。
9. 绑定自定义域名并开启 HTTPS（麦克风必须安全上下文）。
10. 检查 Vercel 日志没有密钥、完整音频或不必要的个人数据，再转 Production。

### 方式 B：Vercel CLI

```bash
npm i -g vercel
vercel login
vercel link
vercel env add DASHSCOPE_API_KEY
vercel env add DASHSCOPE_BASE_URL
vercel env add DASHSCOPE_TEXT_MODEL
vercel env add DASHSCOPE_REALTIME_URL
vercel env add DASHSCOPE_REALTIME_MODEL
vercel env add DASHSCOPE_REALTIME_VOICE
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add FIXED_ACCOUNT_EMAIL
vercel env add FIXED_ACCOUNT_PASSWORD
vercel env add FIXED_ACCOUNT_ACCESS_CODE
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel env add NEXT_PUBLIC_APP_URL
vercel --prod
```

不要把 `.env.local` 提交到 Git。`SUPABASE_SERVICE_ROLE_KEY` 只能放在 Vercel 服务端环境变量，绝不能加 `NEXT_PUBLIC_`。

面向中国大陆用户时还需要注意：Vercel 函数默认不在中国大陆，调用北京百炼 endpoint 可能出现跨境延迟或可达性问题。可在 Vercel 项目设置中选择香港/新加坡区域，或把 API 代理部署到阿里云/香港服务器、Vercel 只托管前端。实时语音媒体是浏览器直连百炼，不经过 Vercel，因此受影响的主要是文字接口和 SDP 代理。

## 12. 安全与上线清单

- [ ] `DASHSCOPE_API_KEY`、`BAILIAN_MEMORY_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 只存在服务端。
- [ ] Supabase 所有用户表启用 RLS，并用两个测试账号验证 A 不能读写 B 的数据。
- [ ] 所有 API 用 `auth.getUser()` 鉴权，绝不信任前端传来的 `user_id`。
- [ ] 公开多用户生产环境配置 Upstash；固定账户个人模式可使用内存回退，但不要用于公开流量。
- [ ] 百炼和 Supabase 设置费用/配额告警。
- [ ] 不保存原始音频；隐私页明确说明音频会发送给百炼处理。
- [ ] 固定账户模式必须配置 `FIXED_ACCOUNT_ACCESS_CODE`；不要把密码或访问码写进前端。
- [ ] 配置会话过期和数据恢复策略；公开产品增加 IP 限流、验证码和账号升级/绑定。
- [ ] 完成隐私政策、服务条款、适龄政策和目标法域合规审查；替换页面中的联系信息占位符。
- [ ] 配置错误监控、数据库备份、恢复演练和日志脱敏。
- [ ] 限制 Vercel Function 执行时间；实时音频不经过 serverless 长连接。
- [ ] 对公开用户增加分层配额、付费方案、防滥用和内容安全策略。

## 13. 公开上线前建议继续做

1. 游客账号升级/绑定邮箱或第三方登录的完整回调路由，避免清除 cookie 后丢失学习记录。
2. 每次会话结束生成学习摘要（写入 `learning_sessions`），并在复习页展示周报。
3. 基于音频置信度或专用发音评测模型做发音反馈；不要把文本纠错包装成发音评分。
4. 对话删除、单条消息删除、保留期限和自动清理任务。
5. 管理后台、用户反馈、内容安全和模型成本面板。
6. 如需企业网络兼容，增加自有 TURN 服务。
7. 多语言 UI、移动端 PWA 和推送复习提醒。

## 14. 官方资料

- 百炼 OpenAI 兼容接口：<https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope>
- Qwen-Audio-Realtime 接入：<https://help.aliyun.com/zh/model-studio/qwen-audio-realtime-model-access>
- Qwen-Audio 客户端事件：<https://help.aliyun.com/zh/model-studio/fun-audiochat-client-events>
- Qwen-Audio 服务端事件：<https://help.aliyun.com/zh/model-studio/qwen-audio-realtime-server-events>
- WebRTC 接入：<https://help.aliyun.com/zh/model-studio/realtime-webrtc-access>
- 长期记忆 API：<https://help.aliyun.com/zh/model-studio/long-term-memory-2-0>
- Supabase SSR Auth：<https://supabase.com/docs/guides/auth/server-side/nextjs>
- Vercel 环境变量：<https://vercel.com/docs/environment-variables>