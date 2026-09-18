"""
tools.py —— 沙箱执行工具（子进程隔离 + 超时保护 + UTF-8 编码修复）
核心思路：
1. 主进程做 AST 静态检查 + 剥离 import
2. 用户代码写入临时文件，通过 subprocess 在独立子进程中执行
3. 子进程加 30 秒超时，超时直接 kill
4. 结果通过特殊标记从 stdout 传回
5. 强制子进程 UTF-8 编码，解决 Windows 中文乱码
"""
import ast
import os
import sys
import json
import shutil
import subprocess
import tempfile
from string import Template
from pathlib import Path

from langchain_core.tools import tool


# ============================================================
# 安全策略
# ============================================================
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
EXECUTION_TIMEOUT = 30          # 秒
RESULT_MARKER = "__RESULT_JSON__"


# ============================================================
# AST 处理
# ============================================================
class _ImportStripper(ast.NodeTransformer):
    """AST 变换器：删除所有 import 语句"""
    def visit_Import(self, node):
        return None

    def visit_ImportFrom(self, node):
        return None


def _strip_imports(code: str) -> str:
    """剥离代码里所有 import（库已预注入）"""
    try:
        tree = ast.parse(code)
        tree = _ImportStripper().visit(tree)
        ast.fix_missing_locations(tree)
        return ast.unparse(tree)
    except Exception:
        return code


def _validate_code(code: str):
    """AST 静态检查代码安全性"""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return False, f"语法错误: {e}"

    for node in ast.walk(tree):
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
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in FORBIDDEN_NAMES:
                    return False, f"禁止调用: {node.func.id}"
        elif isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Name):
                if node.value.id in FORBIDDEN_NAMES:
                    return False, f"禁止访问: {node.value.id}"
    return True, "OK"


# ============================================================
# 子进程 Runner 模板
# 用 string.Template 避免和 JSON 花括号冲突
# ============================================================
_RUNNER_TEMPLATE = Template('''# -*- coding: utf-8 -*-
"""自动生成的沙箱执行器（子进程）"""
import sys
import io
import os
import json
import traceback
from contextlib import redirect_stdout

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import plotly.express as px
import plotly.graph_objects as go

# 中文字体配置
plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS']
plt.rcParams['axes.unicode_minus'] = False

# 加载数据
DATA_PATH = r"$DATA_PATH"
df = None
if DATA_PATH and os.path.exists(DATA_PATH):
    try:
        df = pd.read_csv(DATA_PATH)
    except Exception:
        try:
            df = pd.read_excel(DATA_PATH)
        except Exception:
            df = None

# 读取用户代码
USER_CODE_PATH = r"$USER_CODE_PATH"
with open(USER_CODE_PATH, "r", encoding="utf-8") as _f:
    user_code = _f.read()

# 结果容器
result = {
    "success": True,
    "error": None,
    "chart_path": None,
    "chart_type": None,
}

stdout_buffer = io.StringIO()

try:
    with redirect_stdout(stdout_buffer):
        exec(compile(user_code, "<user_code>", "exec"), globals())
except Exception as e:
    result["success"] = False
    result["error"] = f"{type(e).__name__}: {str(e)}\\n\\n" + traceback.format_exc()[-1500:]

# 保存 matplotlib 图表
try:
    if plt.get_fignums():
        CHART_PATH = r"$CHART_PATH"
        plt.savefig(CHART_PATH, dpi=150, bbox_inches="tight")
        plt.close("all")
        result["chart_path"] = CHART_PATH
        result["chart_type"] = "matplotlib"
except Exception:
    pass

# 收集 stdout
result["stdout"] = stdout_buffer.getvalue()[:$MAX_OUTPUT]

# 用特殊标记把结果写到真正的 stdout
print("$RESULT_MARKER" + json.dumps(result, ensure_ascii=False))
''')


# ============================================================
# 主工具：execute_analysis_code
# ============================================================
@tool
def execute_analysis_code(code: str) -> dict:
    """
    执行数据分析 Python 代码（子进程隔离 + 超时保护）。

    可用库：pandas（pd）、numpy（np）、matplotlib.pyplot（plt）、
    plotly.express（px）、plotly.graph_objects（go）、seaborn（sns）。
    代码里请用 print() 输出结果；图表用 plt 绘制即可（系统自动保存）。

    参数:
        code: 要执行的 Python 代码字符串

    返回:
        dict: {success, stdout, error, chart_path, chart_type}
    """
    # ---------- 1. 安全检查 ----------
    is_safe, msg = _validate_code(code)
    if not is_safe:
        return {
            "success": False,
            "stdout": "",
            "error": f"安全检查未通过: {msg}",
            "chart_path": None,
            "chart_type": None,
        }

    # ---------- 2. 剥离 import ----------
    stripped_code = _strip_imports(code)

    # ---------- 3. 准备路径 ----------
    workspace = Path("workspace")
    output_dir = workspace / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)

    # 优先 csv，其次 xlsx
    data_path = workspace / "uploads" / "data.csv"
    if not data_path.exists():
        alt = workspace / "uploads" / "data.xlsx"
        if alt.exists():
            data_path = alt
    data_path_abs = str(data_path.resolve()) if data_path.exists() else ""

    # 清理旧图表
    for old_chart in output_dir.glob("chart_*"):
        old_chart.unlink(missing_ok=True)

    # ---------- 4. 用临时目录执行 ----------
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        user_code_file = tmpdir_path / "user_code.py"
        runner_file = tmpdir_path / "runner.py"
        chart_file = tmpdir_path / "chart.png"

        # 写入用户代码
        user_code_file.write_text(stripped_code, encoding="utf-8")

        # 生成 runner
        runner_code = _RUNNER_TEMPLATE.substitute(
            DATA_PATH=data_path_abs,
            USER_CODE_PATH=str(user_code_file),
            CHART_PATH=str(chart_file),
            MAX_OUTPUT=MAX_OUTPUT_LENGTH,
            RESULT_MARKER=RESULT_MARKER,
        )
        runner_file.write_text(runner_code, encoding="utf-8")

        # ---------- 5. 子进程执行（带超时 + UTF-8 编码）----------
        # 关键：强制子进程用 UTF-8，解决 Windows 下中文乱码
        child_env = os.environ.copy()
        child_env["PYTHONIOENCODING"] = "utf-8"
        child_env["PYTHONUTF8"] = "1"

        try:
            proc = subprocess.run(
                [sys.executable, str(runner_file)],
                capture_output=True,
                timeout=EXECUTION_TIMEOUT,
                encoding="utf-8",
                errors="ignore",
                env=child_env,
            )
        except subprocess.TimeoutExpired:
            # 超时：kill 子进程，返回友好提示
            return {
                "success": False,
                "stdout": "",
                "error": (
                    f"⏱️ 代码执行超时（超过 {EXECUTION_TIMEOUT} 秒）。\n"
                    f"可能原因：代码中存在死循环、处理数据量过大、或计算复杂度过高。\n"
                    f"建议：检查循环结构，或对数据采样后再分析。"
                ),
                "chart_path": None,
                "chart_type": None,
            }

        # ---------- 6. 解析子进程输出 ----------
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""

        if RESULT_MARKER in stdout:
            # 提取标记之后的 JSON
            json_part = stdout.split(RESULT_MARKER, 1)[1].strip()
            try:
                result = json.loads(json_part)
            except json.JSONDecodeError as e:
                result = {
                    "success": False,
                    "stdout": "",
                    "error": f"无法解析执行结果: {e}\n原始输出: {stdout[-800:]}",
                    "chart_path": None,
                    "chart_type": None,
                }
        else:
            # 子进程崩溃（没有输出标记）
            result = {
                "success": False,
                "stdout": stdout[-1000:] if stdout else "",
                "error": (
                    f"子进程异常退出（returncode={proc.returncode}）。\n"
                    f"stderr:\n{stderr[-1500:]}"
                ),
                "chart_path": None,
                "chart_type": None,
            }

        # ---------- 7. 把图表从临时目录搬到 workspace/outputs ----------
        if result.get("chart_path") and chart_file.exists():
            final_chart = output_dir / "chart_matplotlib.png"
            shutil.copy(str(chart_file), str(final_chart))
            result["chart_path"] = str(final_chart)

    return result


# ============================================================
# 其他工具
# ============================================================
@tool
def inspect_dataset(dataset_path: str = "workspace/uploads/data.csv") -> dict:
    """检查数据集概况"""
    import pandas as pd

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