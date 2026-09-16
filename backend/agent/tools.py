"""
tools.py —— 定义 Agent 可调用的工具
新增：自动剥离代码里的 import 语句（因为库已预注入）
"""
import ast
import io
import traceback
from contextlib import redirect_stdout
from pathlib import Path

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import plotly.express as px
import plotly.graph_objects as go

from langchain_core.tools import tool


# ---------- 安全策略 ----------
ALLOWED_IMPORTS = {
    "pandas", "numpy", "matplotlib", "plotly",
    "seaborn", "scipy", "sklearn",
    "math", "statistics", "json", "datetime", "collections",
    "re", "time", "itertools", "functools", "random",
    "decimal", "fractions", "operator", "string", "textwrap",
    "warnings", "typing",
}

FORBIDDEN_NAMES = {
    "exec", "eval", "compile", "__import__",
    "open", "input", "exit", "quit",
    "globals", "locals",
    "os", "sys", "subprocess", "shutil", "socket",
    "requests", "importlib", "ctypes", "pickle",
}

MAX_OUTPUT_LENGTH = 5000


class _ImportStripper(ast.NodeTransformer):
    """AST 变换器：删除所有 import 语句"""
    def visit_Import(self, node):
        return None

    def visit_ImportFrom(self, node):
        return None


def _strip_imports(code: str) -> str:
    """
    用 AST 把代码里所有的 import / from-import 语句删掉
    因为 pd/np/plt/px/go 等已经在 local_vars 里预注入了
    """
    try:
        tree = ast.parse(code)
        tree = _ImportStripper().visit(tree)
        ast.fix_missing_locations(tree)
        return ast.unparse(tree)
    except Exception:
        # 如果 AST 处理失败，直接返回原代码（安全检查会兜底）
        return code


def _validate_code(code: str):
    """静态检查代码安全性（检查未剥离 import 前的原始代码）"""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return False, f"语法错误: {e}"

    for node in ast.walk(tree):
        # import 检查
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in ALLOWED_IMPORTS:
                    return False, f"禁止导入: {root}"
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                root = node.module.split(".")[0]
                if root not in ALLOWED_IMPORTS:
                    return False, f"禁止导入: {root}"
        # 危险函数调用
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in FORBIDDEN_NAMES:
                    return False, f"禁止调用: {node.func.id}"
        # 危险属性访问
        elif isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Name):
                if node.value.id in FORBIDDEN_NAMES:
                    return False, f"禁止访问: {node.value.id}"

    return True, "OK"


@tool
def execute_analysis_code(code: str) -> dict:
    """
    执行数据分析 Python 代码。
    可用库：pandas（pd）、numpy（np）、matplotlib.pyplot（plt）、
    plotly.express（px）、plotly.graph_objects（go）、seaborn（sns）。
    代码里请用 print() 输出结果，用 plt.savefig 保存图表。
    """
    # 1. 安全检查（在剥离 import 之前检查，防止恶意 import）
    is_safe, msg = _validate_code(code)
    if not is_safe:
        return {
            "success": False, "stdout": "",
            "error": f"安全检查未通过: {msg}",
            "chart_path": None, "chart_type": None,
        }

    # 2. 剥离所有 import 语句（因为库已经预注入到 local_vars）
    code = _strip_imports(code)
    print(f"[executor] 剥离 import 后的代码:\n{code[:500]}\n", flush=True)

    # 3. 准备输出目录
    output_dir = Path("workspace/outputs")
    output_dir.mkdir(parents=True, exist_ok=True)

    # 4. 构造执行环境
    local_vars = {
        "pd": pd, "np": np, "plt": plt, "px": px, "go": go, "print": print,
        # 补充常用别名，防止 LLM 生成代码里引用 sns
        "sns": __import__("seaborn"),
        "__builtins__": {
            "print": print, "len": len, "range": range,
            "int": int, "float": float, "str": str,
            "list": list, "dict": dict, "tuple": tuple, "set": set,
            "bool": bool, "min": min, "max": max, "sum": sum,
            "abs": abs, "round": round, "sorted": sorted,
            "enumerate": enumerate, "zip": zip,
            "isinstance": isinstance, "type": type,
            "True": True, "False": False, "None": None,
        },
    }

    # 5. 自动加载数据为 df
    dataset_path = Path("workspace/uploads/data.csv")
    if dataset_path.exists():
        local_vars["df"] = pd.read_csv(dataset_path)
    elif Path("workspace/uploads/data.xlsx").exists():
        local_vars["df"] = pd.read_excel("workspace/uploads/data.xlsx")

    # 6. 清理旧图表
    for old_chart in output_dir.glob("chart_*"):
        old_chart.unlink(missing_ok=True)

    stdout_buffer = io.StringIO()
    chart_path = None
    chart_type = None

    try:
        with redirect_stdout(stdout_buffer):
            exec(code, local_vars)

        # 检查 matplotlib 图表
        if plt.get_fignums():
            chart_path = str(output_dir / "chart_matplotlib.png")
            plt.savefig(chart_path, dpi=150, bbox_inches="tight")
            plt.close("all")
            chart_type = "matplotlib"

        # 检查 plotly HTML
        for f in output_dir.glob("*.html"):
            if f.name.startswith("chart"):
                chart_path = str(f)
                chart_type = "plotly"

        return {
            "success": True,
            "stdout": stdout_buffer.getvalue()[:MAX_OUTPUT_LENGTH],
            "error": None,
            "chart_path": chart_path,
            "chart_type": chart_type,
        }

    except Exception as e:
        error_trace = traceback.format_exc()
        return {
            "success": False,
            "stdout": stdout_buffer.getvalue()[:MAX_OUTPUT_LENGTH],
            "error": f"{type(e).__name__}: {str(e)}\n\n{error_trace[-1500:]}",
            "chart_path": None,
            "chart_type": None,
        }


@tool
def inspect_dataset(dataset_path: str = "workspace/uploads/data.csv") -> dict:
    """检查数据集概况"""
    path = Path(dataset_path)
    if not path.exists():
        return {"error": f"文件不存在: {dataset_path}"}

    try:
        if path.suffix == ".csv":
            df = pd.read_csv(path)
        elif path.suffix in (".xlsx", ".xls"):
            df = pd.read_excel(path)
        else:
            return {"error": f"不支持的文件格式: {path.suffix}"}

        return {
            "shape": list(df.shape),
            "columns": list(df.columns),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
            "missing": df.isnull().sum().to_dict(),
            "describe": df.describe(include="all").to_dict(),
            "sample": df.head(5).to_dict(orient="records"),
        }
    except Exception as e:
        return {"error": str(e)}


@tool
def search_web(query: str) -> str:
    """联网搜索"""
    try:
        from duckduckgo_search import DDGS
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=5):
                results.append(f"- {r['title']}: {r['body']}")
        return "\n".join(results) if results else "未找到相关结果。"
    except Exception as e:
        return f"搜索失败: {e}"


ALL_TOOLS = [execute_analysis_code, inspect_dataset, search_web]