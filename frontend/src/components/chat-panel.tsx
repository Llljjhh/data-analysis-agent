// src/components/chat-panel.tsx
// 聊天面板 —— 动效 + 玻璃拟态升级
"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  Loader2,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Edit3,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { ToolCallCard } from "./tool-call-card";
import { ReflectionCard } from "./reflection-card";
import type { AgentMessage, InterruptRequest } from "@/types/agent";

interface ChatPanelProps {
  messages: AgentMessage[];
  isStreaming: boolean;
  onSend: (content: string) => void;
  onInterruptResponse: (
    action: "approve" | "modify" | "reject",
    feedback: string
  ) => void;
}

export function ChatPanel({
  messages,
  isStreaming,
  onSend,
  onInterruptResponse,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* 顶部状态栏 */}
      <div className="h-14 glass border-b border-zinc-800/50 flex items-center px-6 gap-3 shrink-0 z-10">
        <div className="relative">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75" />
        </div>
        <span className="text-sm font-medium text-zinc-300">
          Data Analyst Agent
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
            {isStreaming ? "思考中" : "已就绪"}
          </span>
        </div>
      </div>

      {/* 消息滚动区 */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-grid">
        <AnimatePresence mode="popLayout">
          {messages.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full text-center space-y-6"
            >
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-violet-500/30 avatar-breathing">
                  <Bot className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-4 border-zinc-950" />
              </div>

              <div className="space-y-2 max-w-md">
                <h2 className="text-2xl font-semibold text-gradient">
                  数据分析智能体
                </h2>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  用自然语言提问。我会自动规划、执行分析、反思纠错，
                  <br />
                  并在需要时请求您确认。
                </p>
              </div>

              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                  { text: "分析数据分布特征", icon: "📊" },
                  { text: "计算各维度汇总指标", icon: "🧮" },
                  { text: "生成趋势图表", icon: "📈" },
                  { text: "检测数据异常值", icon: "🔍" },
                ].map((s, i) => (
                  <motion.button
                    key={s.text}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    onClick={() => onSend(s.text)}
                    className="px-4 py-2 text-xs rounded-xl border border-zinc-800/60 bg-zinc-900/40
                               text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 hover:border-violet-500/30
                               transition-all duration-200 backdrop-blur-sm"
                  >
                    <span className="mr-1.5">{s.icon}</span>
                    {s.text}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onInterruptResponse={onInterruptResponse}
              isStreaming={isStreaming}
            />
          ))}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* 底部输入区 */}
      <div className="border-t border-zinc-800/50 p-4 shrink-0 glass">
        <div className="flex items-end gap-2 bg-zinc-900/60 backdrop-blur-xl rounded-2xl border border-zinc-800/60 p-2
                        focus-within:border-violet-500/50 focus-within:shadow-lg focus-within:shadow-violet-500/10
                        transition-all duration-200">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="描述你的分析需求..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 resize-none outline-none px-3 py-2 max-h-32"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center
                       bg-gradient-to-br from-violet-500 to-indigo-600 text-white
                       hover:from-violet-400 hover:to-indigo-500
                       disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:from-violet-500 disabled:hover:to-indigo-600
                       shadow-lg shadow-violet-500/20 transition-all duration-200
                       hover:scale-105 active:scale-95"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-2 text-center">
          按 Enter 发送 · Shift + Enter 换行
        </p>
      </div>
    </div>
  );
}


function MessageBubble({
  message,
  onInterruptResponse,
  isStreaming,
}: {
  message: AgentMessage;
  onInterruptResponse: (
    action: "approve" | "modify" | "reject",
    feedback: string
  ) => void;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex gap-3 ${isUser ? "justify-end" : ""}`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5 shadow-lg shadow-violet-500/20">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={`flex flex-col gap-2.5 max-w-[85%] ${isUser ? "items-end" : ""}`}>
        {/* 文本气泡 */}
        {message.content && (
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed backdrop-blur-lg ${
              isUser
                ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-br-md shadow-lg shadow-violet-500/20"
                : "bg-zinc-900/70 border border-zinc-800/60 text-zinc-200 rounded-bl-md"
            }`}
          >
            {isUser ? (
              message.content
            ) : (
              <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:my-2">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* 工具调用卡片 */}
        {message.toolCalls?.map((tc) => (
          <ToolCallCard key={tc.id} toolCall={tc} />
        ))}

        {/* 反思卡片 */}
        {message.reflections && message.reflections.length > 0 && (
          <ReflectionCard reflections={message.reflections} />
        )}

        {/* HITL 审批卡片 */}
        {message.interrupt && (
          <HITLCard
            interrupt={message.interrupt}
            onRespond={onInterruptResponse}
          />
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5 border border-zinc-700/50">
          <User className="w-4 h-4 text-zinc-400" />
        </div>
      )}
    </motion.div>
  );
}


function HITLCard({
  interrupt,
  onRespond,
}: {
  interrupt: InterruptRequest;
  onRespond: (
    action: "approve" | "modify" | "reject",
    feedback: string
  ) => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [mode, setMode] = useState<"view" | "edit">("view");

  const riskConfig = {
    high: {
      color: "border-red-500/40 bg-red-950/20",
      label: "高风险",
      labelColor: "bg-red-500/20 text-red-300",
    },
    medium: {
      color: "border-amber-500/40 bg-amber-950/20",
      label: "中风险",
      labelColor: "bg-amber-500/20 text-amber-300",
    },
    low: {
      color: "border-emerald-500/40 bg-emerald-950/20",
      label: "低风险",
      labelColor: "bg-emerald-500/20 text-emerald-300",
    },
  };

  const config =
    riskConfig[interrupt.risk_level as keyof typeof riskConfig] ||
    riskConfig.low;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-2xl border ${config.color} p-4 space-y-3 w-full max-w-lg backdrop-blur-lg`}
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold text-amber-200">需要确认</span>
        <span
          className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${config.labelColor} uppercase tracking-wider`}
        >
          {config.label}
        </span>
      </div>

      <p className="text-xs text-zinc-400 leading-relaxed">
        {interrupt.reasoning}
      </p>

      <div className="space-y-1.5 pt-1">
        {interrupt.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
            <span className="text-violet-400 font-mono text-[10px] shrink-0 mt-0.5">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{step}</span>
          </div>
        ))}
      </div>

      {mode === "edit" && (
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="请输入修改意见..."
          className="w-full bg-zinc-900/60 border border-zinc-700/60 rounded-lg p-2.5 text-xs text-zinc-200 resize-none outline-none focus:border-violet-500/50 transition-colors"
          rows={2}
        />
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onRespond("approve", "")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                     bg-emerald-600 hover:bg-emerald-500 text-white
                     shadow-lg shadow-emerald-500/20 transition-all duration-200
                     hover:scale-105 active:scale-95"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> 批准
        </button>
        <button
          onClick={() => {
            if (mode === "view") setMode("edit");
            else onRespond("modify", feedback);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                     border border-zinc-700/60 text-zinc-300 hover:bg-zinc-800/60
                     transition-colors"
        >
          <Edit3 className="w-3.5 h-3.5" />{" "}
          {mode === "view" ? "修改" : "提交修改"}
        </button>
        <button
          onClick={() => onRespond("reject", feedback || "用户拒绝")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                     text-red-400 hover:text-red-300 hover:bg-red-950/30
                     transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" /> 拒绝
        </button>
      </div>
    </motion.div>
  );
}