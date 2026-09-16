// src/components/tool-call-card.tsx
// 显示 Agent 调用某个工具的过程，可折叠展开
"use client";

import { useState } from "react";
import { ChevronRight, Loader2, CheckCircle2, XCircle, Terminal } from "lucide-react";
import type { ToolCall } from "@/types/agent";

// 工具名 → 中文标签映射
const TOOL_LABELS: Record<string, string> = {
  execute_analysis_code: "执行分析代码",
  inspect_dataset: "检查数据集",
  search_web: "联网搜索",
};

export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  // 根据状态显示不同图标
  const statusIcon =
    toolCall.status === "running" ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
    ) : toolCall.status === "error" ? (
      <XCircle className="w-3.5 h-3.5 text-red-400" />
    ) : (
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
    );

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden w-full max-w-lg">
      {/* 折叠头：点击展开/收起 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/50 transition-colors"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <Terminal className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-300">
          {TOOL_LABELS[toolCall.name] || toolCall.name}
        </span>
        <span className="ml-auto flex items-center gap-1.5">{statusIcon}</span>
      </button>

      {/* 展开后的详细内容 */}
      {expanded && (
        <div className="border-t border-zinc-800 px-3 py-2 space-y-2">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">参数</span>
            <pre className="mt-1 text-[11px] text-zinc-400 bg-zinc-950 rounded p-2 overflow-x-auto">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.output && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-600">结果</span>
              <pre className="mt-1 text-[11px] text-zinc-400 bg-zinc-950 rounded p-2 overflow-x-auto max-h-40">
                {toolCall.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}