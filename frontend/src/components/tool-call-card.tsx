// src/components/tool-call-card.tsx
// 工具调用卡片 —— 默认折叠 + 动效
"use client";

import { useState } from "react";
import {
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Terminal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ToolCall } from "@/types/agent";

const TOOL_LABELS: Record<string, string> = {
  execute_analysis_code: "执行分析代码",
  inspect_dataset: "检查数据集",
  search_web: "联网搜索",
};

export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon =
    toolCall.status === "running" ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
    ) : toolCall.status === "error" ? (
      <XCircle className="w-3.5 h-3.5 text-red-400" />
    ) : (
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
    );

  const statusColor =
    toolCall.status === "running"
      ? "border-amber-500/30 bg-amber-950/10"
      : toolCall.status === "error"
      ? "border-red-500/30 bg-red-950/10"
      : "border-zinc-800/60 bg-zinc-900/40";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border ${statusColor} overflow-hidden w-full max-w-lg backdrop-blur-sm transition-colors`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/30 transition-colors"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <Terminal className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-300">
          {TOOL_LABELS[toolCall.name] || toolCall.name}
        </span>
        <span className="ml-auto flex items-center gap-2">{statusIcon}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-zinc-800/50 overflow-hidden"
          >
            <div className="px-3 py-2.5 space-y-3">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">
                  参数
                </span>
                <pre className="mt-1.5 text-[11px] text-zinc-400 bg-zinc-950/60 rounded-lg p-2.5 overflow-x-auto border border-zinc-800/50 leading-relaxed">
                  {JSON.stringify(toolCall.input, null, 2)}
                </pre>
              </div>
              {toolCall.output && (
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">
                    结果
                  </span>
                  <pre className="mt-1.5 text-[11px] text-zinc-400 bg-zinc-950/60 rounded-lg p-2.5 overflow-x-auto max-h-40 border border-zinc-800/50 leading-relaxed">
                    {toolCall.output}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}