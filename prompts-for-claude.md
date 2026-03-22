# Claude Code 提示词（按阶段执行）

> 使用方法：在 claude 命令行中，按阶段逐步粘贴下面的提示词。每个阶段完成后确认没问题再进入下一阶段。

---

## 阶段 1：创建 Gateway 配置

```
请阅读 ToDoList.md 的"二、Mac 本地目录布局"和"八、Gateway 配置"部分。

按照 ToDoList 的规划，完成以下任务：

1. 创建 ~/.openclaw/openclaw.json，内容按 ToDoList 第八节的配置（1个 main agent + QQ binding + sub-agent 安全设置）
2. 确保 ~/.openclaw/workspace/ 目录存在
3. 创建 workspace 下的子目录：tasks/、runs/、reports/、templates/

注意：
- 如果 ~/.openclaw/openclaw.json 已存在，先读取现有内容，在现有配置基础上合并新增的 agents/bindings/tools 配置，不要覆盖已有的 channel 配置
- 如果目录已存在就跳过
- 完成后用 cat 展示 openclaw.json 内容供我确认
```

---

## 阶段 2：创建 AGENTS.md

```
请阅读 ToDoList.md 的"四、main agent 的 AGENTS.md"部分。

在 ~/.openclaw/workspace/AGENTS.md 中写入总控规则。内容必须包含：

1. main agent 的职责定义（总控 orchestrator）
2. 禁止事项（不代替 research/verifier 做事）
3. Sub-Agent 交互模式说明（sessions_spawn 异步机制：spawn 立即返回 → 等 announce）
4. 4 个 sub-agent 角色的完整 contract（research、verify_fact、verify_logic、reporter），明确输入/输出文件路径
5. 所有输出路径约定
6. 执行链路的 7 步流程

注意：
- 如果文件已存在，先读取并保留有用内容，追加新内容
- sub-agent 只会注入 AGENTS.md + TOOLS.md，不会注入 SOUL.md，所以角色的详细 contract 要通过 sessions_spawn 的 task 参数传入，但这里也要写明作为参考
- 完成后展示文件内容供我确认
```

---

## 阶段 3：创建 3 个 Skills

```
请阅读 ToDoList.md 的"六、3 个最小 skills"部分。

在 ~/.openclaw/workspace/skills/ 下创建 3 个 skill：

1. skills/task_contract/SKILL.md
   - name: task_contract
   - description: 将自然语言任务规范化为 TaskSpec JSON
   - 详细说明：接收用户任务 → 生成 task_id（格式 TASK-YYYYMMDD-NNN） → 生成 TaskSpec JSON → 写入 tasks/<task_id>/task.json
   - 包含 TaskSpec 的完整 JSON schema 示例

2. skills/cross_check/SKILL.md
   - name: cross_check
   - description: 汇总双验证器的差异并标记需修订的 claims
   - 详细说明：读取 fact_verdict.json 和 logic_verdict.json → 比对每个 claim 的 verdict → 输出冲突摘要 → 标记需要修订的 claims
   - 包含判断规则：unsupported → 必须回修，risk=high → 必须回修，其余保留限制说明

3. skills/latex_report/SKILL.md
   - name: latex_report
   - description: 基于审定结果生成 LaTeX 审计报告
   - 详细说明：读取 final_decision.json + 所有 verified claims → 生成 main.tex / appendix_claims.tex / appendix_audit.tex / summary.md
   - 包含 LaTeX 报告的必须结构（6 个 section + 2 个 appendix）
   - 引用 templates/ 下的模板文件

每个 SKILL.md 都要包含 YAML frontmatter（name + description）和详细的 markdown 指令。
完成后列出创建的文件。
```

---

## 阶段 4：创建 LaTeX 模板

```
请阅读 ToDoList.md 的"十、LaTeX 报告的最小结构"部分。

在 ~/.openclaw/workspace/templates/ 下创建 LaTeX 模板文件：

1. report.tex — 主模板，包含：
   - 中文支持（ctexart 或 xeCJK）
   - 6 个 section 占位：任务概述、执行流程、研究结果、交叉验证结果、最终结论、限制与未解决问题
   - 2 个 appendix：Claim 审核表、Agent 运行审计表
   - 使用 \input 引入子文件

2. sections.tex — section 内容模板，带占位变量注释

3. tables.tex — 两张必须表的 LaTeX 模板：
   - Claim 审核表（列：Claim ID / Statement / Fact Verdict / Logic Verdict / Final Status）
   - Agent 审计表（列：Run ID / Agent Role / Task ID / Start-End / Output Path / Status）

模板应以 xelatex 编译为目标，支持中文。
完成后展示 report.tex 内容。
```

---

## 阶段 5：验证整体结构

```
请帮我验证 MVP 框架是否就绪。检查以下内容：

1. 列出 ~/.openclaw/workspace/ 的完整目录树
2. 检查 openclaw.json 的 JSON 语法是否正确（可以用 node -e 或 python -m json.tool 验证）
3. 检查所有 SKILL.md 是否包含 YAML frontmatter
4. 检查 report.tex 是否能通过 xelatex 语法检查（如果本地有 xelatex）
5. 汇总检查结果，列出还缺少什么

参照 ToDoList.md 第十三节的 8 条验收标准，评估当前完成了哪些基础设施。
```

---

## 阶段 6：本地单步测试 — TaskSpec 生成

> 对应 ToDoList 第十五节"第 3 天"，验收标准 #1

```
现在进入本地单步测试阶段。请按以下步骤操作：

第一步：测试 task_contract skill 能否正确生成 TaskSpec

1. 确保 OpenClaw gateway 正在运行（执行 openclaw gateway run 或确认已运行）
2. 用 openclaw message send 给 main agent 发送以下测试任务：
   "请针对"大语言模型在教育领域的应用现状"做一次结构化调研，双重验证，并生成 LaTeX 报告"
3. 等待 main 处理（可能需要 30-60 秒）
4. 检查结果：
   - ls ~/.openclaw/workspace/tasks/ — 应该出现 TASK-20260323-001/
   - cat ~/.openclaw/workspace/tasks/TASK-20260323-001/task.json — 验证是否包含完整 TaskSpec schema
   - ls ~/.openclaw/workspace/runs/ — 应该出现 TASK-20260323-001/

如果 main 没有触发 task_contract skill，请检查：
- AGENTS.md 中是否正确描述了 task_contract 的触发条件
- skills/task_contract/SKILL.md 是否被正确加载（检查 gateway 启动日志）

验证标准：task.json 必须包含 task_id, title, objective, inputs, required_outputs, iteration_limit, success_criteria 字段。

注意：如果 main agent 直接跳过 TaskSpec 开始做研究，说明 AGENTS.md 的约束力不够，需要加强"必须先生成 TaskSpec 再做任何其他操作"的指令。
```

---

## 阶段 7：本地单步测试 — Sub-Agent 输出格式

> 对应 ToDoList 第十五节"第 3 天"，验收标准 #2、#3

```
继续本地单步测试。假设阶段 6 已成功生成了 TaskSpec（task_id 为 TASK-20260323-001）。

现在需要验证各 sub-agent 角色是否输出正确的 JSON schema。

如果阶段 6 中 main 已经自动走了完整链路（spawn 了 research + verifiers），那么直接检查输出：

1. 检查 research 输出：
   cat ~/.openclaw/workspace/runs/TASK-20260323-001/research_result.json
   验证：是否包含 task_id, status, claims[], limitations, unresolved_items
   验证：每个 claim 是否包含 claim_id, statement, evidence[], confidence, notes

2. 检查 verify_fact 输出：
   cat ~/.openclaw/workspace/runs/TASK-20260323-001/fact_verdict.json
   验证：是否包含 task_id, verifier="verify_fact", results[]
   验证：每个 result 是否包含 claim_id, verdict, reason, missing_evidence

3. 检查 verify_logic 输出：
   cat ~/.openclaw/workspace/runs/TASK-20260323-001/logic_verdict.json
   验证：是否包含 task_id, verifier="verify_logic", results[]
   验证：每个 result 是否包含 claim_id, risk, issue, revision_advice

4. 检查 final_decision.json：
   cat ~/.openclaw/workspace/runs/TASK-20260323-001/final_decision.json

5. 检查 reporter 输出：
   ls ~/.openclaw/workspace/reports/TASK-20260323-001/
   验证是否包含：main.tex, sections_intro.tex, appendix_claims.tex, appendix_audit.tex, summary.md

如果 main 没有自动走完整链路（只生成了 TaskSpec），则需要手动触发。
给 main 发消息："TaskSpec 已生成，请继续执行后续步骤（spawn research sub-agent）。"

每一步完成后，汇总哪些文件已生成、哪些格式正确、哪些需要修正。
```

---

## 阶段 8：端到端验证 + 修订逻辑

> 对应 ToDoList 第十五节"第 4-5 天"，验收标准 #4、#5、#6、#7、#8

```
端到端验证。请按以下步骤操作：

第一步：验证已有运行结果

检查之前运行的完整链路结果（可能在阶段 7 中已完成）。逐项核对 ToDoList 8 条验收标准：

1. [#1] task.json 存在且 schema 正确？
2. [#2] research_result.json 存在且 claims 格式完整？
3. [#3] fact_verdict.json 和 logic_verdict.json 各自独立存在？
4. [#4] final_decision.json 是否体现了 cross_check 的冲突识别？
5. [#5] 如果 final_decision.json 中 final_status = "revision_required"，是否触发了第 2 轮？
6. [#6] reports/<task_id>/main.tex 能否用 xelatex 编译？尝试：cd ~/.openclaw/workspace/reports/TASK-*/ && xelatex main.tex
7. [#7] 编译后的 PDF 是否包含 Claim 审核表和 Agent 审计表？
8. [#8] 检查 summary.md 是否包含任务状态、报告路径、关键摘要

第二步：如果需要测试修订逻辑

如果第一轮运行中所有 claim 都通过了（没有触发回修），则需要人为制造修订场景：

给 main 发送一个更容易产生争议的任务，例如：
"请调研"量子计算是否将在 5 年内取代传统加密算法"，要求结构化分析正反观点，双重验证，生成 LaTeX 报告"

这种有争议的话题更容易产生 unsupported claim 或 high risk，从而触发回修机制。

第三步：汇总验收结果

用表格列出 8 条验收标准的通过情况：
| # | 验收标准 | 状态 | 备注 |

如果全部通过，则 MVP 基础设施和运行时验证全部完成。
如果有未通过项，说明具体问题和修复建议。
```
