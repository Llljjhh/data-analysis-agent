"""
graph.py —— 三路由流程图
classify → chat / qa / analysis 三条分支
"""
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from .state import AnalysisState
from .nodes import (
    classify_node,
    retriever_node,
    chat_responder_node,
    qa_responder_node,
    code_generator_node,
    executor_node,
    reflector_node,
    responder_node,
    route_after_classify,
    route_after_reflector,
)


def build_graph() -> StateGraph:
    workflow = StateGraph(AnalysisState)

    # 添加节点
    workflow.add_node("classify", classify_node)
    workflow.add_node("retriever", retriever_node)
    workflow.add_node("chat_responder", chat_responder_node)
    workflow.add_node("qa_responder", qa_responder_node)
    workflow.add_node("code_generator", code_generator_node)
    workflow.add_node("executor", executor_node)
    workflow.add_node("reflector", reflector_node)
    workflow.add_node("responder", responder_node)

    # 起点 → 意图分类
    workflow.add_edge(START, "classify")

    # 三条分支
    workflow.add_conditional_edges("classify", route_after_classify, {
        "chat": "chat_responder",
        "qa": "retriever",
        "analysis": "retriever",
    })

    # chat 分支直接结束
    workflow.add_edge("chat_responder", END)

    # retriever 之后根据意图分流
    workflow.add_conditional_edges("retriever", lambda s: s.get("intent"), {
        "qa": "qa_responder",
        "analysis": "code_generator",
    })

    # qa 分支结束
    workflow.add_edge("qa_responder", END)

    # analysis 分支
    workflow.add_edge("code_generator", "executor")
    workflow.add_edge("executor", "reflector")
    workflow.add_conditional_edges("reflector", route_after_reflector, {
        "code_generator": "code_generator",
        "responder": "responder",
    })
    workflow.add_edge("responder", END)

    return workflow


def create_agent(checkpointer=None):
    if checkpointer is None:
        checkpointer = MemorySaver()
    return build_graph().compile(checkpointer=checkpointer)


agent = create_agent()