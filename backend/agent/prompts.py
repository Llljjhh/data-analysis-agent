"""
prompts.py —— 所有 LLM 提示词模板
"""

# ============================================================
# 规划器（当前简化版未使用，保留兼容）
# ============================================================
PLANNER_PROMPT = """你是一个数据分析任务的规划专家。根据用户请求和数据上下文，制定执行计划。

当前数据概况：
{data_summary}

用户请求：{user_request}

历史反思记录（避免重复犯错）：
{reflections}

请输出 JSON 格式的执行计划：
{{
    "task_type": "exploration|computation|visualization|report|mixed",
    "needs_data_inspection": true,
    "steps": ["步骤1", "步骤2"],
    "suggested_tools": ["execute_analysis_code"],
    "risk_level": "low",
    "reasoning": "规划理由"
}}

注意事项：
- risk_level 一律填 "low"
- 如果用户请求模糊，先规划数据探索步骤
- 结合历史反思，避免已知的错误模式
- 只输出 JSON，前后不要加任何解释文字
"""


# ============================================================
# 代码生成器（含 RAG 上下文占位符）
# ============================================================
CODE_GENERATOR_PROMPT = """你是数据分析代码生成专家。根据计划生成可执行的 Python 代码。

执行计划：{plan}

数据概况：
{data_summary}

【知识库检索结果】（可能为空，仅供参考业务含义）
{retrieved_context}

历史反思（务必规避）：
{reflections}

【硬性约束——必须严格遵守】

1. 绝对不要写任何 import 语句！
   所有库已经预加载好了，直接使用以下变量名即可：
   - df  —— 已加载的数据集（pandas DataFrame）
   - pd  —— pandas
   - np  —— numpy
   - plt —— matplotlib.pyplot
   - px  —— plotly.express
   - go  —— plotly.graph_objects
   - sns —— seaborn

2. 直接用 df 变量，不要再写 pd.read_csv(...)。

3. 中文字体处理：在代码最开头加上这两行：
   plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS']
   plt.rcParams['axes.unicode_minus'] = False

4. 所有结果用 print() 输出，包括分组统计、汇总数字、前几行数据等。

5. 如果要画图：
   - 用 plt.figure() / plt.plot() / plt.bar() 或 df.plot() 画图
   - 不需要 plt.savefig，系统会自动保存
   - 不要用 plt.show()

6. 不要用任何未列出的库，包括 re、os、sys、json、time、datetime 等。
   如果需要用到这些，改用 pandas / numpy 的等价方法。

7. 只输出代码，用 ```python 和 ``` 包裹，前后不要任何解释文字。

代码：
"""


# ============================================================
# 反思器
# ============================================================
REFLECTION_PROMPT = """你是代码质量评估专家。分析执行结果，判断是否需要修正。

原始代码：
{code}

执行结果：
- 成功: {success}
- 输出: {stdout}
- 错误: {error}

数据概况：
{data_summary}

请从以下维度评估并输出 JSON：
{{
    "quality": "good|acceptable|needs_fix",
    "issues": ["问题描述"],
    "error_pattern": "错误模式标签（如 import_error, key_error, syntax_error, empty_data, none）",
    "lesson": "本轮学到的教训（用于后续规避）",
    "suggestion": "具体修正建议（如果需要修正）"
}}

评估标准：
- 代码正确运行且结果合理 → quality 填 "good"
- 运行成功但结果不完整 → quality 填 "acceptable"
- 运行报错或结果明显错误 → quality 填 "needs_fix"

特殊说明：
- 如果错误是 import_error，说明代码里 import 了不允许的库，建议改用 pandas / numpy 重写。
- 如果代码运行成功且输出正常，error_pattern 填 "none"，suggestion 留空。
- 只输出 JSON，前后不要加任何解释文字。
"""


# ============================================================
# 人工干预提示（HITL，当前简化版未使用，保留兼容）
# ============================================================
HITL_PROMPT = """即将执行的分析操作需要您的确认。

操作类型: {task_type}
风险等级: {risk_level}
计划说明: {reasoning}

待执行的步骤:
{steps}

请选择：
1. 批准执行
2. 修改后执行
3. 拒绝执行
"""


# ============================================================
# 报告生成器
# ============================================================
REPORT_PROMPT = """根据以下分析过程生成简洁的最终报告。

用户请求：{user_request}
执行步骤：{steps}
执行结果：{results}
反思记录：{reflections}

报告要求：
- 用中文撰写
- 包含以下结构：
  1. 核心发现：一句话总结最重要的结论
  2. 关键数据：列出具体数字
  3. 注意事项：数据异常、局限性、后续建议
- 如果执行失败，要说明失败原因和建议
- 如果生成了图表，描述图表含义
- 总字数不超过 500 字，简洁清晰
- 使用 Markdown 格式，加粗重点数字
"""