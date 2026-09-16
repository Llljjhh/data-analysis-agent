"""
server.py —— FastAPI 入口
- 数据集上传
- 知识库上传/查看/清空
- NDJSON 分段流式聊天（三路由：chat / qa / analysis）
- HITL 恢复
- 图表文件获取
"""
import uuid
import json as json_lib
from pathlib import Path

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from agent.graph import create_agent
from agent.tools import inspect_dataset

app = FastAPI(title="Data Analysis Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

checkpointer = MemorySaver()
agent = create_agent(checkpointer=checkpointer)

UPLOAD_DIR = Path("workspace/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# 节点名 → 前端状态提示
NODE_LABELS = {
    "classify": "🧠 正在识别意图...",
    "retriever": "📚 正在检索知识库...",
    "chat_responder": "💬 正在回复...",
    "qa_responder": "💡 正在回答...",
    "code_generator": "✍️ 正在生成分析代码...",
    "executor": "⚙️ 正在执行代码...",
    "reflector": "🔍 正在反思结果...",
    "responder": "📝 正在生成报告...",
}


def _make_initial_state(message: str, dataset_path: str) -> dict:
    """构造初始状态，字段必须与 AnalysisState 完全对应"""
    return {
        "messages": [HumanMessage(content=message)],
        "dataset_path": dataset_path,
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


def _line(payload: dict) -> str:
    """序列化成一行 NDJSON"""
    return json_lib.dumps(payload, ensure_ascii=False) + "\n"


# ============================================================
# 数据集上传
# ============================================================
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """上传数据文件（csv/xlsx），返回数据概况"""
    file_path = UPLOAD_DIR / file.filename
    content = await file.read()
    file_path.write_bytes(content)

    summary = inspect_dataset.invoke({"dataset_path": str(file_path)})
    return {"filename": file.filename, "path": str(file_path), "summary": summary}


# ============================================================
# 知识库：上传文档
# ============================================================
@app.post("/api/upload/knowledge")
async def upload_knowledge(file: UploadFile = File(...)):
    """上传知识文档（txt / md / pdf），加入向量库"""
    from agent.rag import get_rag

    filename = file.filename or "unknown"
    suffix = Path(filename).suffix.lower()
    content = await file.read()

    knowledge_dir = Path("workspace/knowledge")
    knowledge_dir.mkdir(parents=True, exist_ok=True)
    file_path = knowledge_dir / filename
    file_path.write_bytes(content)

    try:
        if suffix in (".txt", ".md"):
            text = content.decode("utf-8", errors="ignore")
        elif suffix == ".pdf":
            from pypdf import PdfReader
            import io
            reader = PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        else:
            return {"error": f"不支持的文件类型: {suffix}，仅支持 txt/md/pdf"}

        if not text.strip():
            return {"error": "文档内容为空"}

        rag = get_rag()
        n_chunks = rag.add_text(text, source=filename)

        return {
            "status": "ok",
            "filename": filename,
            "chunks_added": n_chunks,
            "total_chunks": rag.count(),
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


# ============================================================
# 知识库：状态
# ============================================================
@app.get("/api/knowledge/stats")
async def knowledge_stats():
    """查看知识库状态"""
    from agent.rag import get_rag
    try:
        rag = get_rag()
        return {
            "total_chunks": rag.count(),
            "sources": list(set(d["source"] for d in rag.documents)),
        }
    except Exception as e:
        return {"error": str(e)}


# ============================================================
# 知识库：清空
# ============================================================
@app.post("/api/knowledge/clear")
async def knowledge_clear():
    """清空知识库"""
    from agent.rag import get_rag
    rag = get_rag()
    rag.clear()
    return {"status": "ok", "message": "知识库已清空"}


# ============================================================
# 聊天：NDJSON 分段流式
# ============================================================
@app.post("/api/chat")
@app.post("/api/chat/stream")
async def chat_stream(request: dict):
    """NDJSON 分段流式聊天接口"""
    session_id = request.get("session_id", str(uuid.uuid4()))
    message = request["message"]
    dataset_path = request.get("dataset_path", "workspace/uploads/data.csv")
    config = {"configurable": {"thread_id": session_id}}

    initial_state = _make_initial_state(message, dataset_path)

    async def event_stream():
        try:
            print(f"\n[CHAT] 用户输入: {message}", flush=True)

            async for chunk in agent.astream(
                initial_state,
                config,
                stream_mode="updates",
            ):
                if not isinstance(chunk, dict):
                    continue

                for node_name, node_output in chunk.items():
                    print(f"[NODE] {node_name}", flush=True)

                    label = NODE_LABELS.get(node_name, f"⏳ {node_name}...")
                    yield _line({"type": "status", "node": node_name, "msg": label})

                    # 代码生成 → 推送代码
                    if node_name == "code_generator" and isinstance(node_output, dict):
                        code = node_output.get("current_code", "")
                        if code:
                            yield _line({"type": "code", "code": code})

                    # 执行完成 → 推送执行结果
                    if node_name == "executor" and isinstance(node_output, dict):
                        exec_result = node_output.get("execution_result")
                        if exec_result:
                            yield _line({"type": "execution", "execution": exec_result})

                    # 反思 → 推送反思
                    if node_name == "reflector" and isinstance(node_output, dict):
                        refl = node_output.get("reflections", [])
                        if refl:
                            yield _line({"type": "reflections", "reflections": refl})

                    # 报告生成完毕 → 逐段推送（chat / qa / analysis 三种都推送）
                    if node_name in ("responder", "chat_responder", "qa_responder") \
                            and isinstance(node_output, dict):
                        report = node_output.get("final_report", "")
                        if report:
                            chunk_size = 4
                            for i in range(0, len(report), chunk_size):
                                yield _line({"type": "token", "content": report[i:i + chunk_size]})

            # 流结束，读取最终状态
            state = agent.get_state(config)
            values = state.values if state else {}

            yield _line({
                "type": "done",
                "report": values.get("final_report", ""),
                "execution": values.get("execution_result"),
                "reflections": values.get("reflections", []),
                "intent": values.get("intent"),
                "retrieved_docs": values.get("retrieved_docs") or [],
            })

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield _line({"type": "error", "error": str(e)})

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


# ============================================================
# HITL 恢复
# ============================================================
@app.post("/api/resume")
async def resume(request: dict):
    """恢复被 HITL 中断的执行"""
    session_id = request["session_id"]
    action = request.get("action", "approve")
    feedback = request.get("feedback", "")
    config = {"configurable": {"thread_id": session_id}}

    try:
        result = agent.invoke(
            Command(resume={"action": action, "feedback": feedback}),
            config,
        )
        return {
            "session_id": session_id,
            "status": "completed",
            "report": result.get("final_report", ""),
            "execution": result.get("execution_result"),
            "reflections": result.get("reflections", []),
        }
    except Exception as e:
        return {"session_id": session_id, "status": "error", "error": str(e)}


# ============================================================
# 图表文件
# ============================================================
@app.get("/api/outputs/{filename}")
async def get_output(filename: str):
    """返回生成的图表文件"""
    path = Path("workspace/outputs") / filename
    if path.exists():
        return FileResponse(path)
    return {"error": "文件不存在"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)