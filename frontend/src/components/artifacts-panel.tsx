// src/components/artifacts-panel.tsx
// 分析产物面板 —— 精致化升级
"use client";

import { BarChart3, Code2, Lightbulb, ImageIcon } from "lucide-react";
import { motion } from "framer-motion";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { AgentMessage } from "@/types/agent";

interface ArtifactsPanelProps {
  artifactId: string | null;
  reflections: any[];
  messages: AgentMessage[];
}

export function ArtifactsPanel({
  reflections,
  messages,
}: ArtifactsPanelProps) {
  const latestExecution = messages
    .slice()
    .reverse()
    .find((m) => m.execution)?.execution;

  const latestCode = messages
    .slice()
    .reverse()
    .find((m) => m.toolCalls?.some((tc) => tc.name === "execute_analysis_code"))
    ?.toolCalls?.find((tc) => tc.name === "execute_analysis_code")
    ?.input?.code as string | undefined;

  return (
    <div className="flex flex-col h-full bg-zinc-950/60 backdrop-blur-xl border-l border-zinc-800/50">
      {/* 顶部标题 */}
      <div className="h-14 border-b border-zinc-800/50 flex items-center px-5 shrink-0">
        <BarChart3 className="w-4 h-4 text-violet-400 mr-2" />
        <span className="text-sm font-medium text-zinc-300">分析产物</span>
      </div>

      <Tabs defaultValue="output" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-3 shrink-0">
          <TabsList className="bg-zinc-900/60 border border-zinc-800/60 w-full backdrop-blur-lg p-1 rounded-xl">
            <TabsTrigger
              value="output"
              className="text-xs flex-1 gap-1.5 rounded-lg data-[state=active]:bg-zinc-800/80 data-[state=active]:text-violet-300"
            >
              <ImageIcon className="w-3.5 h-3.5" /> 输出
            </TabsTrigger>
            <TabsTrigger
              value="code"
              className="text-xs flex-1 gap-1.5 rounded-lg data-[state=active]:bg-zinc-800/80 data-[state=active]:text-violet-300"
            >
              <Code2 className="w-3.5 h-3.5" /> 代码
            </TabsTrigger>
            <TabsTrigger
              value="reflections"
              className="text-xs flex-1 gap-1.5 rounded-lg data-[state=active]:bg-zinc-800/80 data-[state=active]:text-violet-300"
            >
              <Lightbulb className="w-3.5 h-3.5" /> 反思
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1：图表 + stdout */}
        <TabsContent
          value="output"
          className="flex-1 overflow-y-auto p-4 space-y-4 mt-0"
        >
          {latestExecution?.chart_path && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border border-zinc-800/60 overflow-hidden bg-zinc-900/40 backdrop-blur-sm shadow-lg shadow-black/20"
            >
              <img
                src={`${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"}/api/outputs/${latestExecution.chart_path
                  .split(/[/\\]/)
                  .pop()}`}
                alt="分析图表"
                className="w-full"
              />
            </motion.div>
          )}

          {latestExecution?.stdout && (
            <div>
              <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">
                标准输出
              </span>
              <pre className="mt-1.5 text-xs text-zinc-400 bg-zinc-900/60 rounded-xl p-3.5 overflow-x-auto whitespace-pre-wrap border border-zinc-800/60 leading-relaxed backdrop-blur-sm">
                {latestExecution.stdout}
              </pre>
            </div>
          )}

          {!latestExecution && (
            <EmptyState
              icon={<ImageIcon className="w-8 h-8" />}
              title="分析产物将显示在这里"
              subtitle="上传数据并提问后自动生成"
            />
          )}
        </TabsContent>

        {/* Tab 2：代码 */}
        <TabsContent
          value="code"
          className="flex-1 overflow-y-auto p-4 mt-0"
        >
          {latestCode ? (
            <pre className="text-xs text-zinc-300 bg-zinc-900/60 rounded-xl p-3.5 overflow-x-auto border border-zinc-800/60 leading-relaxed backdrop-blur-sm">
              <code>{latestCode}</code>
            </pre>
          ) : (
            <EmptyState
              icon={<Code2 className="w-8 h-8" />}
              title="生成的代码将显示在这里"
              subtitle="Agent 会自动编写 pandas 分析代码"
            />
          )}
        </TabsContent>

        {/* Tab 3：反思 */}
        <TabsContent
          value="reflections"
          className="flex-1 overflow-y-auto p-4 space-y-3 mt-0"
        >
          {reflections.length > 0 ? (
            reflections.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3 space-y-2 backdrop-blur-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                    {r.error_pattern}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    第 {r.iteration} 轮
                  </span>
                </div>
                {r.lesson && (
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {r.lesson}
                  </p>
                )}
                {r.suggestion && (
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    建议: {r.suggestion}
                  </p>
                )}
              </motion.div>
            ))
          ) : (
            <EmptyState
              icon={<Lightbulb className="w-8 h-8" />}
              title="反思记录将显示在这里"
              subtitle="Agent 自我纠错时自动生成"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}


function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-zinc-600">
      <div className="opacity-30 mb-3">{icon}</div>
      <p className="text-xs text-zinc-500">{title}</p>
      {subtitle && (
        <p className="text-[10px] text-zinc-700 mt-1">{subtitle}</p>
      )}
    </div>
  );
}