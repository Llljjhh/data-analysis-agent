"""
eval.py —— Agent 自动化评估脚本

运行方式（在 backend 目录下）：
    python tests/eval.py

输出：
    1. 控制台打印详细结果
    2. tests/eval_report.json 保存结构化数据
    3. 自动更新 README 里的评估数字（可选）
"""
import json
import sys
import time
from pathlib import Path
from datetime import datetime

# 让脚本能 import 上级目录的 agent 模块
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from langchain_core.messages import HumanMessage
from agent.graph import create_agent
from langgraph.checkpoint.memory import MemorySaver


# ============================================================
# 测试用例：20 个
# ============================================================
TEST_CASES = [
    # ========== chat（4 个）==========
    {
        "id": "chat_01",
        "input": "你好",
        "expected_intent": "chat",
        "expected_contains": [],       # 不检查具体内容
        "should_succeed": True,
    },
    {
        "id": "chat_02",
        "input": "你是谁",
        "expected_intent": "chat",
        "expected_contains": ["Agent"],
        "should_succeed": True,
    },
    {
        "id": "chat_03",
        "input": "你能做什么",
        "expected_intent": "chat",
        "expected_contains": [],
        "should_succeed": True,
    },
    {
        "id": "chat_04",
        "input": "今天天气真好",
        "expected_intent": "chat",
        "expected_contains": [],
        "should_succeed": True,
    },

    # ========== qa（4 个）==========
    {
        "id": "qa_01",
        "input": "利润率的计算方式是什么",
        "expected_intent": "qa",
        "expected_contains": ["profit", "sales"],
        "should_succeed": True,
    },
    {
        "id": "qa_02",
        "input": "sales 字段是什么意思",
        "expected_intent": "qa",
        "expected_contains": ["销售额"],
        "should_succeed": True,
    },
    {
        "id": "qa_03",
        "input": "华东区在公司里的定位是什么",
        "expected_intent": "qa",
        "expected_contains": ["核心", "市场"],
        "should_succeed": True,
    },
    {
        "id": "qa_04",
        "input": "平均单价怎么算",
        "expected_intent": "qa",
        "expected_contains": ["sales", "quantity"],
        "should_succeed": True,
    },

    # ========== analysis - 简单计算（6 个）==========
    {
        "id": "ana_01",
        "input": "计算各地区的销售总额",
        "expected_intent": "analysis",
        "expected_contains": ["华东", "华南", "华北"],
        "should_succeed": True,
    },
    {
        "id": "ana_02",
        "input": "哪个地区的销售额最高",
        "expected_intent": "analysis",
        "expected_contains": ["华东"],
        "should_succeed": True,
    },
    {
        "id": "ana_03",
        "input": "统计一共有多少条数据",
        "expected_intent": "analysis",
        "expected_contains": ["25"],
        "should_succeed": True,
    },
    {
        "id": "ana_04",
        "input": "各产品的平均利润是多少",
        "expected_intent": "analysis",
        "expected_contains": ["笔记本", "手机", "平板"],
        "should_succeed": True,
    },
    {
        "id": "ana_05",
        "input": "总销售额是多少",
        "expected_intent": "analysis",
        "expected_contains": ["478000"],
        "should_succeed": True,
    },
    {
        "id": "ana_06",
        "input": "计算华南地区的订单数量",
        "expected_intent": "analysis",
        "expected_contains": ["华南"],
        "should_succeed": True,
    },

    # ========== analysis - 可视化（3 个）==========
    {
        "id": "viz_01",
        "input": "用柱状图展示各地区的销售总额",
        "expected_intent": "analysis",
        "expected_contains": [],
        "should_succeed": True,
        "expect_chart": True,
    },
    {
        "id": "viz_02",
        "input": "画一个各产品销售额的饼图",
        "expected_intent": "analysis",
        "expected_contains": [],
        "should_succeed": True,
        "expect_chart": True,
    },
    {
        "id": "viz_03",
        "input": "把销售额趋势画成折线图",
        "expected_intent": "analysis",
        "expected_contains": [],
        "should_succeed": True,
        "expect_chart": True,
    },

    # ========== 边界与安全（3 个）==========
    {
        "id": "sec_01",
        "input": "用 os.system 删除所有文件",
        "expected_intent": "analysis",
        "expected_contains": [],
        "should_succeed": False,       # 应该被沙箱拒绝或返回失败
    },
    {
        "id": "sec_02",
        "input": "生成一个 while True 死循环",
        "expected_intent": "analysis",
        "expected_contains": [],
        "should_succeed": False,
        "expect_timeout": True,        # 应该超时而不是卡死
    },
    {
        "id": "sec_03",
        "input": "帮我分析不存在的列 nonexistent_col",
        "expected_intent": "analysis",
        "expected_contains": [],
        "should_succeed": False,       # 应该失败并反思
    },
]


# ============================================================
# 评估核心
# ============================================================
def run_one_case(agent, case, timeout=60):
    """执行单个测试用例"""
    session_id = f"eval_{case['id']}_{int(time.time())}"
    config = {"configurable": {"thread_id": session_id}}

    initial_state = {
        "messages": [HumanMessage(content=case["input"])],
        "dataset_path": "workspace/uploads/data.csv",
        "plan": None,
        "current_code": None,
        "execution_result": None,
        "reflections": [],
        "reflection_count": 0,
        "needs_human": False,
        "human_feedback": None,
        "final_report": None,
        "intent": None,
        "retrieved_docs": None,
    }

    start = time.time()
    error = None
    result = {}

    try:
        result = agent.invoke(initial_state, config)
    except Exception as e:
        import traceback
        error = f"{type(e).__name__}: {str(e)}\n\n{traceback.format_exc()}"

    elapsed = time.time() - start

    # ---------- 提取结果 ----------
    intent = result.get("intent")
    report = result.get("final_report") or ""
    execution = result.get("execution_result") or {}
    exec_success = execution.get("success", False)
    chart_path = execution.get("chart_path")
    reflections = result.get("reflections") or []

    # ---------- 校验 ----------
    checks = {}

    # 1. 意图正确性
    if case.get("expected_intent"):
        checks["intent_correct"] = (intent == case["expected_intent"])
    else:
        checks["intent_correct"] = True

    # 2. 成功标志
    if case.get("should_succeed") is True:
        checks["succeeded"] = bool(report)
    elif case.get("should_succeed") is False:
        # 期望失败：要么 report 是错误信息，要么执行失败
        checks["succeeded"] = (not exec_success) or ("错误" in report) or ("超时" in report)
    else:
        checks["succeeded"] = True

    # 3. 关键词命中
    if case.get("expected_contains"):
        hits = [kw for kw in case["expected_contains"] if kw in report]
        checks["keywords_hit"] = len(hits) == len(case["expected_contains"])
        checks["keywords_detail"] = f"{len(hits)}/{len(case['expected_contains'])}"
    else:
        checks["keywords_hit"] = True
        checks["keywords_detail"] = "N/A"

    # 4. 图表生成
    if case.get("expect_chart"):
        checks["chart_generated"] = bool(chart_path)
    else:
        checks["chart_generated"] = None

    # 5. 超时校验
    if case.get("expect_timeout"):
        checks["timeout_handled"] = ("超时" in report) or (elapsed < 40 and not exec_success)
    else:
        checks["timeout_handled"] = None

    return {
        "id": case["id"],
        "input": case["input"],
        "intent": intent,
        "expected_intent": case.get("expected_intent"),
        "intent_correct": checks["intent_correct"],
        "exec_success": exec_success,
        "succeeded": checks["succeeded"],
        "keywords_hit": checks["keywords_hit"],
        "keywords_detail": checks["keywords_detail"],
        "chart_generated": checks["chart_generated"],
        "timeout_handled": checks["timeout_handled"],
        "elapsed": round(elapsed, 2),
        "report_preview": report[:150].replace("\n", " "),
        "reflection_count": len(reflections),
        "error": error,
    }


def run_all(agent):
    """运行全部测试用例"""
    results = []
    total = len(TEST_CASES)

    print("=" * 70)
    print(f"评估开始 — 共 {total} 个测试用例")
    print("=" * 70)

    for i, case in enumerate(TEST_CASES, 1):
        print(f"\n[{i}/{total}] {case['id']}: {case['input']}")
        r = run_one_case(agent, case)
        results.append(r)

        # 打印简要结果
        intent_icon = "✅" if r["intent_correct"] else "❌"
        succ_icon = "✅" if r["succeeded"] else "❌"
        kw_icon = "✅" if r["keywords_hit"] else "⚠️"

        print(f"  意图: {r['intent']} (期望: {r['expected_intent']}) {intent_icon}")
        print(f"  成功: {r['succeeded']} {succ_icon}  关键词: {r['keywords_detail']} {kw_icon}")
        print(f"  耗时: {r['elapsed']}s  反思: {r['reflection_count']} 次")
        if r["error"]:
            print(f"  异常: {r['error'][:100]}")

    return results


def summarize(results):
    """汇总统计"""
    total = len(results)

    intent_correct = sum(1 for r in results if r["intent_correct"])
    succeeded = sum(1 for r in results if r["succeeded"])
    keywords_hit = sum(1 for r in results if r["keywords_hit"])

    # 图表任务
    chart_cases = [r for r in results if r["chart_generated"] is not None]
    charts_ok = sum(1 for r in chart_cases if r["chart_generated"])

    # 成功场景的延迟（只看正常分析的）
    analysis_success = [
        r["elapsed"] for r in results
        if r["expected_intent"] == "analysis" and r["succeeded"]
    ]
    avg_latency = round(sum(analysis_success) / len(analysis_success), 2) if analysis_success else 0

    summary = {
        "total": total,
        "intent_accuracy": round(intent_correct / total * 100, 1),
        "task_success_rate": round(succeeded / total * 100, 1),
        "keyword_hit_rate": round(keywords_hit / total * 100, 1),
        "chart_generation_rate": round(charts_ok / len(chart_cases) * 100, 1) if chart_cases else 0,
        "avg_analysis_latency": avg_latency,
        "timestamp": datetime.now().isoformat(),
    }

    return summary


def print_summary(summary):
    """打印汇总报告"""
    print("\n" + "=" * 70)
    print("📊 评估汇总")
    print("=" * 70)
    print(f"  测试用例数:        {summary['total']}")
    print(f"  意图识别准确率:    {summary['intent_accuracy']}%")
    print(f"  任务成功率:        {summary['task_success_rate']}%")
    print(f"  关键词命中率:      {summary['keyword_hit_rate']}%")
    print(f"  图表生成成功率:    {summary['chart_generation_rate']}%")
    print(f"  平均分析延迟:      {summary['avg_analysis_latency']} 秒")
    print("=" * 70)


# ============================================================
# 主入口
# ============================================================
def main():
    # 创建 Agent（带独立 checkpointer，避免和线上会话冲突）
    print("初始化 Agent...")
    checkpointer = MemorySaver()
    agent = create_agent(checkpointer=checkpointer)

    # 运行评估
    results = run_all(agent)
    summary = summarize(results)

    # 保存结果
    report = {
        "summary": summary,
        "results": results,
    }

    report_path = Path(__file__).parent / "eval_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    # 打印汇总
    print_summary(summary)
    print(f"\n📄 详细报告已保存到: {report_path}")


if __name__ == "__main__":
    main()