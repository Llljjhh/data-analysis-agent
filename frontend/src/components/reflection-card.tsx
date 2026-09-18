// src/components/reflection-card.tsx
// 反思卡片 —— 默认折叠 + 动效
"use client";

import { useState } from "react";
import { ChevronRight, Lightbulb, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Reflection } from "@/types/agent";

export function ReflectionCard({ reflections }: { reflections: Reflection[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-violet-800/30 bg-violet-950/10 overflow-hidden w-full max-w-lg backdrop-blur-sm"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-violet-950/20 transition-colors"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-violet-400 transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <Lightbulb className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs font-medium text-violet-300">
          自我反思 · {reflections.length} 条记录
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-violet-800/20 overflow-hidden"
          >
            <div className="px-3 py-2.5 space-y-3">
              {reflections.map((r, i) => (
                <div key={i} className="text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span className="text-violet-300 font-mono text-[10px] bg-violet-500/10 px-1.5 py-0.5 rounded">
                      {r.error_pattern}
                    </span>
                  </div>
                  {r.lesson && (
                    <p className="text-zinc-400 pl-4.5 leading-relaxed">
                      教训: {r.lesson}
                    </p>
                  )}
                  {r.suggestion && (
                    <p className="text-zinc-500 pl-4.5 leading-relaxed">
                      建议: {r.suggestion}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}