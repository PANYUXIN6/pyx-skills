# Review Design Contracts 迁移设计

## 目标

将 `review-design-contracts` 从项目本地的 `.agents/skills/` 目录迁移到当前个人 skills 仓库，并继续将其作为 Codex 专用 skill。保留现有的分层原生 subagent 审查协议、固定模型配置、确定性证据门禁、人工仲裁和修复队列行为。

移除“被审查仓库必须预先存在 `docs/REPO_MAP.md` 和 `docs/ARCHITECTURE.md`”这一强制运行条件。任一文件缺失时，在创建评审运行前调用同仓库的 `repo-map-first`，读取真实仓库并生成缺失的观察性上下文文档。

## 范围

### 包含范围

- 迁移 `review-design-contracts` 的全部有效文件，排除 `.DS_Store`。
- 保持现有 `gpt-5.6-sol` 模型和推理强度配置不变。
- 使 skill 脚本调用不再依赖原来的 `.agents/skills/` 路径。
- 为 `repo-map-first` 增加显式的仓库上下文引导模式。
- 将自动生成的仓库地图归类为观察性上下文，而不是已确认的正式 authority。
- 扩展 Runner，使其分别携带观察性上下文和 authority 文档。
- 对所有评审输入继续执行内容摘要校验和失效处理。
- 更新并扩充自动化测试。

### 不包含范围

- 支持 Codex 以外的 agent 框架。
- 替换原生 `spawn_agent`、`wait_agent` 或 `interrupt_agent`。
- 修改 L1/L2/L3 的审查语义、Schema、人工仲裁或修复队列。
- 替换 Node.js Runner 或增加 npm 依赖。
- 重命名 `.superpowers/design-reviews/` 运行产物目录。
- 自动把生成的文档视为已确认的项目架构契约。

## Skill 依赖关系

`review-design-contracts` 对同仓库的 `repo-map-first` 存在条件依赖：

- 两份仓库文档都存在时，不调用 `repo-map-first`，直接继续。
- 任一文档缺失时，在执行 `prepare` 前调用 `repo-map-first` 的仓库上下文引导模式。
- 需要引导但依赖不可用时，在创建评审运行前停止，并报告缺少依赖。
- 引导过程无法获得足以描述当前仓库的证据时，以 `INSUFFICIENT_INPUT` 停止。

AgentSkill 的 frontmatter 只支持 `name` 和 `description`，因此在 skill 正文中声明该依赖。

## 仓库上下文引导

为 `repo-map-first` 增加一个必须显式调用的引导模式。虽然纯 review 任务通常不触发该 skill，但 `review-design-contracts` 的评审预检查可以显式调用此模式。

引导流程：

1. 读取适用的仓库规则和已有文档。
2. 使用 `rg --files`、`rg` 和针对性的文件读取检查真实仓库。
3. 定位项目清单、workspace、入口点、相关模块、公共契约、调用方、依赖方和测试。
4. 只创建缺失的 `docs/REPO_MAP.md` 或 `docs/ARCHITECTURE.md`。
5. 不因为另一份文档缺失而覆盖已经存在的文档。
6. 保持被审查的设计文档不变。
7. 在每份新生成文档的顶部写入以下 provenance frontmatter：

```yaml
---
generated_by: repo-map-first
authority_status: observed
---
```

生成内容只描述从仓库中观察到的结构，不声称它是经过人工批准的架构契约。

后续执行普通 `repo-map-first` 地图同步时，必须保留该 provenance，除非用户明确把 `authority_status` 修改为 `confirmed`。

## Authority 与 Context 分类

Runner 按以下规则分类默认仓库文档：

- 已有文档没有 `authority_status` 标记：为保持向后兼容，将其视为 authority。
- 文档标记为 `authority_status: confirmed`：视为 authority。
- 文档标记为 `authority_status: observed`：视为 repository context。
- 通过 `--authority <path>` 显式提供的文档：因为用户主动指定，将其视为 authority。同一路径也被识别为观察性上下文时，显式 authority 分类优先。

运行清单将 target、authority 和 repository context 记录为不同角色。三类文档都进行内容寻址，并参与运行失效检查。

L2 接收：

- 完整目标设计文档；
- Contract Ledger；
- 所有已确认的 authority 文档；
- 所有观察性 repository context 文档。

架构类 L3 任务接收与 L2 相同的文档证据和完整 Contract Ledger，以便独立挑战 L2 候选。自洽类 L3 任务继续使用现有的较窄证据包。

观察性上下文可以用于证明文件、入口点、依赖或调用路径是否存在。Finding 的预期契约仍必须来自目标设计或已确认的 authority。没有已确认架构 authority 时，面向用户的报告必须披露：架构覆盖依据是目标设计和观察到的仓库结构。

## 模型与 Native Task 行为

完整保留 `review.config.json` 中的模型设置：

- L1 自洽检查：`gpt-5.6-sol`，`high` 推理强度。
- L2 架构检查：`gpt-5.6-sol`，`max` 推理强度。
- L3 对抗验证：`gpt-5.6-sol`，`max` 推理强度。

每个任务描述继续返回 `model` 和 `reasoning_effort`，并将其原样传给原生 `spawn_agent`。保留 `fork_turns: none`、超时处理、受限的 L3 并发，以及禁止使用 CLI 或 API 模型后端兜底的规则。

## 可移植调用方式

替换所有假设 `.agents/skills/review-design-contracts/` 路径的命令。执行时先解析当前生效的 `review-design-contracts/SKILL.md` 所在目录，再使用绝对路径调用 Runner：

```text
node <review-design-contracts-skill-directory>/scripts/review-design.mjs <command> ...
```

Runner 已经根据自身脚本目录解析配置和 references，因此不需要重新设计内部路径。

## 错误处理

- 默认地图或架构文档缺失：在 `prepare` 前调用引导依赖。
- 需要引导但 `repo-map-first` 不可用：停止，不创建运行。
- 引导过程缺少足够仓库证据：返回 `INSUFFICIENT_INPUT`。
- 显式 authority 路径无效：立即失败。
- 打包后，自动生成或已确认的输入发生变化：在消费任务响应前将运行转换为 `INVALIDATED`。
- Native 工具不可用、subagent 错误、超时或缺少响应：保留现有 `fail-task` 行为。
- 模型输出无效：保留一次全新重试，第二次失败后进入终止失败状态。

## 文件改动

### `review-design-contracts`

- 迁移 17 个有效文件并排除 `.DS_Store`。
- 更新 `SKILL.md`，加入可移植调用和引导编排规则。
- 更新 `review-protocol.md`，加入 authority/context provenance 规则。
- 更新 Runner，分类并打包观察性上下文。
- 更新测试和评测断言；除非新的 manifest 角色确实需要，否则不修改现有评审 Schema。

### `repo-map-first`

- 增加显式的仓库上下文引导例外和工作流。
- 定义创建每份缺失文档所需的最低证据。
- 增加 provenance 要求。
- 后续地图同步时保留 provenance。
- 普通纯 review 任务继续不触发；只有依赖 skill 明确请求时才进入引导模式。

## 验证

运行现有 `review-design.test.mjs` 测试套件，并保留全部现有行为保证。新增以下测试：

1. 两份默认文档都存在，并保持为已确认 authority。
2. 一份默认文档为观察性上下文，另一份保持 authority。
3. 两份默认文档都是观察性上下文。
4. 显式提供的 authority 覆盖观察性分类。
5. 观察性上下文变化会使运行失效。
6. 架构 L2 和 L3 分别接收 context 与 authority。
7. 固定模型和推理强度映射保持不变。
8. 迁移后的 skill 不再包含 `.agents/skills/` 调用路径。
9. 不包含 `.DS_Store` 的 skill 校验与打包成功。

此外，运行 AgentSkill 快速校验器，并将迁移后的 skill 临时打包。设计文档修订应使用独立提交，不能包含无关的未跟踪 skill 文件。
