---
generated_by: repo-map-first
authority_status: observed
---

# 架构

## 模块边界

仓库以顶层目录为 skill 包边界。每个 skill 通过自己的 `SKILL.md` 暴露入口，并拥有各自的 `references/`、`scripts/` 与 `agents/` 资源；skill 之间不共享可变运行状态。

`review-design-contracts` 是 Codex 专用编排层，内部由三部分组成：

- `SKILL.md` 负责前置条件、Sibling Skill 调用、Native subagent 调度，以及面向用户的人工决策交互适配。
- `scripts/review-design.mjs` 负责确定性状态机、紧凑输入投影、任务成本指标、Schema 校验、证据门禁和人工决策记录。
- `references/` 负责角色边界、审查协议、数据契约，以及用户可见拒绝原因与机器枚举之间的受校验映射。

L3 响应使用版本化契约：Manifest v5 及以上的普通任务通过增量角色只返回允许变化字段的 `refinement`，Runner 复用原候选的不可变 layer/contract；v3/v4 任务继续由独立 legacy 角色与 Schema 兼容完整 `refined_finding`。Manifest v7 进一步拥有超限 L2 的支持文档分片与紧凑契约合并状态；Manifest v8 在 Evidence Cards 与人工裁决之间加入一次性作者答辩，只有带有效反证的条目进入一个批量封闭复查任务；Manifest v6 仍专用于修复复核。

`repo-map-first` 独立拥有仓库落点判断与文档同步职责。自动路由只覆盖归属不明、跨模块边界、入口或依赖变化以及地图可疑等真实定位风险；用户显式调用会绕过自动过滤并强制完成相关地图工作。它不参与正常设计审查；`review-design-contracts` 只在默认仓库文档缺失或相关上下文可能陈旧时，显式请求其仓库上下文引导或验证模式。

`brainstorming`、`using-superpowers`、`reliable-task-execution`、`tdd`、`repo-map-first`、`code-review` 与 `simplify-codebase` 是相互独立的运行时 skill。它们的开发期行为评测位于仓库级 `evals/`：共享最小集成 Runner、Schema 和本地测试，与 `evals/suites/<skill-name>/` 中的 suite 数据分离，避免开发资源进入运行时分发包。

`code-review` 采用 Skill-fronted Agent 边界：`SKILL.md` 与按需模块负责语义审查路由，`scripts/review.mjs` 负责 Git 分层输入或显式 current-state 文件冻结、完整 Manifest、Agent 紧凑队列、声明式 disposition、输入失效、Finding 锚点校验和结论门禁。Runner 不启动或监控模型，不能证明 Agent 实际完成了语义分析，也不判断 Finding 的业务真伪或执行目标仓库提供的命令。

`simplify-codebase` 独立拥有证据型简化调查与获授权后的清理职责。它不依赖 `code-review`，也不是代码审查的固定阶段；普通审查中的局部冗余仍是普通 finding，只有显式清理请求或已观察到的强候选需要跨已审行追踪消费者时才进入该 Skill。通用层只拥有消费者分类、影响分级、证据组合和删除权限，目标仓库拥有语言、入口、排除项、防御模式、覆盖策略和门禁命令。Skill 在判断候选前验证仓库声明的路径与入口仍存在；开发期 suite 同时验证仓库策略加载、只读保持、可逆自治应用和普通 Review、孤立 lint 的负向路由。

## 依赖方向

观察到的条件依赖方向为：

```text
review-design-contracts ──仓库文档缺失或可能陈旧时──> repo-map-first
review-design-contracts ──每次运行──> Codex Native subagent 工具
review-design.mjs ──读取──> review.config.json + references/
code-review/SKILL.md ──调用──> code-review/scripts/review.mjs
code-review/scripts/review.mjs ──读取并执行──> code-review/references/findings.schema.json
brainstorming ──用户接受视觉伴侣时──> brainstorming/scripts/
evals/suites/<skill-name> ──开发期──> evals/scripts/run_eval.py
```

`repo-map-first` 不反向依赖 `review-design-contracts`。设计审查 Runner 不调用模型 API、CLI 后端或其他 provider；模型与推理强度由其任务描述传给当前 Codex 提供的 Native `spawn_agent`。独立的行为评测 Runner 会在隔离 workspace 与临时 `CODEX_HOME` 中调用 Codex CLI，并只保存可确定验证的文件、命令和输出证据。

## 主要控制流

1. 编排层确认目标设计路径，并在 `review-design-contracts` 内部执行权威预检查：优先读取 frontmatter 中的 `design_role` / `governing_design` 桥接和正文直接链接；只有目标声明为子设计且直接路径不足时，才在同目录和目标直接引用的设计索引中有界搜索。无子设计声明时默认目标自包含。
2. 如果缺少仓库地图，`repo-map-first` 只生成缺失的观察性文档；如果相关上下文可能陈旧，它只验证必要范围并修复观察性陈旧声明，不用当前代码覆盖 confirmed authority。
3. Runner 的 `prepare` 将目标设计、用户指定 authority、预检查发现的 authority 和 observed context 分类并进行内容摘要绑定；`--discovered-authority` 不能覆盖 `authority_status: observed`。
4. Evidence Cards 生成后，Runner 输出完整作者答辩包；作者一次性确认、提供锚点反证或声明未记录意图。Runner 只批量复查反证条目，归档被具体反例推翻的发现，再把剩余项交给人工裁决。
5. Runner 创建 L1 后测量完整 L2 输入。小输入继续从有效 L1 候选中提前调度独立 L3，并与 L2 共享固定执行槽；任一任务完成后即消费并补位，不等待整批屏障。超限输入让每个 L2 分片保留完整目标和目标 Ledger，仅在 Markdown 章节边界分组 supporting documents；分片只有报告精确的跨片 source/heading 对且 Runner 验证两端确实位于不同分片时，才启动一个紧凑 merge，否则候选直接无损进入 L3。
6. 自洽 L3 首次只接收引用章节；架构 L3 优先接收候选声明且经 Runner 验证的精确证据章节。任一投影报告不足时，Runner 只为同一候选创建一次冻结证据扩展：自洽候选补入完整契约来源，架构候选补入全部评审文档和完整 Ledger。补证后仍不足只淘汰该候选，其他候选继续。Runner 随后验证 L3 Schema、引用与不可变字段；输入变化使运行进入 `INVALIDATED`。
7. 幸存 finding 以短编号 evidence card 交给人工仲裁；Codex 收集中文决定和自然语言理由，但不拥有接受权。
8. 人工确认完整批次后，Runner 校验机器枚举、非空理由和批次覆盖，并保存可审计决定；只有明确接受才生成摘要绑定的修复队列。
9. 修复后的 `verify-fixes` 不续写旧队列状态，而是创建绑定当前目标的 Manifest v6：确定性分类器先检查 finding 层级、支持输入、标题结构和修改范围；只有局部自洽修复进入单任务验证，其余结果要求当前目标重新执行完整评审。

代码审查的独立控制流为：Codex 解析 authority 和目标后调用 `prepare`；Runner 将 workspace 的 `HEAD -> index`、`index -> worktree` 与 untracked 分层冻结，或冻结固定三点比较、无需 Git 的显式 current-state 文件集，并从完整 Manifest 派生不含摘要噪音的紧凑队列供 Agent 阅读。Codex 按工作流审查并用串行化的 `mark` 声明逐项 disposition；该声明不是语义审查已发生的机械证明。候选 Finding 经 `validate` 绑定当前 disposition 摘要并按 `item_id` 校验 Schema、快照、精确代码行或 Git metadata；后续 `mark` 会使旧 Finding 集失效。`finalize` 根据声明完整性和 P0-P2 finding 决定允许的结论。输入漂移使活动运行进入 `INVALIDATED`，空范围、排除项和未完成项均不能得到 `APPROVE`。

代码简化的独立控制流为：Codex 先发现并验证仓库本地指令、防御模式、兼容策略、入口、排除项和门禁，再确定只读 `audit` 或获授权的 `apply`，并按局部闭包或跨边界证据选择 `light` 或 `deep`。调查把引用分为生产、非生产、歧义和外部契约四类，逐个候选给出 `remove`、`keep` 或 `defer`。`layered-safety.md` 是唯一删除准入事实源；仓库规则可以加强保护但不能授予修改权或降低全局高风险。`apply` 同步删除完整闭包，并以残留搜索、仓库自有门禁、最终 diff 和恢复证据复核。

## 状态与数据所有权

- Runner 拥有 `.superpowers/design-reviews/<target-sha>/<run-id>/` 下的运行状态和所有中间制品。
- Runner 额外拥有不参与审查判断的 `metrics.json`，记录任务输入、Schema、指令、响应写入/消费时间、宿主推进延迟、执行槽利用率、候选门禁数量、跨片信号和 merge 独有产出；缺少 provider token 数据时不进行估算。
- Manifest v6 修复复核运行拥有 `fix-impact.json` 与 `fix-verification-results.json`；前者记录确定性分流证据，后者只证明已接受违反路径的局部关闭状态，不等价于全量无发现结论。
- Code Review Runner 拥有系统临时目录 `code-review-runs/<input-digest>-*/` 下的不可变 Manifest、紧凑 Agent 队列、受锁保护的 disposition 状态、已验证 Finding 和最终门禁结果；目标仓库保持只读。超过 8 MiB 的文件作为显式排除项记账而不生成内容快照。
- Native subagent 仅拥有自己任务目录中的 `response.json` 写权限语义，不拥有运行状态迁移权。
- 每个 Native task descriptor 拥有阶段特定的等待预算；宿主负责宽限期复查，Runner 的 `fail-task` 负责在失败落盘前再次确认响应不存在。
- 人工拥有 finding 的最终接纳权；Codex 只负责把短编号、中文菜单或自然语言理由转换为 Runner 输入，模型输出不能直接授权修复。
- Runner 拥有拒绝原因枚举校验和审计落盘职责；用户无需记忆或输入内部 reason code。
- `authority_status: observed` 的仓库文档仅描述当前实现事实，不能建立期望行为契约；目标设计、无标记的兼容文档、`confirmed` 文档或显式 `--authority` 才可作为正式契约来源。

## 外部与运行边界

- 运行依赖当前 Codex 环境提供 `spawn_agent`、`wait_agent` 和 `interrupt_agent`。
- 行为评测依赖本机 Codex CLI；真实模型 case 需要显式允许访问 Codex 服务，static 和 fake-Codex 单测不需要网络。
- GitHub Actions 仅运行仓库已有的确定性 Python 与 Node.js 测试及空白字符检查；发布标签由 GitHub Ruleset 保护，避免已发布的版本标签被更新或删除。
- 行为评测只保留 `static`、单个 `case` 和最小 `smoke`：前两类本地结构/假执行测试零外部调用；`brainstorming`、`using-superpowers`、`reliable-task-execution`、`tdd`、`repo-map-first`、`code-review`、`simplify-codebase` 的真实 smoke 上限分别为 2、8、2、2、2、5、7 次。没有语义判分、baseline、重复 trial、regression 或 differential；多案例 smoke 在调用前必须同时满足 manifest 硬上限和显式 `--max-codex-calls` 预算。
- Runner 仅允许执行 `review.config.json` 中白名单声明的确定性验证命令。
- Code Review Runner 只以参数数组执行自身固定的 Git 读取操作，不执行被审代码或仓库声明的测试命令；无法表示的远程或粘贴目标只能降级为明确的 `UNMANAGED_REVIEW`，且不能批准。
- skill 包本身不保存评审运行数据，也不自动创建外部 issue、PR 或工单。
