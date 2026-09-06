# pyx-skills

面向 Codex 的个人 AgentSkills 集合。仓库关注的不只是“告诉模型做什么”，还包括在正确的位置设置证据、权限和可恢复性门禁，同时把方案选择、分析深度和局部实现方式留给模型判断。

每个顶层 skill 目录都是独立的运行时能力包，以 `SKILL.md` 作为入口，并按需包含 `references/`、`scripts/` 和 `agents/`。开发期评测统一放在仓库级 `evals/`，不会混入标准 skill 分发目录。

## 设计原则

- **最小有用上下文**：触发条件集中在 frontmatter，正文只保留会改变决策或行动的流程信息，详细协议按需加载。
- **门禁与自由度分离**：真实性、用户权限、不可逆操作和责任边界使用明确门禁；设计、落点、测试层级和审查深度按上下文判断。
- **证据匹配结论**：测试通过、功能完成、规格符合或安全问题等声明必须由相应的当前证据支持。
- **显式意图优先**：用户明确调用 skill 时遵循其工作流；自动路由只在 skill 能实质改善任务时介入。
- **开发资源隔离**：fixtures、支持 stub、评测结果和 Runner 留在 `evals/`，运行时 skill 保持精简。

## Skills 如何协作

这些 skill 构成的是一条按风险选择的工作流，不是每个任务都必须经过的固定流水线：

```text
任务进入
  └─ using-superpowers：选择最小有用 skill 集合
       ├─ 存在会改变实现的产品或架构不确定性
       │    └─ brainstorming：完成适量设计，必要时形成 governing design 和可靠实施切片
       ├─ 代码归属、入口或依赖方向存在真实定位风险
       │    └─ repo-map-first：从仓库证据确定落点，必要时维护观察性地图
       ├─ 进入实现
       │    ├─ 新增、修改或评审自动化测试 → testing-guidelines
       │    │    └─ 用户明确要求测试先行 → 同时使用 tdd
       │    └─ 出现相应执行风险 → reliable-task-execution 按需加载保护模块
       ├─ 用户明确要求清理冗余表面
       │    └─ simplify-codebase：证明消费者关系后审计或删除完整闭包
       ├─ 用户明确要求审查代码或验证实现
       │    └─ code-review：冻结目标、语义审查、逐项挑战，只报告确认成立的 Finding
       └─ 用户显式调用设计契约审查
            └─ review-design-contracts：分层审查、人工裁决、独立修复复核
```

`reliable-task-execution` 是横切保护层，不是一个额外开发阶段。`repo-map-first`、`testing-guidelines`、`tdd`、`simplify-codebase` 和两类 review 也只在各自触发条件成立时介入。一个简单、局部、可逆的修改可能直接实现并验证，不需要设计文档、仓库地图、测试设计、TDD 或独立审查。

### 跨 Agent 的推荐闭环

当高影响任务由不同 Agent 分担设计、实现和审查时，可以这样组合：

1. 设计 Agent 使用 `brainstorming` 完成 Full Design。上位设计拥有共享契约、依赖顺序和端到端验收；每个实施切片明确目标与非目标、前置条件、责任边界、继承约束、局部自由度和完成证据。
2. 实现 Agent 以设计文档为契约执行切片。只有落点存在真实风险时才使用 `repo-map-first`；新增或修改测试时使用 `testing-guidelines`，只有用户明确要求测试先行时才同时使用 `tdd`；在声称完成前由 `reliable-task-execution` 要求当前验证证据。
3. 审查 Agent 使用 `code-review`，把设计文档作为验收 authority，把最终代码或变更集作为只读目标。确定性检查应先由实现 Agent 完成，审查 Agent 重点判断契约偏离、跨边界遗漏和高风险缺陷。
4. 确认成立的 Finding 在用户授权后交回实现 Agent 做根因修复并补充证据；原审查 Agent 按风险定向复核。若 Finding 证明共享契约或切片边界本身错误，则先回到设计 Agent 修订 governing design，再继续实现。

设计审查和代码审查是两条不同路径：`review-design-contracts` 判断设计文档自身的契约质量，`code-review` 判断实现是否存在代码缺陷或违反已确认契约。二者都不会因为“检查一下”这种中性表达自动触发，也不会在只读审查后擅自进入修复。

## 每个 Skill 做什么

### [`using-superpowers`](./using-superpowers/)

- **触发**：实质任务开始时，skill 选择会明显改变执行流程；用户显式点名某个 skill；或一个工作流需要另一个 skill 作为必要前置。
- **职责**：从显式请求、强匹配场景和必要依赖中选择最小有用集合，安排依赖顺序，并解决重叠工作流的职责归属。
- **产出**：当前任务实际启用的 skill 组合及简短理由；单一明确匹配可以直接进入对应领域 skill。
- **边界**：弱相关话题不是触发条件；它不为每个任务堆叠所有可用 skill，也不替代领域 skill 的具体流程。

### [`brainstorming`](./brainstorming/)

- **触发**：用户明确要求构思或设计，或未解决的取舍、影响范围和回滚成本可能实质改变实现。
- **职责**：先检查项目事实，再按风险选择 Fast Path、Design Brief 或 Full Design；按未决问题需要研究成熟方案，收敛关键决策、责任边界、失败行为和验证策略。
- **产出**：小任务可以直接进入实现；中等不确定性得到可确认的设计简报；高影响任务形成足以指导实现的设计结论，并按协作需要写成文档；已有授权不重复确认。依赖任务进一步形成 governing design 和可靠实施切片，使另一个 Agent 能在不重做架构推理的情况下执行。
- **边界**：不为清晰、局部、可逆任务制造设计流程；不生成稻草人方案；不把实施切片写成缺少仓库证据的文件级伪代码，也不强制设计文档永久保留。

### [`repo-map-first`](./repo-map-first/)

- **触发**：代码归属不明、变更跨越职责边界、入口或依赖方向可能改变、仓库不熟悉，或相关地图缺失、陈旧、矛盾；显式查看或使用地图时核对并报告，显式创建、修复或更新时才按请求修改地图。
- **职责**：从规则、源码、入口、调用链、依赖和测试中确定正确落点；区分 confirmed contract 与 `authority_status: observed` 的观察性地图；为 dependent skill 引导或验证必要的仓库上下文。
- **产出**：简明的落点判断和证据；按显式请求报告地图核对结果，或创建、修复指定文档；实现导致结构变化时同步地图。
- **边界**：跨文件本身不等于定位风险；观察性地图只能帮助导航，不能覆盖当前源码或已确认契约；局部落点已经清楚时应快速退出。

### [`testing-guidelines`](./testing-guidelines/)

- **触发**：新增、修改或评审自动化测试及测试策略，包括单元、集成、回归和端到端测试；仅运行已有测试或报告结果不触发。
- **职责**：从可观察行为和现实失败风险中选择最小可信证据集，控制等价类、重复测试、测试层级、test doubles 和 coverage 的使用。
- **产出**：能区分目标行为与重要失败机制的聚焦测试证据，以及与风险相称的验证范围。
- **边界**：不规定测试必须先于实现，也不因普通测试请求触发 TDD；项目特有命令和更强约束仍由目标仓库拥有。

### [`tdd`](./tdd/)

- **触发**：用户明确要求 TDD、test-first、red-green-refactor，或要求修复前先添加回归测试。
- **职责**：在 `testing-guidelines` 选定测试证据后，按确认行为、有效 Red、合理 Green 和局部 Refactor 的顺序推进垂直切片。
- **产出**：因目标行为缺失而失败、随后因最小合理实现而通过的当前切片，以及保持绿色的局部重构。
- **边界**：只拥有测试先行的执行顺序，不拥有测试数量、层级、mock 或 coverage 规范；普通“写测试”不会自动升级成 TDD。

### [`reliable-task-execution`](./reliable-task-execution/)

- **触发**：任务涉及完成声明、不可逆或外部状态变化、调试与重复失败、长任务连续性、subagent 委派或高风险独立审查。
- **职责**：按需加载 `verification`、`safe-operations`、`diagnosis-and-recovery`、`task-continuity`、`delegation` 或 `independent-review` 模块，保护证据、可恢复性和用户控制。
- **产出**：与当前风险相称的验证、恢复或权限证据；例如完成声明前的当前测试结果、破坏性操作前的精确目标与恢复路径、委派结果的宿主复核。
- **边界**：不强制 plan、TDD、worktree、subagent、commit 或固定阶段；小型本地修改通常只需要最终验证模块。

### [`code-review`](./code-review/)

- **触发**：目标包含代码或机器消费的实现制品，并且用户明确要求发现缺陷或风险、评估质量、验证正确性或契约符合性、执行专项审查或给出审查结论。
- **职责**：选择 routine、acceptance 或 focused 工作流；由 Runner 冻结 Git 分层变更、固定比较范围或 current-state 文件集；Agent 负责语义分析，Runner 负责输入完整性、逐项 disposition、候选锚点、挑战覆盖和结论门禁。
- **产出**：只包含挑战后仍确认成立的 P0–P3 Finding，并同时报告冻结范围、审查维度、已执行检查、排除项、残余风险和有界结论。
- **边界**：单纯阅读、解释、梳理或追踪代码不触发；Markdown 设计文档自身不属于审查目标；审查保持目标只读，Finding 不自动授权修复；Runner 证明流程状态，不证明模型判断天然正确。

### [`simplify-codebase`](./simplify-codebase/)

- **触发**：用户明确要求清理或简化，或一个已观察到的强候选需要跨当前代码行追踪真实消费者。
- **职责**：选择只读 `audit` 或获授权的 `apply`，再选择局部 `light` 或跨边界 `deep`；把引用分类为生产、非生产、歧义和外部契约消费者，并为候选给出 `remove`、`keep` 或 `defer`。
- **产出**：审计模式给出带消费者证据的候选裁决；执行模式直接删除获准候选的完整废弃闭包，包括实现、注册、专属测试、文档、配置和依赖残留，并运行仓库自有门禁。
- **边界**：不是每次 code review 的固定清理阶段；lint、格式、孤立未使用 import 或无消费者证据的“看起来复杂”不触发；删除优先于以新抽象、兼容层或临时路径替换旧表面。

### [`review-design-contracts`](./review-design-contracts/)

- **触发**：审查 Markdown 设计时，用户必须显式调用 `$review-design-contracts`；应用某次已接受修复队列或在独立任务中验证该修复时，也必须由用户明确提出对应操作。
- **职责**：在 `review`、`apply-fixes`、`verify-fixes` 三种互斥模式中运行；核对 governing authority 与观察性仓库上下文，通过确定性 Runner 编排分层契约提取、架构分析、对抗验证、作者答辩和人工裁决。
- **产出**：review 模式产生供人工判断的 Evidence Cards；只有人工明确接受的条目进入摘要绑定的修复队列；apply-fixes 消费队列并停止；verify-fixes 在独立任务中做有界复核或要求全量重审。
- **边界**：模型 finding 不能直接授权修复；review 与 verify-fixes 保持目标只读；修复 Agent 不能在同一任务中自我验证；观察性地图不能充当规范性 authority。

## 调用方式与示例

Codex 主要根据每个 `SKILL.md` 的 `name` 和 `description` 自动判断是否加载 skill。清晰描述任务目标、操作权限和期望结论，通常比在每条请求中列出全部 skill 更有效。需要强制某个仅显式触发的工作流时，应直接点名。

```text
为这项跨 API、数据库和权限边界的功能先产出设计文档，并拆成可独立验证的实施切片。

这个功能职责归属不清，先根据仓库证据确定正确落点再实现。

为现有 parser 补充转义字符的单元测试，不修改实现。

用测试驱动开发为 parser 增加转义字符支持。

审查当前未提交的代码，只报告有证据的问题，不要修改。

验证支付功能当前实现是否满足 specs/payment.md；不需要 Git 历史归因。

调查这个子系统是否存在没有生产消费者的旧 API；先只报告，不修改。

使用 $review-design-contracts 审查 docs/design.md。
```

调用边界以各目录中的 `SKILL.md` 为准。仓库的观察性结构说明见 [`docs/REPO_MAP.md`](./docs/REPO_MAP.md)，架构和依赖方向见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

`simplify-codebase` 的仓库准备建议和调用示例见 [`docs/SIMPLIFY_CODEBASE_USAGE.md`](./docs/SIMPLIFY_CODEBASE_USAGE.md)。这是一份面向维护者的外部说明，不属于 Skill 运行时内容。

## 评测

八个通用运行时 skill 共用零第三方 Python 依赖的最小行为评测 Runner。当前 suites 共包含 31 个确定性 case，覆盖自动触发、负向路由、关键工作流选择和安全退出边界。

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
