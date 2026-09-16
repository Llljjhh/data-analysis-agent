// src/components/workbench.tsx
// NDJSON 分段流式解析
"use client";

import { useState, useRef, useCallback } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ThreadSidebar } from "./thread-sidebar";
import { ChatPanel } from "./chat-panel";
import { ArtifactsPanel } from "./artifacts-panel";
import type { AgentMessage } from "@/types/agent";

const API_BASE = "http://localhost:8000";

export function Workbench() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [reflections, setReflections] = useState<any[]>([]);
  const sessionIdRef = useRef(crypto.randomUUID());

  const sendMessage = useCallback(async (content: string) => {
    // 显示用户消息
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content, timestamp: Date.now() },
    ]);

    // 添加空的助手消息
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

          // 状态提示（显示在助手气泡内容里）
          if (data.type === "status") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: m.content
                        ? m.content  // 已有内容时不覆盖
                        : data.msg,  // 首次显示状态
                    }
                  : m
              )
            );
          }
          // 代码推送
          else if (data.type === "code") {
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
          }
          // 执行结果推送
          else if (data.type === "execution") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: (m.toolCalls || []).map((tc) =>
                        tc.name === "execute_analysis_code"
                          ? {
                              ...tc,
                              output: data.execution?.stdout || data.execution?.error || "",
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
            if (data.execution?.chart_path) setArtifactId(data.execution.chart_path);
          }
          // 反思推送
          else if (data.type === "reflections") {
            setReflections(data.reflections);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, reflections: data.reflections } : m
              )
            );
          }
          // 逐段推送的报告文本
          else if (data.type === "token") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      // 如果当前内容是状态提示，则替换；否则追加
                      ...m,
                      content: m.content.startsWith("🧠") ||
                               m.content.startsWith("💬") ||
                               m.content.startsWith("✍️") ||
                               m.content.startsWith("⚙️") ||
                               m.content.startsWith("🔍") ||
                               m.content.startsWith("📝")
                        ? data.content
                        : m.content + data.content,
                    }
                  : m
              )
            );
          }
          // 完成
          else if (data.type === "done") {
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
            if (data.execution?.chart_path) setArtifactId(data.execution.chart_path);
            if (data.reflections?.length) setReflections(data.reflections);
          }
          // 错误
          else if (data.type === "error") {
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

        if (data.execution?.chart_path) setArtifactId(data.execution.chart_path);
        if (data.reflections?.length) setReflections(data.reflections);
      } catch (err) {
        console.error("恢复失败:", err);
      }
    },
    []
  );

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden flex">
      <div className="w-[260px] shrink-0">
        <ThreadSidebar />
      </div>

      <div className="flex-1 min-w-0">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={64} minSize={40}>
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              onSend={sendMessage}
              onInterruptResponse={handleInterruptResponse}
            />
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-zinc-800" />

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