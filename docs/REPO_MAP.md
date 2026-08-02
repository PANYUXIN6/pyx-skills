---
generated_by: repo-map-first
authority_status: observed
---

# 仓库地图

## 顶层结构

- `repo-map-first/`：在现有仓库中定位行为改动，并维护仓库地图与架构文档。
- `review-design-contracts/`：使用分层 Codex Native subagent 审查 Markdown 设计文档，最终由人工决定是否进入修复队列。
- `code-review/`：根据审查目标和维度路由日常、验收与专项代码审查工作流。
- `docs/superpowers/specs/`：保存非平凡 skill 变更的已确认设计文档。
- `README.md`：仓库用途、skill 清单和目录约定说明。

## Skill 入口与职责

- `repo-map-first/SKILL.md`：仓库定位、地图同步，以及依赖 skill 请求的仓库上下文引导入口。
- `review-design-contracts/SKILL.md`：设计审查编排入口；负责预检查仓库文档、启动 Runner，并按任务描述调度 Native subagent。
- `review-design-contracts/scripts/review-design.mjs`：确定性 Runner，负责打包输入、状态迁移、证据门禁、人工仲裁和修复队列。
- `review-design-contracts/scripts/review-design.test.mjs`：Runner 的端到端 Node.js 回归测试。
- `review-design-contracts/references/human-rejection-reasons.json`：人工驳回原因的中文菜单、内部 code 映射和默认审计理由。
- `<skill-name>/SKILL.md`：后续迁入个人 skill 的标准入口。

## 资源边界

- skill 内的 `references/` 保存按需加载的角色说明、协议和 JSON Schema。
- skill 内的 `scripts/` 保存该 skill 拥有的确定性可执行程序与测试。
- skill 内的 `agents/` 保存 Codex 界面元数据。
- `review-design-contracts` 的运行产物写入被审查仓库的 `.superpowers/design-reviews/`，不写入 skill 目录。

## 关键流程

1. Codex 根据 `SKILL.md` 的 description 选择工作流。
2. `review-design-contracts` 检查目标仓库中的 `docs/REPO_MAP.md` 与 `docs/ARCHITECTURE.md`。
3. 任一文档缺失时，它显式调用同仓库的 `repo-map-first` 仓库上下文引导模式，只生成缺失文档并标记为 `observed`。
4. Runner 将目标设计、已确认 authority 与观察性 context 分开打包，产出固定模型和推理强度的 Native subagent 任务。
5. L1 自洽检查、L2 架构检查、L3 对抗验证依次推进；Runner 执行摘要校验、确定性证据门禁和运行失效检查。
6. Runner 用短编号展示当前批次；Codex 以中文收集决定和自然语言驳回理由，完成整批确认后再生成机器 decisions JSON。
7. Runner 校验原因 code、非空理由和批次完整性；只有人工明确接受的 finding 才能进入 `fix-queue.json`。

## 公共契约与测试证据

- `review-design-contracts/review.config.json`：固定模型、推理强度、并发、超时、默认仓库文档和命令白名单。
- `review-design-contracts/references/review-protocol.md`：审查状态机、authority/context provenance 与人工仲裁协议。
- `review-design-contracts/references/human-rejection-reasons.json`：用户可见拒绝原因与机器枚举之间的受校验映射。
- `review-design-contracts/references/*.schema.json`：模型结果、证据卡和拒绝记录的机器可校验契约。
- `review-design-contracts/scripts/review-design.test.mjs`：上述流程及迁移兼容性的回归证据。
