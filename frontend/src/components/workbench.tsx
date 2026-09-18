// src/components/workbench.tsx
// 三栏布局主界面 —— 玻璃拟态升级版
"use client";

import { useState, useRef, useCallback } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ThreadSidebar } from "./thread-sidebar";
import { ChatPanel } from "./chat-panel";
import { ArtifactsPanel } from "./artifacts-panel";
import type { AgentMessage } from "@/types/agent";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export function Workbench() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [reflections, setReflections] = useState<any[]>([]);
  const sessionIdRef = useRef(crypto.randomUUID());

  const sendMessage = useCallback(async (content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content, timestamp: Date.now() },
    ]);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
    ]);
    setIsStreaming(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          message: content,
        }),
      });

      if (!res.body) throw new Error("响应为空");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let data: any;
          try {
            data = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (data.type === "status") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content ? m.content : data.msg }
                  : m
              )
            );
          } else if (data.type === "code") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: [
                        ...(m.toolCalls || []),
                        {
                          id: "code-" + Date.now(),
                          name: "execute_analysis_code",
                          input: { code: data.code },
                          status: "running" as const,
                        },
                      ],
                    }
                  : m
              )
            );
          } else if (data.type === "execution") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: (m.toolCalls || []).map((tc) =>
                        tc.name === "execute_analysis_code"
                          ? {
                              ...tc,
                              output:
                                data.execution?.stdout ||
                                data.execution?.error ||
                                "",
                              status: data.execution?.success
                                ? ("completed" as const)
                                : ("error" as const),
                            }
                          : tc
                      ),
                      execution: data.execution,
                    }
                  : m
              )
            );
            if (data.execution?.chart_path)
              setArtifactId(data.execution.chart_path);
          } else if (data.type === "reflections") {
            setReflections(data.reflections);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, reflections: data.reflections }
                  : m
              )
            );
          } else if (data.type === "token") {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const isStatusMsg =
                  m.content.startsWith("🧠") ||
                  m.content.startsWith("📚") ||
                  m.content.startsWith("💬") ||
                  m.content.startsWith("💡") ||
                  m.content.startsWith("✍️") ||
                  m.content.startsWith("⚙️") ||
                  m.content.startsWith("🔍") ||
                  m.content.startsWith("📝");
                return {
                  ...m,
                  content: isStatusMsg ? data.content : m.content + data.content,
                };
              })
            );
          } else if (data.type === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: data.report || m.content,
                      execution: data.execution,
                      reflections: data.reflections,
                    }
                  : m
              )
            );
            if (data.execution?.chart_path)
              setArtifactId(data.execution.chart_path);
            if (data.reflections?.length) setReflections(data.reflections);
          } else if (data.type === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: `❌ 错误：${data.error}` }
                  : m
              )
            );
          }
        }
      }
    } catch (err) {
      console.error("流式请求失败:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "assistant" && m.content === ""
            ? { ...m, content: `❌ 请求失败: ${err}` }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, []);

  const handleInterruptResponse = useCallback(
    async (action: "approve" | "modify" | "reject", feedback: string) => {
      try {
        const res = await fetch(`${API_BASE}/api/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            action,
            feedback,
          }),
        });
        const data = await res.json();

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              interrupt: undefined,
              content: data.report || last.content,
              execution: data.execution,
              reflections: data.reflections,
            },
          ];
        });

        if (data.execution?.chart_path)
          setArtifactId(data.execution.chart_path);
        if (data.reflections?.length) setReflections(data.reflections);
      } catch (err) {
        console.error("恢复失败:", err);
      }
    },
    []
  );

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden flex relative">
      {/* 背景装饰：微妙的径向光晕 */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      {/* 左侧栏：玻璃拟态 */}
      <div className="w-[260px] shrink-0 glass-panel border-r border-zinc-800/50 z-10">
        <ThreadSidebar />
      </div>

      {/* 右侧：聊天 + 产物 */}
      <div className="flex-1 min-w-0 z-10">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={64} minSize={40}>
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              onSend={sendMessage}
              onInterruptResponse={handleInterruptResponse}
            />
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="bg-zinc-800/50 hover:bg-violet-500/50 transition-colors"
          />

          <ResizablePanel defaultSize={36} minSize={20}>
            <ArtifactsPanel
              artifactId={artifactId}
              reflections={reflections}
              messages={messages}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}