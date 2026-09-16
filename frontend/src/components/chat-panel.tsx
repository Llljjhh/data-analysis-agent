// src/components/chat-panel.tsx
// 主聊天区域：消息列表 + 输入框 + HITL 审批卡片
"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, ShieldAlert, CheckCircle2, XCircle, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolCallCard } from "./tool-call-card";
import { ReflectionCard } from "./reflection-card";
import ReactMarkdown from "react-markdown";
import type { AgentMessage, InterruptRequest } from "@/types/agent";

interface ChatPanelProps {
  messages: AgentMessage[];
  isStreaming: boolean;
  onSend: (content: string) => void;
  onInterruptResponse: (action: "approve" | "modify" | "reject", feedback: string) => void;
}

export function ChatPanel({ messages, isStreaming, onSend, onInterruptResponse }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // 每次消息变化自动滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* 顶部状态栏 */}
      <div className="h-14 border-b border-zinc-800 flex items-center px-6 gap-3 shrink-0">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-sm font-medium text-zinc-400">Data Analyst Agent</span>
        <span className="text-xs text-zinc-600 ml-auto">已连接</span>
      </div>

      {/* 消息滚动区 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* 空状态：欢迎 + 示例按钮 */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-200">数据分析智能体</h2>
              <p className="text-sm text-zinc-500 mt-1 max-w-md">
                上传数据文件，用自然语言提问。我会自动规划、执行分析、反思纠错，必要时请求您确认。
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {["分析数据分布特征", "计算各维度汇总指标", "生成趋势图表", "检测数据异常值"].map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  className="px-3 py-1.5 text-xs rounded-full border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 消息列表 */}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onInterruptResponse={onInterruptResponse} />
        ))}

        {/* 加载动画 */}
        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">思考中...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 底部输入区 */}
      <div className="border-t border-zinc-800 p-4 shrink-0">
        <div className="flex items-end gap-2 bg-zinc-900 rounded-xl border border-zinc-800 p-2 focus-within:border-zinc-600 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter 发送，Shift+Enter 换行
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="描述你的分析需求..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 resize-none outline-none px-2 py-1.5 max-h-32"
          />
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 h-8 w-8 rounded-lg"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}


// 单条消息气泡
function MessageBubble({
  message,
  onInterruptResponse,
}: {
  message: AgentMessage;
  onInterruptResponse: (action: "approve" | "modify" | "reject", feedback: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      {/* 助手头像 */}
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={`flex flex-col gap-2 max-w-[85%] ${isUser ? "items-end" : ""}`}>
        {/* 文本气泡 */}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-indigo-600 text-white rounded-br-md"
              : "bg-zinc-900 text-zinc-200 rounded-bl-md border border-zinc-800"
          }`}
        >
          {isUser ? (
            message.content
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* 工具调用卡片 */}
        {message.toolCalls?.map((tc) => <ToolCallCard key={tc.id} toolCall={tc} />)}

        {/* 反思卡片 */}
        {message.reflections && message.reflections.length > 0 && (
          <ReflectionCard reflections={message.reflections} />
        )}

        {/* HITL 审批卡片 */}
        {message.interrupt && (
          <HITLCard interrupt={message.interrupt} onRespond={onInterruptResponse} />
        )}
      </div>

      {/* 用户头像 */}
      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-zinc-300" />
        </div>
      )}
    </div>
  );
}


// 人工干预审批卡片
function HITLCard({
  interrupt,
  onRespond,
}: {
  interrupt: InterruptRequest;
  onRespond: (action: "approve" | "modify" | "reject", feedback: string) => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [mode, setMode] = useState<"view" | "edit">("view");

  // 不同风险等级用不同颜色
  const riskColor =
    interrupt.risk_level === "high"
      ? "border-red-500/50 bg-red-950/30"
      : interrupt.risk_level === "medium"
      ? "border-amber-500/50 bg-amber-950/30"
      : "border-emerald-500/50 bg-emerald-950/30";

  return (
    <div className={`rounded-xl border ${riskColor} p-4 space-y-3 w-full max-w-lg`}>
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold text-amber-300">需要确认</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
          {interrupt.risk_level === "high" ? "高风险"
            : interrupt.risk_level === "medium" ? "中风险" : "低风险"}
        </span>
      </div>

      <p className="text-xs text-zinc-400">{interrupt.reasoning}</p>

      {/* 步骤列表 */}
      <div className="space-y-1">
        {interrupt.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
            <span className="text-zinc-600 shrink-0 mt-0.5">{i + 1}.</span>
            <span>{step}</span>
          </div>
        ))}
      </div>

      {/* 编辑模式：输入修改意见 */}
      {mode === "edit" && (
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="请输入修改意见..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 resize-none outline-none focus:border-zinc-500"
          rows={2}
        />
      )}

      {/* 三个操作按钮 */}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => onRespond("approve", "")}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-7">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 批准
        </Button>
        <Button size="sm" variant="outline"
          onClick={() => {
            if (mode === "view") setMode("edit");
            else onRespond("modify", feedback);
          }}
          className="text-xs h-7 border-zinc-700 text-zinc-300">
          <Edit3 className="w-3.5 h-3.5 mr-1" /> {mode === "view" ? "修改" : "提交修改"}
        </Button>
        <Button size="sm" variant="ghost"
          onClick={() => onRespond("reject", feedback || "用户拒绝")}
          className="text-xs h-7 text-red-400 hover:text-red-300 hover:bg-red-950/30">
          <XCircle className="w-3.5 h-3.5 mr-1" /> 拒绝
        </Button>
      </div>
    </div>
  );
}