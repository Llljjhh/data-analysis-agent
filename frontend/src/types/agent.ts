// src/types/agent.ts
// 所有前后端交互涉及的数据类型定义

export interface ToolCall {
  id: string;
  name: string;                     // 工具名：execute_analysis_code 等
  input: Record<string, unknown>;   // 工具入参
  output?: string;                  // 工具返回
  status: "pending" | "running" | "completed" | "error";
  duration?: number;                // 耗时（毫秒）
}

export interface Reflection {
  error_pattern: string;   // 错误模式标签
  lesson: string;          // 教训
  issues: string[];        // 问题列表
  suggestion: string;      // 修正建议
  iteration: number;       // 第几轮反思
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  error: string | null;
  chart_path: string | null;
  chart_type: string | null;
}

export interface InterruptRequest {
  type: "approval_request";
  task_type: string;
  risk_level: string;
  reasoning: string;
  steps: string[];
  message: string;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  reflections?: Reflection[];
  execution?: ExecutionResult;
  interrupt?: InterruptRequest;
  timestamp: number;
}