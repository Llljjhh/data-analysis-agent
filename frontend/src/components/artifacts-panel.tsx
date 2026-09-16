// src/components/artifacts-panel.tsx
"use client";

import { BarChart3, Code2, Lightbulb, ImageIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AgentMessage } from "@/types/agent";

interface ArtifactsPanelProps {
  artifactId: string | null;
  reflections: any[];
  messages: AgentMessage[];
}

export function ArtifactsPanel({ artifactId, reflections, messages }: ArtifactsPanelProps) {
  const latestExecution = messages.slice().reverse().find((m) => m.execution)?.execution;

  const latestCode = messages
    .slice()
    .reverse()
    .find((m) => m.toolCalls?.some((tc) => tc.name === "execute_analysis_code"))
    ?.toolCalls?.find((tc) => tc.name === "execute_analysis_code")
    ?.input?.code as string | undefined;

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800">
      <div className="h-14 border-b border-zinc-800 flex items-center px-4 shrink-0">
        <BarChart3 className="w-4 h-4 text-zinc-500 mr-2" />
        <span className="text-sm font-medium text-zinc-400">分析产物</span>
      </div>

      <Tabs defaultValue="output" className="flex-1 flex flex-col">
        <div className="px-4 pt-3">
          <TabsList className="bg-zinc-900 border border-zinc-800 w-full">
            <TabsTrigger value="output" className="text-xs flex-1">
              <ImageIcon className="w-3.5 h-3.5 mr-1" /> 输出
            </TabsTrigger>
            <TabsTrigger value="code" className="text-xs flex-1">
              <Code2 className="w-3.5 h-3.5 mr-1" /> 代码
            </TabsTrigger>
            <TabsTrigger value="reflections" className="text-xs flex-1">
              <Lightbulb className="w-3.5 h-3.5 mr-1" /> 反思
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="output" className="flex-1 overflow-y-auto p-4 space-y-4">
          {latestExecution?.chart_path && (
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <img
                src={`http://localhost:8000/api/outputs/${latestExecution.chart_path.split(/[/\\]/).pop()}`}
                alt="分析图表"
                className="w-full"
              />
            </div>
          )}
          {latestExecution?.stdout && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-600">标准输出</span>
              <pre className="mt-1 text-xs text-zinc-400 bg-zinc-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                {latestExecution.stdout}
              </pre>
            </div>
          )}
          {!latestExecution && (
            <div className="flex flex-col items-center justify-center h-40 text-zinc-600">
              <ImageIcon className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">分析产物将显示在这里</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="code" className="flex-1 overflow-y-auto p-4">
          {latestCode ? (
            <pre className="text-xs text-zinc-300 bg-zinc-900 rounded-lg p-3 overflow-x-auto">
              <code>{latestCode}</code>
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-zinc-600">
              <Code2 className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">生成的代码将显示在这里</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="reflections" className="flex-1 overflow-y-auto p-4 space-y-3">
          {reflections.length > 0 ? (
            reflections.map((r, i) => (
              <div key={i} className="rounded-lg border border-zinc-800 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-950 text-violet-400">
                    {r.error_pattern}
                  </span>
                  <span className="text-[10px] text-zinc-600">第 {r.iteration} 轮</span>
                </div>
                {r.lesson && <p className="text-xs text-zinc-400">{r.lesson}</p>}
                {r.suggestion && <p className="text-xs text-zinc-500">建议: {r.suggestion}</p>}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-zinc-600">
              <Lightbulb className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">反思记录将显示在这里</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}