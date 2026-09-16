"""
nodes.py —— 带三分类意图路由 + RAG 检索的节点
意图：chat（闲聊）/ qa（知识问答）/ analysis（数据分析）
"""
import os
import json
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from .state import AnalysisState
from .prompts import (
    CODE_GENERATOR_PROMPT,
    REFLECTION_PROMPT, REPORT_PROMPT,
)
from .tools import inspect_dataset
from .rag import get_rag

# ============================================================
# 从 .env 读取配置
# ============================================================
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

API_KEY = os.getenv("DASHSCOPE_API_KEY")
BASE_URL = os.getenv("DASHSCOPE_BASE_URL")

if not API_KEY:
    raise RuntimeError(
        f"未找到 DASHSCOPE_API_KEY，请检查 {env_path} 是否存在且包含该变量"
    )

print(f"[启动] 从 {env_path} 加载 Key: {API_KEY[:15]}...", flush=True)

llm = ChatOpenAI(
    model="qwen-flash",
    api_key=API_KEY,
    base_url=BASE_URL,
    temperature=0.1,
    timeout=60,
    max_retries=1,
)

llm_fast = ChatOpenAI(
    model="qwen-flash",
    api_key=API_KEY,
    base_url=BASE_URL,
    temperature=0,
    timeout=30,
    max_retries=1,
)


# ---------- 辅助函数 ----------
def _get_data_summary(state: AnalysisState) -> str:
    """获取数据集概况（列名、类型、缺失值）"""
    path = state.get("dataset_path", "workspace/uploads/data.csv")
    result = inspect_dataset.invoke({"dataset_path": path})
    if "error" in result:
        return "暂无数据"
    summary = {
        "shape": result["shape"],
        "columns": result["columns"],
        "dtypes": result["dtypes"],
        "missing": {k: v for k, v in result["missing"].items() if v > 0},
    }
    return json.dumps(summary, ensure_ascii=False)


def _get_reflections_text(state: AnalysisState) -> str:
    """把最近几条反思拼成文本"""
    reflections = state.get("reflections", [])
    if not reflections:
        return "无历史反思记录"
    lines = []
    for r in reflections[-3:]:
        lines.append(f"- [{r.get('error_pattern', 'N/A')}] {r.get('lesson', '')}")
    return "\n".join(lines)


def _parse_json_safe(content: str):
    """容错解析 JSON"""
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(content[start:end + 1])
            except json.JSONDecodeError:
                pass
    return None


# ---------- 节点 0：意图分类（三分类）----------
def classify_node(state: AnalysisState) -> dict:
    """判断用户意图：chat / qa / analysis"""
    print("\n===== [节点] classify 开始 =====", flush=True)
    user_request = state["messages"][-1].content

    prompt = f"""判断以下用户输入属于哪种类型，只输出一个词，不要任何其他内容。

用户输入：{user_request}

判断规则：
- 打招呼、自我介绍、问你是谁、纯闲聊 → 输出 "chat"
- 询问概念定义、字段含义、业务规则、计算方式等知识性问题 → 输出 "qa"
  例如："利润率怎么算"、"sales 字段什么意思"、"华东区定位是什么"
- 要求分析数据、查询数据、画图、统计、计算具体数字 → 输出 "analysis"
  例如："计算各区域销售额"、"画个柱状图"、"华东的利润是多少"

只输出 "chat" / "qa" / "analysis"：
"""
    response = llm_fast.invoke([HumanMessage(content=prompt)])
    intent = response.content.strip().lower()

    # 兜底
    if "chat" in intent:
        intent = "chat"
    elif "qa" in intent or "question" in intent:
        intent = "qa"
    else:
        intent = "analysis"

    print(f"[classify] 意图: {intent}", flush=True)
    print("===== [节点] classify 结束 =====\n", flush=True)
    return {"intent": intent}


# ---------- 节点 0.5：知识库检索 ----------
def retriever_node(state: AnalysisState) -> dict:
    """从知识库检索相关文档片段"""
    print("\n===== [节点] retriever 开始 =====", flush=True)
    user_request = state["messages"][-1].content

    try:
        rag = get_rag()
        if rag.count() == 0:
            print("[retriever] 知识库为空，跳过检索", flush=True)
            print("===== [节点] retriever 结束 =====\n", flush=True)
            return {"retrieved_docs": []}

        docs = rag.search(user_request, top_k=3)
        print(f"[retriever] 检索到 {len(docs)} 个相关片段", flush=True)
        for d in docs:
            print(f"  - score={d['score']}  source={d['source']}  text={d['text'][:60]}...", flush=True)

        print("===== [节点] retriever 结束 =====\n", flush=True)
        return {"retrieved_docs": docs}

    except Exception as e:
        print(f"[retriever] 检索失败: {e}", flush=True)
        print("===== [节点] retriever 结束 =====\n", flush=True)
        return {"retrieved_docs": []}


# ---------- 节点 1：闲聊回复 ----------
def chat_responder_node(state: AnalysisState) -> dict:
    """闲聊时直接回答"""
    print("\n===== [节点] chat_responder 开始 =====", flush=True)
    user_request = state["messages"][-1].content

    system_prompt = """你是一个数据分析智能体，名字叫 Data Analyst Agent。

你的能力：
- 分析用户上传的数据集（当前已加载一份销售数据）
- 支持数据探索、统计计算、可视化图表生成
- 具备自我反思纠错能力
- 支持知识库检索（数据字典、业务文档）

当用户跟你闲聊时，用简洁友好的中文回应。
引导用户提出数据分析需求，比如"帮我分析各地区的销售额"。
回复不超过 100 字，不要编造数据。
"""
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_request),
    ])

    report = response.content
    print(f"[chat_responder] 回复: {report[:100]}...", flush=True)
    print("===== [节点] chat_responder 结束 =====\n", flush=True)

    return {
        "final_report": report,
        "messages": [AIMessage(content=report)],
    }


# ---------- 节点 1.5：知识问答 ----------
def qa_responder_node(state: AnalysisState) -> dict:
    """知识问答：基于检索结果直接回答，不执行代码"""
    print("\n===== [节点] qa_responder 开始 =====", flush=True)
    user_request = state["messages"][-1].content

    # 用检索结果拼上下文
    retrieved_docs = state.get("retrieved_docs") or []
    if retrieved_docs:
        context = "\n\n".join(
            f"【片段 {i+1}】来源: {d['source']}\n{d['text']}"
            for i, d in enumerate(retrieved_docs)
        )
    else:
        context = "（知识库中没有相关文档）"

    system_prompt = f"""你是数据分析知识助手。根据下面的知识库内容回答用户问题。

【知识库内容】
{context}

【回答要求】
- 用简洁的中文回答，直接回答问题本身
- 如果知识库里有明确答案，直接引用
- 如果知识库里没有，可以基于常识回答，但要说明"知识库中未找到明确说明"
- 不要编造数字、不要执行代码、不要生成表格
- 回答不超过 150 字
"""
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_request),
    ])

    report = response.content
    print(f"[qa_responder] 回答: {report[:100]}...", flush=True)
    print("===== [节点] qa_responder 结束 =====\n", flush=True)

    return {
        "final_report": report,
        "messages": [AIMessage(content=report)],
    }


# ---------- 节点 2：代码生成 ----------
def code_generator_node(state: AnalysisState) -> dict:
    """根据用户问题生成代码，并注入 RAG 检索结果"""
    print("\n===== [节点] code_generator 开始 =====", flush=True)
    user_request = state["messages"][-1].content
    data_summary = _get_data_summary(state)
    reflections = _get_reflections_text(state)

    # 把检索结果拼成文本
    retrieved_docs = state.get("retrieved_docs") or []
    if retrieved_docs:
        retrieved_context = "\n\n".join(
            f"【片段 {i+1}】来源: {d['source']}\n{d['text']}"
            for i, d in enumerate(retrieved_docs)
        )
    else:
        retrieved_context = "（无相关文档）"

    prompt = CODE_GENERATOR_PROMPT.format(
        plan=json.dumps({
            "user_request": user_request,
            "task_type": "auto",
        }, ensure_ascii=False),
        data_summary=data_summary,
        retrieved_context=retrieved_context,
        reflections=reflections,
    )

    print("[code_generator] 调用 Qwen 生成代码...", flush=True)
    response = llm.invoke([
        SystemMessage(content=prompt),
        HumanMessage(content="请生成分析代码。"),
    ])

    code = response.content
    if "```python" in code:
        code = code.split("```python")[1].split("```")[0]
    elif "```" in code:
        code = code.split("```")[1].split("```")[0]

    print(f"[code_generator] 生成 {len(code)} 字符代码", flush=True)
    print("===== [节点] code_generator 结束 =====\n", flush=True)
    return {"current_code": code.strip()}


# ---------- 节点 3：执行 ----------
def executor_node(state: AnalysisState) -> dict:
    """在沙箱里执行代码"""
    print("\n===== [节点] executor 开始 =====", flush=True)
    from .tools import execute_analysis_code
    code = state.get("current_code", "")
    result = execute_analysis_code.invoke({"code": code})
    print(f"[executor] success={result.get('success')}", flush=True)
    print("===== [节点] executor 结束 =====\n", flush=True)
    return {"execution_result": result}


# ---------- 节点 4：反思 ----------
def reflector_node(state: AnalysisState) -> dict:
    """只在失败时调用 LLM 反思"""
    print("\n===== [节点] reflector 开始 =====", flush=True)
    result = state.get("execution_result", {})
    code = state.get("current_code", "")
    count = state.get("reflection_count", 0)

    if result.get("success"):
        print("[reflector] 执行成功，跳过 LLM 反思", flush=True)
        print("===== [节点] reflector 结束 =====\n", flush=True)
        return {
            "reflections": state.get("reflections", []),
            "reflection_count": count,
        }

    print("[reflector] 执行失败，调用 Qwen 分析错误...", flush=True)
    data_summary = _get_data_summary(state)

    response = llm_fast.invoke([
        SystemMessage(content=REFLECTION_PROMPT.format(
            code=code,
            success=False,
            stdout=result.get("stdout", "")[:1500],
            error=result.get("error", "")[:1500],
            data_summary=data_summary,
        )),
        HumanMessage(content="请分析错误并给出修正建议。"),
    ])

    evaluation = _parse_json_safe(response.content)
    if evaluation is None:
        evaluation = {
            "quality": "needs_fix",
            "issues": [result.get("error", "执行失败")[:200]],
            "error_pattern": "execution_error",
            "lesson": "代码执行失败，需要修正",
            "suggestion": "根据错误信息修改代码",
        }

    new_reflection = {
        "error_pattern": evaluation.get("error_pattern", "unknown"),
        "lesson": evaluation.get("lesson", ""),
        "issues": evaluation.get("issues", []),
        "suggestion": evaluation.get("suggestion", ""),
        "iteration": count + 1,
    }
    print(f"[reflector] 错误模式: {new_reflection['error_pattern']}", flush=True)
    print("===== [节点] reflector 结束 =====\n", flush=True)

    return {
        "reflections": [new_reflection],
        "reflection_count": count + 1,
    }


# ---------- 节点 5：报告 ----------
def responder_node(state: AnalysisState) -> dict:
    """成功用模板；失败用 LLM 解释"""
    print("\n===== [节点] responder 开始 =====", flush=True)
    if state.get("final_report"):
        return {}

    result = state.get("execution_result", {})
    stdout = result.get("stdout", "").strip()
    success = result.get("success", False)
    error = result.get("error", "")

    if success and stdout:
        parts = [
            "## 分析完成 ✅",
            "",
            "**执行结果**：",
            "```",
            stdout[:2000],
            "```",
        ]
        if result.get("chart_path"):
            parts.append("")
            parts.append("**已生成图表**，请在右侧「输出」标签查看。")
        report = "\n".join(parts)

        print("[responder] 使用模板快速生成报告", flush=True)
        print("===== [节点] responder 结束 =====\n", flush=True)
        return {
            "final_report": report,
            "messages": [AIMessage(content=report)],
        }

    print("[responder] 执行失败，调用 Qwen 生成解释...", flush=True)
    reflections = state.get("reflections", [])

    fail_prompt = (
        "分析执行失败，请用中文简要说明原因和改进建议。\n\n"
        "错误信息：" + error[:1000] + "\n\n"
        "反思记录：" + json.dumps(reflections[-2:], ensure_ascii=False) + "\n\n"
        "要求：\n- 200 字以内\n- 说明失败原因\n- 给出用户能理解的建议\n"
    )

    response = llm.invoke([
        SystemMessage(content=fail_prompt),
        HumanMessage(content="请生成报告。"),
    ])

    print("[responder] 报告生成完成", flush=True)
    print("===== [节点] responder 结束 =====\n", flush=True)
    return {
        "final_report": response.content,
        "messages": [AIMessage(content=response.content)],
    }


# ---------- 路由 ----------
def route_after_classify(state: AnalysisState) -> str:
    """分类后路由：chat / qa / analysis 三分支"""
    intent = state.get("intent")
    if intent == "chat":
        return "chat"
    elif intent == "qa":
        return "qa"
    else:
        return "analysis"


def route_after_reflector(state: AnalysisState) -> str:
    """反思后：成功出报告，失败最多重试 2 次"""
    result = state.get("execution_result", {})
    count = state.get("reflection_count", 0)

    if result.get("success"):
        return "responder"

    if count < 2:
        return "code_generator"

    return "responder"