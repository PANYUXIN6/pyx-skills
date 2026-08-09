# pyx-skills

每个顶层 skill 目录都是一个相对独立的能力包，以 `SKILL.md` 作为入口，并可按需包含 `references/`、`scripts/` 和 `agents/` 等资源。

## Skills

| Skill | 主要作用 | 适用场景与特点 |
| --- | --- | --- |
| [`repo-map-first`](./repo-map-first/) | 在代码归属不明确、跨模块边界或地图可疑时，先用仓库证据解决实现落点，并在结构变化后同步地图。 | 自动路由跳过位置明确的局部修改；用户手动调用时必须完成地图检查或补齐，dependent skill 请求的缺失文档 bootstrap 保持严格。 |
| [`code-review`](./code-review/) | 提供统一的代码审查入口，根据请求自动路由到日常改动审查、规格验收审查或安全、可靠性、架构、SOLID、性能、正确性等专项审查。 | 可审查未提交工作区、当前功能实现、Git diff、PR 或提交范围；只有比较结论才要求 Git baseline，默认只报告问题。 |
| [`review-design-contracts`](./review-design-contracts/) | 对 Markdown 设计文档执行分层契约审查，包括自洽检查、架构检查、对抗性验证、确定性证据门禁和人工仲裁。 | 仅在显式调用 `$review-design-contracts` 时使用；保留固定模型与推理强度，并在仓库地图缺失时条件调用 `repo-map-first`。模型发现的问题只有经过人工接受后才能进入修复队列。 |
| [`brainstorming`](./brainstorming/) | 在实现前按不确定性、影响范围和可逆性选择适量设计工作，并优先给出最佳设计。 | 清晰可逆任务直接继续；只有真实取舍需要用户意图时才展示多个可信方案，高风险设计需先获得批准。 |
| [`using-superpowers`](./using-superpowers/) | 在 skill 选择会实质改变流程时组织最小有用集合。 | 单一明显匹配可直接进入领域 skill；组合需求、显式请求和必要依赖由 Router 协调，弱相关话题不触发额外工作流。 |
| [`reliable-task-execution`](./reliable-task-execution/) | 按风险渐进加载验证、安全操作、诊断恢复、任务连续性、委派和独立审查规范。 | 保留证据、可恢复性和用户控制，但不强制 plan、TDD、worktree、subagent、commit 或固定开发阶段。 |
| [`tdd`](./tdd/) | 在明确要求测试先行时，用最小可信测试证据驱动实现。 | 以独立行为和真实风险选择测试，保留有效 Red、独立预期与当前验证门槛；不因普通测试或集成测试请求自动触发。 |

## 目录约定

| 路径 | 用途 |
| --- | --- |
| `<skill-name>/SKILL.md` | Skill 的入口、触发条件、工作流和边界。 |
| `<skill-name>/references/` | 按需加载的协议、角色说明、检查清单和 Schema。 |
| `<skill-name>/scripts/` | Skill 自己维护的确定性脚本与测试。 |
| `<skill-name>/agents/` | Codex 界面和默认提示词等元数据。 |
| `evals/` | 仓库级开发资源：共享行为评测 Runner、Schema、测试，以及各 skill 的 suites；不进入标准 skill 分发包。 |
