---
generated_by: repo-map-first
authority_status: observed
---

# 仓库地图

## 顶层结构

- `repo-map-first/`：在代码归属不明、跨模块边界或地图可疑时定位行为改动；显式调用强制完成地图工作，并维护结构变化后的仓库地图与架构文档。
- `review-design-contracts/`：使用分层 Codex Native subagent 审查 Markdown 设计文档，最终由人工决定是否进入修复队列。
- `code-review/`：根据审查目标和维度路由日常、验收与专项代码审查，并用确定性 Runner 冻结输入、校验 Finding 锚点、记录声明式 disposition 和约束批准结论。
- `brainstorming/`：按不确定性、影响范围和可逆性选择快速执行、设计简报或完整设计，并按需提供可视化设计伴侣。
- `using-superpowers/`：在跨 skill 选择会实质改变流程时组织最小有用集合；单一明显匹配可直接进入领域 skill，组合需求由 Router 协调。
- `reliable-task-execution/`：按风险按需分发验证、安全操作、诊断恢复、任务连续性、委派和独立审查规范。
- `tdd/`：在明确采用测试先行时，用覆盖独立行为和真实风险的最小证据集驱动实现。
- `evals/`：六个 skill 共用的开发期行为评测基础设施、隔离 suites 与 Runner 回归测试，不属于任何运行时 skill 包。
- `docs/superpowers/specs/`：保存非平凡 skill 变更的已确认设计文档。
- `.github/workflows/verify.yml`：GitHub Actions 持续集成入口，验证 Skill 仓库的 Python、Node.js 和空白字符检查。
- `LICENSE`：所有运行时 Skill 与仓库文档的 MIT 许可文本。
- `README.md`：仓库用途、skill 清单和目录约定说明。

## Skill 入口与职责

- `repo-map-first/SKILL.md`：自动落点风险、显式地图工作，以及依赖 skill 仓库上下文引导和验证的四模式入口。
- `review-design-contracts/SKILL.md`：设计审查编排入口；负责预检查上位设计（governing design）authority 与仓库上下文、启动 Runner，并按任务描述调度 Native subagent。上位关系由共享契约的归属决定，不等同于上一个任务。
- `review-design-contracts/scripts/review-design.mjs`：确定性 Runner，负责紧凑任务投影、超限 L2 的支持文档分片与契约合并、分阶段超时描述、迟到响应竞态保护、任务成本指标、状态迁移、证据门禁、人工仲裁、修复队列，以及根据队列与实际文档变化在局部修复复核和全量重审之间分流。
- `evals/tests/review-design-contracts/review-design.test.mjs`：设计审查 Runner 的端到端 Node.js 回归测试；其固定人工确认案例位于同目录 `fixtures/`，两者均不进入运行时 Skill 包。
- `review-design-contracts/references/human-rejection-reasons.json`：人工驳回原因的中文菜单、内部 code 映射和默认审计理由。
- `review-design-contracts/references/adversarial-result.schema.json` 与 `adversarial-role.md`：新运行的增量 L3 契约；legacy Schema 与角色仅用于继续 v3/v4 历史运行。
- `brainstorming/SKILL.md` 与 `visual-companion.md`：设计深度选择入口和按需视觉交互指南；`scripts/` 提供本地伴侣服务器。
- `using-superpowers/SKILL.md`：需要跨 skill 取舍或组合时的最小集合路由入口。
- `reliable-task-execution/SKILL.md` 与 `references/`：可靠执行路由入口和六个按需规范。
- `tdd/SKILL.md`：风险驱动的测试先行入口；技能包不携带通用测试教程或开发期评测内容。
- `code-review/SKILL.md`：Skill-fronted Review Agent 入口；把意图、契约、行为和风险推理留给 Codex，把可机械判定的完整性责任交给 Runner。
- `code-review/scripts/review.mjs`：代码审查确定性 Runner，负责 staged、unstaged、untracked 分层 workspace，三点比较或无 Git 显式 current-state 文件 Manifest，供 Agent 读取的紧凑队列，受锁保护且与 Finding 摘要绑定的逐项声明状态，8 MiB 输入上限、输入失效、Finding Schema/代码行/Git metadata 校验与结论门禁。
- `code-review/scripts/review.test.mjs`：上述 Runner 的 Node.js 回归测试。
- `evals/scripts/run_eval.py`：六套 skill 共用的最小集成评测 Runner；只支持静态校验、定点 case 和小规模 smoke，并负责隔离执行、成本预估、profile 硬上限和显式调用预算门禁。`evals/suites/<skill-name>/` 共保留二十个具有确定性证据的案例；`brainstorming` 检查普通设计约束与依赖任务 Full Design 两类边界，`code-review` 检查日常、专项、当前状态验收与 comparison baseline 四类边界，`using-superpowers` 检查单 skill、组合 skill、选择歧义、显式调用、topic-only 与无需路由等边界，TDD 和 repo-map-first 各检查一正一负两个路由边界。
- `<skill-name>/SKILL.md`：后续迁入个人 skill 的标准入口。

## 资源边界

- skill 内的 `references/` 保存按需加载的角色说明、协议和 JSON Schema。
- skill 内的 `scripts/` 只保存运行时确定性可执行程序；开发期测试统一放在仓库级 `evals/tests/`。
- skill 内的 `agents/` 保存 Codex 界面元数据。
- 开发期评测统一保存在仓库级 `evals/`，避免标准 skill 打包器递归收集测试、fixtures、历史结果或支持 stub。
- `review-design-contracts` 的运行产物写入被审查仓库的 `.superpowers/design-reviews/`，不写入 skill 目录。

## 关键流程

1. Codex 根据 `SKILL.md` 的 description 选择工作流。
2. `review-design-contracts` 检查目标是否依赖用户确认的上位设计，并检查目标仓库中的 `docs/REPO_MAP.md` 与 `docs/ARCHITECTURE.md`。
3. 任一仓库文档缺失时，它调用 `repo-map-first` 的仓库上下文引导模式；相关上下文可能陈旧时，调用验证模式，并保持被审设计不变。
4. Runner 将目标设计、显式与默认 confirmed authority、观察性 context 分开打包，记录覆盖范围，并产出固定模型和推理强度的 Native subagent 任务。
5. L1 完成后，未超输入上限的 L2 可与已验证 L1 候选的首批 L3 并行；超限 L2 保留完整目标与 Ledger，只在 Markdown 章节边界切分 supporting documents，分批完成后由一个紧凑任务发现跨分片路径。无法安全切分时明确返回输入不足。Runner 无损合并候选，再继续固定并发的 L3。每个任务描述携带分阶段超时与短暂响应宽限，`fail-task` 不会覆盖已经迟到落盘的响应。
6. Runner 用短编号展示当前批次；Codex 以中文收集决定和自然语言驳回理由，完成整批确认后再生成机器 decisions JSON。
7. Runner 校验原因 code、非空理由和批次完整性；只有人工明确接受的 finding 才能进入 `fix-queue.json`。
8. 修复前由 `verify-queue` 校验摘要绑定；修复后 `verify-fixes` 创建独立 Manifest v6 运行。架构 finding、支持输入漂移、章节结构变化或越出已接受契约标题的修改确定性要求全量重审；其余自洽修复只派发一个封闭证据复核任务。
9. GitHub Actions 在推送到 `main` 或面向 `main` 的 Pull Request 上运行本地确定性验证，不运行真实 Codex smoke。
10. 代码审查先由 Runner 在系统临时目录冻结分层 workspace、固定 range 或显式 current-state Manifest，并派生紧凑队列供 Codex 阅读；Codex 逐项声明 disposition 后，Runner 将候选 Finding 绑定当前 disposition 摘要并校验精确快照或 metadata 锚点，最后按声明完整性和阻塞严重度给出允许的结论集合。Runner 不证明 Agent 实际完成了语义分析。

## 公共契约与测试证据

- `review-design-contracts/review.config.json`：固定模型、推理强度、并发、超时、默认仓库文档和命令白名单。
- `review-design-contracts/references/review-protocol.md`：审查状态机、authority/context provenance 与人工仲裁协议。
- `review-design-contracts/references/human-rejection-reasons.json`：用户可见拒绝原因与机器枚举之间的受校验映射。
- `review-design-contracts/references/*.schema.json`：模型结果、证据卡和拒绝记录的机器可校验契约。
- `review-design-contracts/references/architecture-shard-role.md`、`architecture-merge-role.md` 与 `architecture-shard-result.schema.json`：Manifest v7 超限 L2 的封闭分片、支持契约提取和跨分片增量发现契约。
- `evals/tests/review-design-contracts/review-design.test.mjs`：上述流程及迁移兼容性的回归证据。
- `code-review/references/review-runtime-protocol.md`：宿主 Agent 与确定性 Runner 的职责、命令、降级和信任边界。
- `code-review/references/findings.schema.json`：Runner 直接读取的候选 Finding v2 契约，区分精确代码行与 Git metadata file anchor。
- `code-review/scripts/review.test.mjs`：分层输入、rename 坐标、current-state 非 Git 目标、紧凑队列、超大文件排除、并发状态、漂移失效、Finding/disposition 绑定、锚点验证与批准门禁的回归证据。
