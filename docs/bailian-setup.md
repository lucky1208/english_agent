# 阿里云百炼配置指南

> 当前版本已移除 WebRTC 实时语音。下面的实时语音章节仅保留作历史参考；文字模型和长期记忆仍然适用。语音输入现在使用浏览器 `SpeechRecognition`，不需要百炼实时语音模型。

本项目的 AI 能力来自阿里云百炼（Model Studio）。文字模型和长期记忆是独立接口；地域、业务空间和 API Key 必须匹配。

> **重要：`{WorkspaceId}` 是占位符，不是字面值。**
> 在百炼控制台 → 业务空间管理 → 复制 **API Host**（例如 `llm-xxxx.cn-beijing.maas.aliyuncs.com`），
> 再拼成 `https://llm-xxxx.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime`。
> 如果 `/api/health` 显示 `bailianRealtimePlaceholder: true`，说明占位符没有替换。

## 1. 开通与获取 Workspace

1. 登录 [阿里云百炼控制台](https://bailian.console.aliyun.com/)。
2. 完成服务开通和实名认证。
3. 在左上角选择或创建一个业务空间（Workspace），记录 Workspace ID。
4. 建议先使用华北2（北京）地域。

接入域名有两种形式：

- 公共域名（简单）：`https://dashscope.aliyuncs.com`
- 业务空间专属域名（推荐用于产品）：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`

使用业务空间域名时，API Key 必须属于同一个业务空间；使用公共域名时，也必须使用对应地域的 Key。混用常见结果是 401 / 403 / 404。

## 2. 创建 API Key

1. 控制台左侧导航 → API Key。
2. 创建 API Key，关联目标业务空间。
3. 立即复制并保存。页面通常只完整显示一次。
4. 不要写进前端、Git 仓库或截图。

环境变量：

```env
DASHSCOPE_API_KEY=sk-...
```

## 3. 文本模型

本项目默认：

```env
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_TEXT_MODEL=qwen-plus
```

或使用业务空间专属兼容地址：

```env
DASHSCOPE_BASE_URL=https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
```

在控制台“模型广场 / 模型列表”确认模型已开通。`qwen-plus` 通常足够支撑“回复 + 严格 JSON 纠错 + 词汇建议”。如果你更重视质量，可换成账号当前可用的旗舰文本模型，例如 `qwen3-max`，但成本和延迟会更高。

测试文本接口：

```bash
curl https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-plus",
    "messages": [{"role": "user", "content": "Say hello in English."}]
  }'
```

## 4. 实时语音模型

本项目使用 Qwen-Audio-Realtime 的 WebRTC 接入。

```env
DASHSCOPE_REALTIME_URL=https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime
DASHSCOPE_REALTIME_MODEL=qwen-audio-3.1-realtime-plus
DASHSCOPE_REALTIME_VOICE=longanqian_v3.1
```

说明：

- `DASHSCOPE_REALTIME_URL` 只填基础地址，不要带 `?model=...`。服务端会自动追加模型参数。
- 若控制台当前给出的模型 ID 不同，以控制台为准。
- 常见音色：`longanqian_v3.1`、`longanhuan_v3.1`、`longanlingxin_v3.1`、`beth_v3.1`、`betty_v3.1` 等。仅第一次 `session.update` 可以设置音色。
- 实时模型必须在目标地域开通，且 API Key 有权限。

WebRTC 鉴权流程：

```bash
curl -X POST "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime?model=qwen-audio-3.1-realtime-plus" \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
  -H "Content-Type: application/sdp" \
  --data-binary @offer.sdp
```

成功返回 Answer SDP。浏览器端只发送 Offer 到本项目的 `/api/voice/sdp`，由服务端携带 API Key 调用百炼。

### 事件时序

```text
DataChannel open
  → session.created
  → 客户端发送 session.update
  → session.updated
  → 挂载麦克风轨道并开始说话
  → input_audio_buffer.speech_started / stopped
  → conversation.item.input_audio_transcription.completed
  → response.created
  → response.audio_transcript.delta / done
  → response.done
```

本项目使用的 `session.update`：

```json
{
  "type": "session.update",
  "session": {
    "modalities": ["text", "audio"],
    "voice": "longanqian_v3.1",
    "instructions": "你是一位英语教练……",
    "input_audio_format": "pcm",
    "output_audio_format": "pcm",
    "input_audio_transcription": { "language": "en" },
    "output_audio": { "language": "en" },
    "max_history_turns": 20,
    "turn_detection": {
      "type": "server_vad",
      "threshold": 0.55,
      "silence_duration_ms": 700
    }
  }
}
```

如果模型没有 `output_audio` / `input_audio_transcription` 能力，删除对应字段或换用支持这些字段的模型。

## 5. 长期记忆 API（可选）

控制台 → 记忆库 → 使用默认记忆库或创建新记忆库。

```env
BAILIAN_MEMORY_BASE_URL=https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/
BAILIAN_MEMORY_API_KEY=sk-...
BAILIAN_MEMORY_PROJECT_ID=english-ai-tutor
BAILIAN_MEMORY_LIBRARY_ID=
```

没有配置时，应用只使用 Supabase 中的结构化学习记录，功能不受影响。

测试写入：

```bash
curl -X POST "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/add" \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "english-mate:test-user",
    "project_id": "english-ai-tutor",
    "messages": [
      {"role": "user", "content": "I work as a product manager and want to practise meeting English."},
      {"role": "assistant", "content": "Got it. We will practise concise meeting updates."}
    ]
  }'
```

测试检索：

```bash
curl -X POST "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/memory_nodes/search" \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "english-mate:test-user",
    "project_id": "english-ai-tutor",
    "messages": [{"role": "user", "content": "What should we practise?"}],
    "top_k": 5,
    "memory_types": ["observation"]
  }'
```

注意：

- `user_id` 使用 `english-mate:{Supabase user id}` 命名空间，避免与其他应用冲突。
- 删除接口本身只认 `memory_node_id`，所以应用在删除前会先列出当前用户的记忆并校验归属。
- 记忆抽取是异步/最终一致的；刚写入的内容不一定立刻能检索到。

## 6. 跨境网络：北京 endpoint 超时

如果 Vercel 日志/页面出现：

```text
UND_ERR_CONNECT_TIMEOUT
```

说明 Vercel 函数无法连接百炼 endpoint。即使函数已经部署到香港 `hkg1`，部分网络仍无法访问北京 `*.cn-beijing.maas.aliyuncs.com`。

推荐方案：把**实时语音**切到百炼中国香港或新加坡地域。

1. 百炼控制台右上角切换地域到 **中国香港**（`cn-hongkong`）或 **新加坡**（`ap-southeast-1`）。
2. 在目标地域创建/进入业务空间，复制 **API Host**，并创建该地域的 API Key。
3. 确认目标地域的模型列表中有实时语音模型。
4. 在 Vercel 增加/修改：
   ```env
   DASHSCOPE_REALTIME_API_KEY=目标地域的 API Key
   DASHSCOPE_REALTIME_URL=https://{目标地域 API Host}/api/v1/webrtc/realtime
   DASHSCOPE_REALTIME_MODEL=该地域可用的实时语音模型
   DASHSCOPE_REALTIME_VOICE=longanqian_v3.1
   ```
5. 文字模型可以继续使用北京的 `DASHSCOPE_API_KEY` 和 `dashscope.aliyuncs.com`，两套 Key 互不影响。
6. Redeploy 后查看 `/api/health`：`bailianRealtimeKey: true`，且 `deploymentRegion` 为 `hkg1`。
7. 如果使用新加坡实时语音，可把 `vercel.json` 的 `regions` 改为 `["sin1"]` 或保留 `hkg1` 观察延迟。

如果目标地域没有实时语音模型，只能在中国大陆/香港服务器上部署一个 SDP 代理，再由 Vercel 转发到该代理。

## 7. 常见错误

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 401 / 403 | API Key 与地域/业务空间不匹配 | 用同一业务空间的 Key 和 endpoint |
| 404 | endpoint 路径错误 | 文本 `/compatible-mode/v1`；语音 `/api/v1/webrtc/realtime`；记忆 `/api/v2/apps/memory/` |
| SDP 502 | 实时模型未开通、endpoint 错误、Key 无权限 | 先在控制台确认模型可用；检查服务端日志中的 HTTP 状态 |
| 语音无声音 | 浏览器自动播放限制 | 点击页面音频控件；保持用户手势触发 |
| 语音无法建立 | 网络限制 UDP/WebRTC | 换网络；后续可配置 TURN |
| 记忆为空 | 未配置记忆 API 或模型未抽取 | 检查环境变量；多完成几轮对话后再查 |
| 生产环境 503 | 未配置 Upstash 且没有固定账户 | 配置 Upstash，或设置 `FIXED_ACCOUNT_EMAIL` 使用个人内存回退 |

## 8. 费用与配额

- 在百炼控制台设置费用预警、模型限流和每日预算。
- 本项目已做每用户每分钟限流，但公开产品还需要按套餐/额度计费。
- 语音成本通常显著高于文字；建议为免费用户限制语音时长。
- 长期记忆的 add/search 接口单独计费和限流，注意控制调用频率。