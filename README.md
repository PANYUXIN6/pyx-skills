# pyx-skills

面向 Codex 的个人 AgentSkills 集合。仓库关注的不只是“告诉模型做什么”，还包括在正确的位置设置证据、权限和可恢复性门禁，同时把方案选择、分析深度和局部实现方式留给模型判断。

每个顶层 skill 目录都是独立的运行时能力包，以 `SKILL.md` 作为入口，并按需包含 `references/`、`scripts/` 和 `agents/`。开发期评测统一放在仓库级 `evals/`，不会混入标准 skill 分发目录。

## 设计原则

- **最小有用上下文**：触发条件集中在 frontmatter，正文只保留会改变决策或行动的流程信息，详细协议按需加载。
- **门禁与自由度分离**：真实性、用户权限、不可逆操作和责任边界使用明确门禁；设计、落点、测试层级和审查深度按上下文判断。
- **证据匹配结论**：测试通过、功能完成、规格符合或安全问题等声明必须由相应的当前证据支持。
- **显式意图优先**：用户明确调用 skill 时遵循其工作流；自动路由只在 skill 能实质改善任务时介入。
- **开发资源隔离**：fixtures、支持 stub、评测结果和 Runner 留在 `evals/`，运行时 skill 保持精简。

## Skills

| Skill | 主要作用 | 适用场景与边界 |
| --- | --- | --- |
| [`using-superpowers`](./using-superpowers/) | 为实质任务选择最小有用 skill 集合。 | 单一明显匹配可直接进入领域 skill；组合需求、选择歧义、显式请求和必要依赖由 Router 协调，弱相关话题不触发工作流。 |
| [`brainstorming`](./brainstorming/) | 在实现前按不确定性、影响范围和可逆性选择适量设计工作。 | 清晰、局部、可逆的任务直接继续；真实取舍进入设计简报，高影响或难回滚决策需完成设计并取得确认。 |
| [`repo-map-first`](./repo-map-first/) | 用仓库证据解决代码落点和地图可信度。 | 自动路由只覆盖归属不明、跨边界或地图可疑等定位风险；用户显式调用时完成地图工作，dependent skill 可请求严格 bootstrap。 |
| [`tdd`](./tdd/) | 用最小可信测试证据驱动明确要求的测试先行开发。 | 保留有效 Red、独立 oracle 和当前验证；普通测试或集成测试请求不会自动升级为 TDD。 |
| [`reliable-task-execution`](./reliable-task-execution/) | 按风险加载验证、安全操作、诊断恢复、任务连续性、委派和独立审查规范。 | 保护证据、可恢复性和用户控制，但不强制 plan、TDD、worktree、subagent、commit 或固定开发阶段。 |
| [`code-review`](./code-review/) | 以 Skill 路由语义审查，以确定性 Runner 冻结输入、校验锚点、记录声明式 disposition 并约束结论。 | 未提交工作区会分别冻结 staged、unstaged、untracked；Agent 读取紧凑审查队列，完整 Manifest 留给 Runner；只有 change-set 比较结论要求 baseline，默认只报告、不自动修复。 |
| [`review-design-contracts`](./review-design-contracts/) | 对 Markdown 设计文档执行分层契约提取、架构审查、对抗验证、确定性门禁和人工仲裁。 | 仅在显式调用 `$review-design-contracts` 时使用；模型 finding 只有经过人工接受后才能进入修复队列。 |

## 使用方式

Codex 主要根据每个 `SKILL.md` 的 `name` 和 `description` 自动判断是否加载 skill。清晰描述任务目标通常比在每条请求中列出 skill 更重要。

典型请求：

```text
审查当前未提交的代码，只报告有证据的问题，不要修改。

检查支付功能当前实现是否满足 specs/payment.md；我不需要 Git 历史对比。

用测试驱动开发为 parser 增加转义字符支持。

这个功能跨 API 和数据层，但职责归属不清，先确定正确落点再实现。

使用 $review-design-contracts 审查 docs/design.md。
```

调用边界以各目录中的 `SKILL.md` 为准。仓库的观察性结构说明见 [`docs/REPO_MAP.md`](./docs/REPO_MAP.md)，架构和依赖方向见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

## 评测

六个通用运行时 skill 共用零第三方 Python 依赖的最小行为评测 Runner。当前 suites 共包含 20 个确定性 case，覆盖自动触发、负向路由、关键工作流选择和安全退出边界。

运行本地 Runner 测试：

```bash
python3 -m unittest discover -s evals/tests -p 'test_*.py'
```

验证单个 suite 的 manifest、cases 和 fixtures：

```bash
python3 evals/scripts/run_eval.py \
  --suite-root evals/suites/code-review \
  static
```

真实 Codex smoke 先查看预算，再显式批准调用上限：

```bash
python3 evals/scripts/run_eval.py \
  --suite-root evals/suites/code-review \
  smoke --dry-run

python3 evals/scripts/run_eval.py \
  --suite-root evals/suites/code-review \
  smoke --max-codex-calls 5
```

真实 smoke 会在隔离 workspace 和临时 `CODEX_HOME` 中运行，并把 suite prompt、合成 fixtures 和被测 skill 发送给 Codex 服务。执行前应确认数据出境范围和调用预算。历史结果默认保存在对应 suite 的 `results/` 中；不要用旧报告证明修改后的 skill。

两个确定性 Runner 使用独立的 Node.js 测试：

```bash
node --test code-review/scripts/review.test.mjs
node --test evals/tests/review-design-contracts/review-design.test.mjs
```

这些评测证明的是可观察的触发、路由、文件状态和命令证据，不宣称某个设计或代码审查在所有上下文中全局最优，也不等同于跨模型、重复 trial 或统计稳定性评估。

## 目录约定

| 路径 | 用途 |
| --- | --- |
| `<skill-name>/SKILL.md` | Skill 入口、触发条件、核心工作流和边界。 |
| `<skill-name>/references/` | 按需加载的协议、角色说明、检查清单和 Schema。 |
| `<skill-name>/scripts/` | Skill 自己拥有的确定性脚本。 |
| `<skill-name>/agents/` | Codex 界面和默认提示词等元数据。 |
| `evals/scripts/` | 共享行为评测 Runner。 |
| `evals/suites/<skill-name>/` | Manifest、cases、fixtures、支持 stub 和本地结果。 |
| `evals/tests/` | Runner、隔离和 fake-Codex 端到端测试。 |
| `docs/REPO_MAP.md` | 当前仓库结构、职责、入口和关键流程。 |
| `docs/ARCHITECTURE.md` | 模块边界、依赖方向、状态所有权和运行边界。 |

## 修改检查清单

修改 skill 时保持改动与真实失败模式对应：

1. 更新 `SKILL.md` 或按需 reference，避免在多个文件重复同一规则。
2. 为新的触发或行为边界增加最小正向或负向 case。
3. 运行相关 suite 的 `static`、Runner 单元测试和 `git diff --check`。
4. 行为风险值得真实验证时，先 dry-run，再使用显式调用预算执行 smoke。
5. 职责、入口、关键流程或依赖方向变化时，同步仓库地图和架构文档。
