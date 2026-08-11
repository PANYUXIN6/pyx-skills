---
generated_by: repo-map-first
authority_status: observed
---

# 仓库地图

## 顶层结构

- `repo-map-first/`：在代码归属不明、跨模块边界或地图可疑时定位行为改动；显式调用强制完成地图工作，并维护结构变化后的仓库地图与架构文档。
- `review-design-contracts/`：使用分层 Codex Native subagent 审查 Markdown 设计文档，最终由人工决定是否进入修复队列。
- `code-review/`：根据审查目标和维度路由日常、验收与专项代码审查工作流。
- `brainstorming/`：按不确定性、影响范围和可逆性选择快速执行、设计简报或完整设计，并按需提供可视化设计伴侣。
- `using-superpowers/`：在跨 skill 选择会实质改变流程时组织最小有用集合；单一明显匹配可直接进入领域 skill，组合需求由 Router 协调。
- `reliable-task-execution/`：按风险按需分发验证、安全操作、诊断恢复、任务连续性、委派和独立审查规范。
- `tdd/`：在明确采用测试先行时，用覆盖独立行为和真实风险的最小证据集驱动实现。
- `evals/`：六个 skill 共用的开发期行为评测基础设施和隔离 suites，不属于任何运行时 skill 包。
- `docs/superpowers/specs/`：保存非平凡 skill 变更的已确认设计文档。
- `.github/workflows/verify.yml`：GitHub Actions 持续集成入口，验证 Skill 仓库的 Python、Node.js 和空白字符检查。
- `LICENSE`：所有运行时 Skill 与仓库文档的 MIT 许可文本。
- `README.md`：仓库用途、skill 清单和目录约定说明。

## Skill 入口与职责

- `repo-map-first/SKILL.md`：自动落点风险、显式地图工作，以及依赖 skill 仓库上下文引导和验证的四模式入口。
- `review-design-contracts/SKILL.md`：设计审查编排入口；负责预检查上位设计（governing design）authority 与仓库上下文、启动 Runner，并按任务描述调度 Native subagent。上位关系由共享契约的归属决定，不等同于上一个任务。
- `review-design-contracts/scripts/review-design.mjs`：确定性 Runner，负责紧凑任务投影、任务成本指标、状态迁移、证据门禁、人工仲裁和修复队列。
- `review-design-contracts/scripts/review-design.test.mjs`：Runner 的端到端 Node.js 回归测试。
- `review-design-contracts/references/human-rejection-reasons.json`：人工驳回原因的中文菜单、内部 code 映射和默认审计理由。
- `review-design-contracts/references/adversarial-result.schema.json` 与 `adversarial-role.md`：新运行的增量 L3 契约；legacy Schema 与角色仅用于继续 v3/v4 历史运行。
- `brainstorming/SKILL.md` 与 `visual-companion.md`：设计深度选择入口和按需视觉交互指南；`scripts/` 提供本地伴侣服务器。
- `using-superpowers/SKILL.md`：需要跨 skill 取舍或组合时的最小集合路由入口。
- `reliable-task-execution/SKILL.md` 与 `references/`：可靠执行路由入口和六个按需规范。
- `tdd/SKILL.md`：风险驱动的测试先行入口；技能包不携带通用测试教程或开发期评测内容。
- `evals/scripts/run_eval.py`：六套 skill 共用的最小集成评测 Runner；只支持静态校验、定点 case 和小规模 smoke，并负责隔离执行、成本预估、profile 硬上限和显式调用预算门禁。`evals/suites/<skill-name>/` 共保留二十个具有确定性证据的案例；`brainstorming` 检查普通设计约束与依赖任务 Full Design 两类边界，`code-review` 检查日常、专项、当前状态验收与 comparison baseline 四类边界，`using-superpowers` 检查单 skill、组合 skill、选择歧义、显式调用、topic-only 与无需路由等边界，TDD 和 repo-map-first 各检查一正一负两个路由边界。
- `<skill-name>/SKILL.md`：后续迁入个人 skill 的标准入口。

## 资源边界

- skill 内的 `references/` 保存按需加载的角色说明、协议和 JSON Schema。
- skill 内的 `scripts/` 保存该 skill 拥有的确定性可执行程序与测试。
- skill 内的 `agents/` 保存 Codex 界面元数据。
- 开发期评测统一保存在仓库级 `evals/`，避免标准 skill 打包器递归收集测试、fixtures、历史结果或支持 stub。
- `review-design-contracts` 的运行产物写入被审查仓库的 `.superpowers/design-reviews/`，不写入 skill 目录。

## 关键流程

1. Codex 根据 `SKILL.md` 的 description 选择工作流。
2. `review-design-contracts` 检查目标是否依赖用户确认的上位设计，并检查目标仓库中的 `docs/REPO_MAP.md` 与 `docs/ARCHITECTURE.md`。
3. 任一仓库文档缺失时，它调用 `repo-map-first` 的仓库上下文引导模式；相关上下文可能陈旧时，调用验证模式，并保持被审设计不变。
4. Runner 将目标设计、显式与默认 confirmed authority、观察性 context 分开打包，记录覆盖范围，并产出固定模型和推理强度的 Native subagent 任务。
5. L1 完成后，L2 架构检查可与已验证 L1 候选的首批 L3 对抗任务并行；其余 L3 继续按固定并发分批。新 L3 只返回发生变化的候选字段，Runner 与不可变的原 layer/contract 合并后执行摘要校验、确定性证据门禁和运行失效检查。
6. Runner 用短编号展示当前批次；Codex 以中文收集决定和自然语言驳回理由，完成整批确认后再生成机器 decisions JSON。
7. Runner 校验原因 code、非空理由和批次完整性；只有人工明确接受的 finding 才能进入 `fix-queue.json`。
8. GitHub Actions 在推送到 `main` 或面向 `main` 的 Pull Request 上运行本地确定性验证，不运行真实 Codex smoke。

## 公共契约与测试证据

- `review-design-contracts/review.config.json`：固定模型、推理强度、并发、超时、默认仓库文档和命令白名单。
- `review-design-contracts/references/review-protocol.md`：审查状态机、authority/context provenance 与人工仲裁协议。
- `review-design-contracts/references/human-rejection-reasons.json`：用户可见拒绝原因与机器枚举之间的受校验映射。
- `review-design-contracts/references/*.schema.json`：模型结果、证据卡和拒绝记录的机器可校验契约。
- `review-design-contracts/scripts/review-design.test.mjs`：上述流程及迁移兼容性的回归证据。
