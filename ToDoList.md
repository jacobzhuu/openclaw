# Mac 本地 MVP 实施蓝图

目标不是一步做到复杂生产系统，而是先把这条链路跑通：

**QQ 下发任务 → OpenClaw main agent 总控 → spawn sub-agent 执行/验证 → 双验证 → LaTeX 报告落盘**

这版设计刻意偏保守，优先保证：1. 真分工 2. 可留痕 3. 可复核 4. 可迁移到 Linux

OpenClaw 这套做法的基础：它支持 **sub-agent 编排**（`sessions_spawn`）；每个 sub-agent 在独立 session 里后台运行并通过 announce 回传结果；skills 由 `SKILL.md` 文件夹组成；agent 还能通过命令行直接触发，适合本地测试。

> **架构决策：Sub-Agent 模式 vs Multi-Agent Routing**
>
> OpenClaw 有两种多 agent 模式：
>
> - **Multi-Agent Routing**（`agents.list` 多个独立 agent）：用于多人格/多通道隔离，各自独立响应消息
> - **Sub-Agent**（`sessions_spawn`）：用于同一个 agent 内的任务编排，异步 spawn 子任务
>
> 本 MVP 采用 **Sub-Agent 模式**，因为 research/verify 等角色不需要独立消息通道，它们是被 main 动态调用的子任务。

⸻

## 一、MVP 范围

先只实现 1 个 agent + 4 个 sub-agent 角色 + 3 个 skills + 1 条闭环。

### 1 个 agent（注册在 `agents.list` 中）

- **main**：总控 / orchestrator

### 4 个 sub-agent 角色（通过 `sessions_spawn` 动态创建，不需要注册）

- **research**：执行主任务
- **verify_fact**：事实核验
- **verify_logic**：逻辑核验
- **reporter**：生成 LaTeX 报告

### 3 个 skills

- **task_contract**：把自然语言任务转成统一任务协议
- **cross_check**：汇总两个 verifier 的差异
- **latex_report**：把最终审定结果写成 TeX

### 1 条闭环

只做一个典型任务，例如：

> "针对某主题做一次结构化调研，双重验证，并生成 LaTeX 报告"

先不要一开始就接复杂爬虫、数据库、外部 SaaS 或大规模自动化。

⸻

## 二、Mac 本地目录布局

使用 OpenClaw 默认路径体系，不另建独立目录。

```
~/.openclaw/
├── openclaw.json              # gateway 配置（1 个 agent + QQ binding）
├── workspace/                 # main agent workspace（唯一 workspace）
│   ├── AGENTS.md              # 总控规则 + sub-agent 编排逻辑 + 各角色 contract
│   ├── SOUL.md                # agent 人格
│   ├── USER.md                # 用户信息
│   ├── skills/
│   │   ├── task_contract/
│   │   │   └── SKILL.md
│   │   ├── cross_check/
│   │   │   └── SKILL.md
│   │   └── latex_report/
│   │       └── SKILL.md
│   ├── templates/
│   │   ├── report.tex
│   │   ├── sections.tex
│   │   └── tables.tex
│   ├── tasks/                 # 任务协议存放
│   ├── runs/                  # 运行记录
│   └── reports/               # 报告输出
├── agents/main/
│   ├── agent/                 # auth-profiles 等状态
│   └── sessions/              # session 数据（自动管理）
└── credentials/               # 自动管理
```

**关键区别**：不需要为 research/verify_fact/verify_logic/reporter 创建独立 workspace。Sub-agent 继承 main agent 的 workspace 作为工作目录。

⸻

## 三、Agent 与 Sub-Agent 设计

### main agent（唯一注册的 agent）

**职责**：

- 接收 QQ 消息
- 解析总任务
- 生成 task_id
- 通过 `sessions_spawn` 启动 sub-agent
- 等待 sub-agent announce 回传结果
- 收集 research 与 verifier 输出
- 决定是否进入下一轮迭代
- 最后 spawn reporter 生成报告

不要让 main 自己做实质研究和验证。否则分工会塌掉。

### Sub-Agent 角色定义

> **重要限制**：Sub-agent 只注入 `AGENTS.md` + `TOOLS.md`，**不注入** `SOUL.md`、`USER.md`。
> 因此各角色的 contract 必须写在 spawn 时的 `task` 参数中。

#### research（通过 `sessions_spawn` 的 task 参数注入 contract）

```
你只负责执行主任务，不负责最终裁决。
输出必须为结构化 JSON，写入 workspace 的 runs/<task_id>/research_result.json。
必须包含: task_id, objective, claims, evidence, confidence, limitations, unresolved_items
禁止：输出"最终已确认结论"、伪装 verifier、省略不确定性
```

#### verify_fact

```
你只做事实核验。
读取 runs/<task_id>/research_result.json，逐条检查 claims。
输出 verdict: supported / weakly_supported / unsupported / unverifiable
每条 verdict 必须指向 claim_id。不得修改原 claim 内容。
输出写入 runs/<task_id>/fact_verdict.json
```

#### verify_logic

```
你只做逻辑边界审查。
读取 runs/<task_id>/research_result.json，检查：过度外推、证据不足却写成确定、内部矛盾、定义漂移。
逐条输出 risk level 与 revision advice。不得重写研究内容。
输出写入 runs/<task_id>/logic_verdict.json
```

#### reporter

```
你只接收最终审定结果并生成 LaTeX。不得新增事实。
读取: task.json, research_result.json, fact_verdict.json, logic_verdict.json, final_decision.json
必须输出: main.tex, appendix_audit.tex, appendix_claims.tex, summary.md
所有输出写入 reports/<task_id>/
```

这个切分的关键，不是"角色名字好看"，而是避免一个 agent 同时扮演作者、审稿人和排版员。

⸻

## 四、main agent 的 AGENTS.md

将所有总控规则、sub-agent 编排模式和角色 contract 都写在这一个文件里。

```markdown
# main agent contract

你是总控 orchestrator，不直接完成研究内容。

## 职责

1. 接收任务
2. 使用 task_contract skill 生成 task_id 和 TaskSpec
3. 通过 sessions_spawn 依次调用 sub-agent
4. 等待 announce 回传后汇总输出
5. 触发修订轮次（如有需要）
6. 交给 reporter sub-agent 生成报告

## 禁止

- 代替 research 做事实性执行
- 代替 verifier 做核查
- 未经双重验证直接输出最终结论

## Sub-Agent 交互模式

sessions_spawn 是异步的：

- spawn 立即返回 { status: "accepted", runId }
- sub-agent 完成后通过 announce 回传结果
- 你需要等待每个 announce 消息后再进入下一步
- 两个 verifier 可以并行 spawn，但需要等两个 announce 都到达后再汇总

## 所有输出路径

- tasks/<task_id>/task.json
- runs/<task_id>/research_result.json
- runs/<task_id>/fact_verdict.json
- runs/<task_id>/logic_verdict.json
- runs/<task_id>/final_decision.json
- reports/<task_id>/main.tex
```

⸻

## 五、统一数据协议：这是 MVP 成败关键

普通自然语言输出不适合复核。必须强制所有 sub-agent 用固定 schema。

### 1）任务协议 TaskSpec

由 main 生成，写到 `tasks/<task_id>/task.json`

```json
{
  "task_id": "TASK-20260323-001",
  "title": "示例调研任务",
  "objective": "完成结构化研究、双重验证和 LaTeX 报告输出",
  "inputs": ["用户原始消息", "任何附加说明"],
  "required_outputs": [
    "research_result.json",
    "fact_verdict.json",
    "logic_verdict.json",
    "final_decision.json",
    "main.tex"
  ],
  "iteration_limit": 2,
  "success_criteria": ["所有关键 claim 被双 verifier 处理", "最终报告成功生成"]
}
```

### 2）Research 输出协议

`runs/<task_id>/research_result.json`

```json
{
  "task_id": "TASK-20260323-001",
  "status": "completed",
  "claims": [
    {
      "claim_id": "C1",
      "statement": "这里写一个明确结论",
      "evidence": ["证据1", "证据2"],
      "confidence": "medium",
      "notes": "为什么不是 high"
    }
  ],
  "limitations": ["范围限制1"],
  "unresolved_items": ["尚未解决的问题"]
}
```

### 3）Fact verifier 输出协议

`runs/<task_id>/fact_verdict.json`

```json
{
  "task_id": "TASK-20260323-001",
  "verifier": "verify_fact",
  "results": [
    {
      "claim_id": "C1",
      "verdict": "supported",
      "reason": "证据与 claim 匹配",
      "missing_evidence": []
    }
  ]
}
```

### 4）Logic verifier 输出协议

`runs/<task_id>/logic_verdict.json`

```json
{
  "task_id": "TASK-20260323-001",
  "verifier": "verify_logic",
  "results": [
    {
      "claim_id": "C1",
      "risk": "medium",
      "issue": "表述略超出证据边界",
      "revision_advice": "把确定语气改为倾向性表述"
    }
  ]
}
```

### 5）最终裁决协议

由 main 汇总，输出 `runs/<task_id>/final_decision.json`

```json
{
  "task_id": "TASK-20260323-001",
  "round": 1,
  "accepted_claims": ["C1"],
  "rejected_claims": [],
  "needs_revision": [],
  "final_status": "approved_for_reporting"
}
```

⸻

## 六、3 个最小 skills

OpenClaw 的 skills 是目录 + `SKILL.md`；系统会加载 bundled skills 和本地技能。只写本地 workspace skill。

### 1）task_contract

位置：`~/.openclaw/workspace/skills/task_contract/SKILL.md`

```yaml
---
name: task_contract
description: 将自然语言任务规范化为 TaskSpec JSON
---
```

当用户提出需要多步骤执行、验证或报告生成的任务时：

1. 先创建 task_id（格式：`TASK-YYYYMMDD-NNN`）
2. 生成 TaskSpec JSON
3. 写入 `tasks/<task_id>/task.json`
4. 再决定是否调用 sub-agents

不要直接开始研究或写报告。

### 2）cross_check

位置：`~/.openclaw/workspace/skills/cross_check/SKILL.md`

作用：

- 比较 `fact_verdict.json` 和 `logic_verdict.json`
- 输出冲突摘要
- 标记哪些 claim 需要修订

### 3）latex_report

位置：`~/.openclaw/workspace/skills/latex_report/SKILL.md`

作用：

- 只基于 `final_decision.json` + verified claims
- 写出 main.tex 和附录文件
- 不允许自由发挥事实

⸻

## 七、main agent 的执行链路

建议把 main 的内部工作流固定成下面 7 步。

### Step 1：接收消息并建任务

QQ 发来总任务后，main：

- 使用 `task_contract` skill
- 生成 task_id
- 写 `tasks/<task_id>/task.json`
- 在 `runs/<task_id>/` 建运行目录

### Step 2：spawn research sub-agent

```
sessions_spawn({
  task: "你是 research agent。[此处注入完整 contract + task.json 内容]",
  label: "research-<task_id>"
})
```

**异步等待**：spawn 立即返回 runId。main 等待 research 的 announce 消息到达。

### Step 3：并行 spawn 两个 verifier

在收到 research announce 后，确认 `research_result.json` 已写入，然后并行启动：

```
sessions_spawn({
  task: "你是 verify_fact agent。[contract + research_result.json 路径]",
  label: "verify-fact-<task_id>"
})

sessions_spawn({
  task: "你是 verify_logic agent。[contract + research_result.json 路径]",
  label: "verify-logic-<task_id>"
})
```

**等待两个 announce 都到达**后继续。announce 顺序不确定。

### Step 4：运行 cross_check

由 main 使用 `cross_check` skill 对两个 verifier 输出做差异汇总。

### Step 5：决定是否二轮修订

规则：

- 只要有 unsupported claim，必须回修（重新 spawn research + verifiers）
- 只要 risk = high，必须回修
- 其余小问题可以在报告里保留限制说明
- 最多 `iteration_limit` 轮（默认 2 轮）

### Step 6：通过则 spawn reporter

```
sessions_spawn({
  task: "你是 reporter agent。[contract + 所有文件路径]",
  label: "reporter-<task_id>"
})
```

reporter 读取所有文件生成 TeX。

### Step 7：总控回 QQ

只回：

- 任务状态
- 报告路径
- 关键摘要
- 是否有 unresolved items

QQ 不负责承载全部中间文件。

⸻

## 八、Gateway 配置

`~/.openclaw/openclaw.json` 核心配置：

```json5
{
  agents: {
    defaults: {
      subagents: {
        maxSpawnDepth: 1, // main spawn sub-agents，sub-agents 不再嵌套
        maxChildrenPerAgent: 5, // 最多同时 5 个 sub-agent
        maxConcurrent: 4, // 全局并发上限
      },
    },
    list: [
      {
        id: "main",
        workspace: "~/.openclaw/workspace",
      },
    ],
  },
  // QQ 绑定
  bindings: [{ agentId: "main", match: { channel: "qq" } }],
  // 安全设置
  tools: {
    subagents: {
      tools: {
        deny: ["gateway", "cron"], // sub-agent 禁用高危工具
      },
    },
  },
}
```

⸻

## 九、Mac 本地命令层

### 1）一次性初始化

```bash
# 确保 OpenClaw 已安装
openclaw --version

# 创建 workspace 和基础文件
openclaw setup

# 配置 QQ 通道（按 QQ 插件文档操作）
openclaw channels login --channel qq
```

### 2）本地单步测试

不经过 QQ，直接测某个 sub-agent 角色是否按协议输出：

```bash
# 直接给 main 发消息测试
openclaw message send "针对 AI 编程助手做一次结构化调研"

# 查看 sub-agent 状态
/subagents list
/subagents log <id>
/subagents info <id>
```

### 3）端到端测试

从 QQ 触发整条链路，观察完整流程。

先测第 2 类，再测第 3 类。

⸻

## 十、LaTeX 报告的最小结构

MVP 报告不追求华丽，追求审计性。

生成这四个文件：

- `main.tex`
- `sections_intro.tex`
- `appendix_claims.tex`
- `appendix_audit.tex`

### 主体结构

```latex
\section{任务概述}
\section{执行流程}
\section{研究结果}
\section{交叉验证结果}
\section{最终结论}
\section{限制与未解决问题}
\appendix
\section{Claim 审核表}
\section{Agent 运行审计表}
```

### 报告里必须出现两张表

**Claim 审核表**：

- Claim ID
- Statement
- Fact verdict
- Logic verdict
- Final status

**Agent 审计表**：

- Run ID
- Agent Role
- Task ID
- Start / End
- Output path
- Status

这样最终交付的不是"AI 写了一篇看起来像报告的文本"，而是"有执行链、有验证链、有落盘文件的审计报告"。

⸻

## 十一、Mac 本地的安全与权限建议

MVP 阶段不要把工具权限开得太大。

**允许**：

- 文件读写：仅限 workspace 目录
- 终端命令：仅限基础文件操作、TeX 编译、JSON 处理
- 网络：先尽量少开，按任务再开

**暂不建议**：

- 全盘读写
- 任意 shell
- 高危系统命令
- 未审查第三方 skills

可通过 per-agent `tools.allow/deny` 和 `sandbox` 配置实现限制。

⸻

## 十二、QQ 在 MVP 里只承担什么角色

QQ 已经接上了（通过 `extensions/qq` 插件），那就只做两件事：

- 下发任务
- 接收摘要与报告路径

不要让 QQ 承载：

- 大量中间 JSON
- 很长的 verifier 差异
- LaTeX 编译日志

聊天入口只是入口。真正的审计载体应是本地文件。

⸻

## 十三、验收标准

MVP 过关，至少满足这 8 条：

1. main 能创建 task_id 和 TaskSpec
2. research sub-agent 输出符合 schema 的 JSON
3. 两个 verifier sub-agent 独立输出 verdict
4. main 能在收到两个 announce 后识别冲突并决定是否回修
5. 至少成功完成 1 轮修订
6. reporter sub-agent 能输出可编译 TeX
7. 报告包含 claim 表和 audit 表
8. QQ 能收到摘要和本地报告路径

只要这 8 条打通，迁移 Linux 就很顺。

⸻

## 十四、后续怎么接入 OpenCode

这版 MVP 先不必强绑 OpenCode。但预留一个接口最合理：

让 research sub-agent 在需要"代码仓内执行"时，不自己乱跑，而是在 task 中指明需要代码执行。OpenCode 的官方文档显示它有 agents/subagents、run、serve、attach、session 管理，适合做 repo 内执行器。

预留扩展位：

- 纯文本/调研任务：research sub-agent 直接做
- 仓库代码任务：research sub-agent 委托给 OpenCode worker，再把结果写回 JSON

但这是 MVP 之后的第二阶段。

⸻

## 十五、最小实施顺序

| 天          | 任务                                       | 交付物                                         |
| ----------- | ------------------------------------------ | ---------------------------------------------- |
| **第 1 天** | 写 `openclaw.json` + workspace `AGENTS.md` | gateway 配置 + 总控规则                        |
| **第 2 天** | 写 3 个 skills 的 `SKILL.md`               | `task_contract`、`cross_check`、`latex_report` |
| **第 3 天** | 定义 JSON schema + 本地单步测试            | 手动 spawn 各角色验证输出格式                  |
| **第 4 天** | 端到端一轮                                 | QQ 任务 → research → verifiers → reporter      |
| **第 5 天** | 加修订逻辑 + audit 附录                    | 回修支持 + 完整报告                            |

⸻

## 十六、第一批要做的文件

你先把这 6 个文件做出来，MVP 框架就立住了：

1. `~/.openclaw/openclaw.json` — gateway 配置
2. `~/.openclaw/workspace/AGENTS.md` — 总控规则 + sub-agent 编排 + 各角色 contract
3. `~/.openclaw/workspace/skills/task_contract/SKILL.md`
4. `~/.openclaw/workspace/skills/cross_check/SKILL.md`
5. `~/.openclaw/workspace/skills/latex_report/SKILL.md`
6. `~/.openclaw/workspace/templates/report.tex`

不需要为每个 sub-agent 角色创建独立 workspace 和 `AGENTS.md`。

⸻
