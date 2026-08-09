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

L3 响应使用版本化契约：Manifest v5 的新任务通过增量角色只返回允许变化字段的 `refinement`，Runner 复用原候选的不可变 layer/contract；v3/v4 任务继续由独立 legacy 角色与 Schema 兼容完整 `refined_finding`。

`repo-map-first` 独立拥有仓库落点判断与文档同步职责。自动路由只覆盖归属不明、跨模块边界、入口或依赖变化以及地图可疑等真实定位风险；用户显式调用会绕过自动过滤并强制完成相关地图工作。它不参与正常设计审查；只有 `review-design-contracts` 发现默认仓库文档缺失时，才显式请求其严格的仓库上下文引导模式。

`brainstorming`、`using-superpowers`、`reliable-task-execution`、`tdd`、`repo-map-first` 与 `code-review` 是相互独立的运行时 skill。它们的开发期行为评测位于仓库级 `evals/`：共享最小集成 Runner、Schema 和本地测试，与 `evals/suites/<skill-name>/` 中的 suite 数据分离，避免开发资源进入运行时分发包。

## 依赖方向

观察到的条件依赖方向为：

```text
review-design-contracts ──缺失仓库文档时──> repo-map-first
review-design-contracts ──每次运行──> Codex Native subagent 工具
review-design.mjs ──读取──> review.config.json + references/
brainstorming ──用户接受视觉伴侣时──> brainstorming/scripts/
evals/suites/<skill-name> ──开发期──> evals/scripts/run_eval.py
```

`repo-map-first` 不反向依赖 `review-design-contracts`。设计审查 Runner 不调用模型 API、CLI 后端或其他 provider；模型与推理强度由其任务描述传给当前 Codex 提供的 Native `spawn_agent`。独立的行为评测 Runner 会在隔离 workspace 与临时 `CODEX_HOME` 中调用 Codex CLI，并只保存可确定验证的文件、命令和输出证据。

## 主要控制流

1. 编排层确认目标设计路径，并检查仓库地图和架构文档。
2. 如果缺少文档，`repo-map-first` 读取仓库规则、清单、入口、模块、调用方和测试，只生成缺失的观察性文档。
3. Runner 的 `prepare` 将目标设计、confirmed authority 和 observed context 分类并进行内容摘要绑定。
4. Runner 创建 L1 后，从其有效候选中提前调度部分独立 L3，并与 L2 组成不超过并发上限的混合批次；L2 完成后合并候选并继续其余 L3。每个子任务只能读取自己的封闭证据包并写入指定响应文件。
5. Runner 消费响应、按 Manifest 版本校验 L3 Schema，并把增量 refinement 与原候选合并后验证引用证据；输入变化会使运行进入 `INVALIDATED`。
6. 幸存 finding 以短编号 evidence card 交给人工仲裁；Codex 收集中文决定和自然语言理由，但不拥有接受权。
7. 人工确认完整批次后，Runner 校验机器枚举、非空理由和批次覆盖，并保存可审计决定；只有明确接受才生成摘要绑定的修复队列。

## 状态与数据所有权

- Runner 拥有 `.superpowers/design-reviews/<target-sha>/<run-id>/` 下的运行状态和所有中间制品。
- Runner 额外拥有不参与审查判断的 `metrics.json`，只记录任务输入、Schema、指令、响应大小和观察时间。
- Native subagent 仅拥有自己任务目录中的 `response.json` 写权限语义，不拥有运行状态迁移权。
- 人工拥有 finding 的最终接纳权；Codex 只负责把短编号、中文菜单或自然语言理由转换为 Runner 输入，模型输出不能直接授权修复。
- Runner 拥有拒绝原因枚举校验和审计落盘职责；用户无需记忆或输入内部 reason code。
- `authority_status: observed` 的仓库文档仅描述当前实现事实，不能建立期望行为契约；目标设计、无标记的兼容文档、`confirmed` 文档或显式 `--authority` 才可作为正式契约来源。

## 外部与运行边界

- 运行依赖当前 Codex 环境提供 `spawn_agent`、`wait_agent` 和 `interrupt_agent`。
- 行为评测依赖本机 Codex CLI；真实模型 case 需要显式允许访问 Codex 服务，static 和 fake-Codex 单测不需要网络。
- 行为评测只保留 `static`、单个 `case` 和最小 `smoke`：前两类本地结构/假执行测试零外部调用；`brainstorming`、`using-superpowers`、`reliable-task-execution`、`tdd`、`repo-map-first`、`code-review` 的真实 smoke 上限分别为 1、8、2、2、2、4 次。没有语义判分、baseline、重复 trial、regression 或 differential；多案例 smoke 在调用前必须同时满足 manifest 硬上限和显式 `--max-codex-calls` 预算。
- Runner 仅允许执行 `review.config.json` 中白名单声明的确定性验证命令。
- skill 包本身不保存评审运行数据，也不自动创建外部 issue、PR 或工单。
