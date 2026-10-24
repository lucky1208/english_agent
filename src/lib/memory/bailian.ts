type MemoryMessage = { role: "user" | "assistant"; content: string };

export type MemoryNode = {
  memory_node_id: string;
  content: string;
  memory_type?: string;
  status?: string;
  created_at?: number;
  updated_at?: number;
  project_id?: string;
};

type ListMemoryResponse = {
  memory_nodes?: MemoryNode[];
  page_num?: number;
  page_size?: number;
  total?: number;
};

function baseUrl() {
  const base = process.env.BAILIAN_MEMORY_BASE_URL?.trim();
  return base ? `${base.replace(/\/+$/, "")}/` : null;
}

function apiKey() {
  return process.env.BAILIAN_MEMORY_API_KEY?.trim() || process.env.DASHSCOPE_API_KEY?.trim() || null;
}

function userScope(userId: string) {
  return `english-mate:${userId}`;
}

function projectId() {
  return process.env.BAILIAN_MEMORY_PROJECT_ID?.trim() || "english-ai-tutor";
}

function libraryId() {
  return process.env.BAILIAN_MEMORY_LIBRARY_ID?.trim() || undefined;
}

export function isBailianMemoryConfigured() {
  return Boolean(baseUrl() && apiKey());
}

export async function searchBailianMemory(userId: string, query: string): Promise<string[]> {
  const base = baseUrl();
  const key = apiKey();
  if (!base || !key) return [];
  try {
    const response = await fetch(`${base}memory_nodes/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userScope(userId),
        project_id: projectId(),
        memory_library_id: libraryId(),
        messages: [{ role: "user", content: query.slice(0, 3000) }],
        top_k: 5,
        memory_types: ["observation"],
      }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { memory_nodes?: { content?: string }[] };
    return (data.memory_nodes ?? [])
      .map((node) => node.content)
      .filter((value): value is string => Boolean(value))
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function addBailianMemory(userId: string, messages: MemoryMessage[]) {
  const base = baseUrl();
  const key = apiKey();
  if (!base || !key || messages.length === 0) return;
  try {
    const response = await fetch(`${base}add`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userScope(userId),
        project_id: projectId(),
        memory_library_id: libraryId(),
        messages: messages.map((message) => ({ role: message.role, content: message.content.slice(0, 3000) })),
      }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!response.ok) console.error("Bailian memory ingestion failed", response.status);
  } catch (error) {
    console.error("Bailian memory ingestion error", error instanceof Error ? error.message : "unknown");
  }
}

export async function listBailianMemory(userId: string, pageNum = 1, pageSize = 50): Promise<{ memories: MemoryNode[]; total: number }> {
  const base = baseUrl();
  const key = apiKey();
  if (!base || !key) return { memories: [], total: 0 };
  const url = new URL(`${base}memory_nodes`);
  url.searchParams.set("user_id", userScope(userId));
  url.searchParams.set("project_id", projectId());
  if (libraryId()) url.searchParams.set("memory_library_id", libraryId() as string);
  url.searchParams.set("page_num", String(pageNum));
  url.searchParams.set("page_size", String(Math.min(Math.max(pageSize, 1), 100)));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Bailian memory list failed: HTTP ${response.status}`);
  const data = (await response.json()) as ListMemoryResponse;
  return {
    memories: (data.memory_nodes ?? []).filter((node) => Boolean(node.memory_node_id)),
    total: data.total ?? 0,
  };
}

export async function deleteBailianMemory(memoryNodeId: string) {
  const base = baseUrl();
  const key = apiKey();
  if (!base || !key) throw new Error("Bailian memory is not configured.");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(memoryNodeId)) throw new Error("Invalid memory node id.");
  const url = new URL(`${base}memory_nodes/${encodeURIComponent(memoryNodeId)}`);
  if (libraryId()) url.searchParams.set("memory_library_id", libraryId() as string);
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Bailian memory delete failed: HTTP ${response.status}`);
}

export async function deleteAllBailianMemory(userId: string) {
  if (!isBailianMemoryConfigured()) return 0;
  let deleted = 0;
  for (let page = 1; page <= 20; page += 1) {
    const { memories, total } = await listBailianMemory(userId, 1, 100);
    if (memories.length === 0) break;
    for (const node of memories) {
      await deleteBailianMemory(node.memory_node_id);
      deleted += 1;
    }
    if (deleted >= total) break;
  }
  return deleted;
}