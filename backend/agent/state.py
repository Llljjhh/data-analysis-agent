"""
state.py —— 定义 Agent 的全局状态
"""
from typing import TypedDict, Annotated, List, Optional
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
import operator


class AnalysisState(TypedDict):
    """数据分析 Agent 的共享状态"""
    messages: Annotated[List[BaseMessage], add_messages]
    dataset_path: Optional[str]
    plan: Optional[dict]
    current_code: Optional[str]
    execution_result: Optional[dict]
    reflections: Annotated[List[dict], operator.add]
    reflection_count: int
    needs_human: bool
    human_feedback: Optional[str]
    final_report: Optional[str]
    intent: Optional[str]
    retrieved_docs: Optional[List[dict]]   # 新增：RAG 检索结果