// src/components/reflection-card.tsx
// 显示 Agent 的反思记录（错误模式 + 教训 + 建议）
"use client";

import { useState } from "react";
import { ChevronRight, Lightbulb, AlertTriangle } from "lucide-react";
import type { Reflection } from "@/types/agent";

export function ReflectionCard({ reflections }: { reflections: Reflection[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-violet-800/40 bg-violet-950/20 overflow-hidden w-full max-w-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-violet-950/30 transition-colors"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-violet-400 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <Lightbulb className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs font-medium text-violet-300">
          自我反思 · {reflections.length} 条记录
        </span>
      </button>

      {expanded && (
        <div className="border-t border-violet-800/30 px-3 py-2 space-y-2">
          {reflections.map((r, i) => (
            <div key={i} className="text-xs space-y-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="text-zinc-400 font-mono text-[10px]">{r.error_pattern}</span>
              </div>
              {r.lesson && <p className="text-zinc-400 pl-4">教训: {r.lesson}</p>}
              {r.suggestion && <p className="text-zinc-500 pl-4">建议: {r.suggestion}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}