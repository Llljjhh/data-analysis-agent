// src/components/thread-sidebar.tsx
"use client";

import { Plus, MessageSquare, Search } from "lucide-react";

export function ThreadSidebar() {
  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800">
      <div className="p-3 space-y-2 shrink-0">
        {/* 纯 Tailwind 按钮，摆脱 shadcn 样式冲突 */}
        <button
          className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg text-xs
                     border border-zinc-800 text-zinc-300
                     hover:bg-zinc-900 hover:border-zinc-700 hover:text-zinc-100 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建分析</span>
        </button>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input
            placeholder="搜索历史..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5
                       text-xs text-zinc-300 placeholder:text-zinc-600 outline-none
                       focus:border-zinc-600 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="px-2 py-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">今天</span>
        </div>
        {[
          { title: "销售数据分析", time: "2分钟前" },
          { title: "用户行为探索", time: "1小时前" },
        ].map((item) => (
          <button
            key={item.title}
            className="w-full flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-zinc-900 transition-colors text-left"
          >
            <MessageSquare className="w-3.5 h-3.5 text-zinc-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-zinc-300 truncate">{item.title}</p>
              <p className="text-[10px] text-zinc-600">{item.time}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="p-3 border-t border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600" />
          <span className="text-xs text-zinc-400">用户</span>
        </div>
      </div>
    </div>
  );
}