// src/components/thread-sidebar.tsx
// 左侧会话历史栏 —— 精致化升级
"use client";

import { Plus, MessageSquare, Search, Settings, Sparkles } from "lucide-react";

export function ThreadSidebar() {
  const threads = [
    { title: "销售数据分析", time: "2 分钟前", active: true },
    { title: "用户行为探索", time: "1 小时前", active: false },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* 顶部品牌区 */}
      <div className="p-4 pb-3 shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gradient">
            Data Analyst
          </span>
        </div>

        <button
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium
                     bg-gradient-to-br from-violet-500 to-indigo-600 text-white
                     hover:from-violet-400 hover:to-indigo-500
                     shadow-lg shadow-violet-500/20
                     transition-all duration-200 hover:shadow-violet-500/30"
        >
          <Plus className="w-3.5 h-3.5" />
          新建分析
        </button>

        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            placeholder="搜索历史..."
            className="w-full bg-zinc-900/60 border border-zinc-800/60 rounded-lg pl-9 pr-3 py-2
                       text-xs text-zinc-300 placeholder:text-zinc-600 outline-none
                       focus:border-violet-500/50 focus:bg-zinc-900/80
                       transition-all duration-200"
          />
        </div>
      </div>

      {/* 分隔线 */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-zinc-800/60 to-transparent" />

      {/* 历史列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="px-2 py-1 mb-1">
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">
            今天
          </span>
        </div>

        {threads.map((item) => (
          <button
            key={item.title}
            className={`group w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg mb-0.5 text-left
              transition-all duration-150
              ${
                item.active
                  ? "bg-zinc-800/60 border border-zinc-700/50"
                  : "hover:bg-zinc-900/60 border border-transparent hover:border-zinc-800/50"
              }`}
          >
            <MessageSquare
              className={`w-3.5 h-3.5 mt-0.5 shrink-0 transition-colors ${
                item.active
                  ? "text-violet-400"
                  : "text-zinc-600 group-hover:text-zinc-400"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs truncate transition-colors ${
                  item.active ? "text-zinc-100" : "text-zinc-400 group-hover:text-zinc-200"
                }`}
              >
                {item.title}
              </p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{item.time}</p>
            </div>
            {item.active && (
              <div className="w-1 h-1 rounded-full bg-violet-400 mt-1.5 shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* 底部用户信息 */}
      <div className="p-3 shrink-0 border-t border-zinc-800/50">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-900/60 transition-colors cursor-pointer">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/20">
            <span className="text-[10px] font-bold text-white">U</span>
          </div>
          <span className="text-xs text-zinc-400 flex-1">用户</span>
          <Settings className="w-3.5 h-3.5 text-zinc-600 hover:text-zinc-400 transition-colors" />
        </div>
      </div>
    </div>
  );
}