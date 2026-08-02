# pyx-skills

每个顶层 skill 目录都是一个相对独立的能力包，以 `SKILL.md` 作为入口，并可按需包含 `references/`、`scripts/` 和 `agents/` 等资源。

## Skills

| Skill | 主要作用 | 适用场景与特点 |
| --- | --- | --- |
| [`repo-map-first`](./repo-map-first/) | 在修改现有仓库前先读取或建立仓库地图，定位正确的代码入口、模块边界与调用链，并在结构发生变化后同步地图文档。 | 适合陌生仓库、跨文件改动、功能扩展和行为调整；也可以在其他 skill 明确请求时，为缺失的 `REPO_MAP.md` 或 `ARCHITECTURE.md` 生成观察性仓库上下文。 |
| [`code-review`](./code-review/) | 提供统一的代码审查入口，根据请求自动路由到日常改动审查、规格验收审查或安全、可靠性、架构、SOLID、性能、正确性等专项审查。 | 可审查 Git diff、PR 或提交范围；默认只报告问题，不自动修改代码。 |
| [`review-design-contracts`](./review-design-contracts/) | 对 Markdown 设计文档执行分层契约审查，包括自洽检查、架构检查、对抗性验证、确定性证据门禁和人工仲裁。 | 仅在显式调用 `$review-design-contracts` 时使用；保留固定模型与推理强度，并在仓库地图缺失时条件调用 `repo-map-first`。模型发现的问题只有经过人工接受后才能进入修复队列。 |

## 目录约定

| 路径 | 用途 |
| --- | --- |
| `<skill-name>/SKILL.md` | Skill 的入口、触发条件、工作流和边界。 |
| `<skill-name>/references/` | 按需加载的协议、角色说明、检查清单和 Schema。 |
| `<skill-name>/scripts/` | Skill 自己维护的确定性脚本与测试。 |
| `<skill-name>/agents/` | Codex 界面和默认提示词等元数据。 |
