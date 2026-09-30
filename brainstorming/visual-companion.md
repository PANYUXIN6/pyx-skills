# 可视化辅助指南

浏览器中的头脑风暴辅助界面，用于展示原型、图表和备选方案。

## 何时使用

逐个问题判断，而非按整场会话决定。判断标准是：**用户看到内容，会比阅读文字更容易理解吗？**

内容本身具有视觉性时使用浏览器：

- **界面原型**：线框图、布局、导航结构、组件设计。
- **架构图**：系统组件、数据流、关系图。
- **并排视觉比较**：两种布局、配色或设计方向。
- **设计细节**：外观感受、间距或视觉层级。
- **空间关系**：以图呈现的状态机、流程图或实体关系。

内容是文字或表格时使用终端对话：

- **需求与范围问题**：“X 是什么意思？”“哪些功能在范围内？”
- **概念方案选择**：从文字描述的 A/B/C 方案中选择。
- **取舍清单**：利弊或比较表。
- **技术决策**：API 设计、数据建模或架构方案选择。
- **澄清问题**：答案是文字而非视觉偏好的问题。

涉及界面的话题不一定需要视觉呈现。“你想要哪种向导？”是概念问题，用终端对话；“这几种向导布局哪种更合适？”是视觉问题，用浏览器。

## 工作方式

服务端监视一个目录中的 HTML 文件，并在浏览器中展示最新文件。写入 HTML 内容后，用户可以在浏览器中查看并点击选择。选择记录在 `.events` 文件中，下一轮读取。

**内容片段与完整文档：** 若 HTML 文件以 `<!DOCTYPE` 或 `<html` 开头，服务端会原样提供，只注入辅助脚本。否则会自动用框架模板包裹内容，补齐标题栏、CSS 主题、选择指示器和交互基础设施。**默认编写内容片段。**只有需要完全控制页面时才写完整文档。

## 开始会话

将 `<skill-dir>` 解析为本指南所在的绝对目录。从该目录运行内置脚本，不要相对用户项目解析 `scripts/`。

```bash
# 在项目中持久保存原型并启动服务
<skill-dir>/scripts/start-server.sh --project-dir /path/to/project

# 返回：{"type":"server-started","port":52341,"url":"http://localhost:52341",
#        "screen_dir":"/path/to/project/.superpowers/brainstorm/12345-1706000000"}
```

保存返回的 `screen_dir`，并请用户打开 URL。

**查找连接信息：** 服务端将启动 JSON 写到 `$SCREEN_DIR/.server-info`。如果服务在后台启动而标准输出未保存，可读取该文件获取 URL 和端口。使用 `--project-dir` 时，可在 `<project>/.superpowers/brainstorm/` 下查找会话目录。

传入项目根目录作为 `--project-dir`，让原型保存在 `.superpowers/brainstorm/`，服务重启后仍存在。不传时文件存于 `/tmp`，之后会被清理。若 `.gitignore` 尚未包含 `.superpowers/`，提醒用户加入。

**不同环境的启动方式：**

**Claude Code（macOS / Linux）：**

```bash
# 默认模式由脚本自行将服务放到后台
<skill-dir>/scripts/start-server.sh --project-dir /path/to/project
```

**Claude Code（Windows）：**

```bash
# Windows 会自动使用前台模式，导致工具调用阻塞；
# Bash 工具调用应设置 run_in_background: true，使服务跨轮次存活。
<skill-dir>/scripts/start-server.sh --project-dir /path/to/project
```

通过 Bash 工具调用时设置 `run_in_background: true`，下一轮读取 `$SCREEN_DIR/.server-info` 获取 URL 和端口。

**Codex：**

```bash
# Codex 会回收后台进程；脚本检测 CODEX_CI 后自动切到前台模式。
# 正常运行即可，无须额外参数。
<skill-dir>/scripts/start-server.sh --project-dir /path/to/project
```

**Gemini CLI：**

```bash
# 使用 --foreground，并在 Shell 工具调用中设置 is_background: true，
# 使进程跨轮次存活。
<skill-dir>/scripts/start-server.sh --project-dir /path/to/project --foreground
```

**其他环境：** 服务端需要在对话轮次之间持续运行。若环境会回收脱离的进程，应使用 `--foreground`，并通过该环境的后台执行机制启动命令。

如果浏览器无法访问 URL（远程或容器环境较常见），可绑定非回环地址：

```bash
<skill-dir>/scripts/start-server.sh \
  --project-dir /path/to/project \
  --host 0.0.0.0 \
  --url-host localhost
```

`--url-host` 控制返回的 URL JSON 中显示的主机名。

## 交互循环

1. **确认服务仍在运行，再写 HTML** 到 `screen_dir` 中的新文件：
   - 每次写入前检查 `$SCREEN_DIR/.server-info` 是否存在。若不存在，或存在 `.server-stopped`，说明服务已停止，应先用 `start-server.sh` 重启。闲置 30 分钟后服务会自动退出。
   - 使用有语义的文件名，如 `platform.html`、`visual-style.html`、`layout.html`。
   - **不要重复使用文件名**；每个画面都写到新文件。
   - 使用 Write 工具；**不要用 cat 或 heredoc**，以免终端出现大量噪声。
   - 服务端自动展示最新文件。
2. **告诉用户将看到什么，然后结束当前轮次：**
   - 每一步都提醒 URL，而非只在第一步提醒。
   - 简短概述画面内容，例如“展示首页的三种布局”。
   - 请用户在终端对话中回复：“看一下，告诉我你的想法；也可以点击选择喜欢的方案。”
3. **下一轮用户回复后：**
   - 若 `$SCREEN_DIR/.events` 存在，读取其中的浏览器交互记录；每行是一条 JSON。
   - 结合用户在终端输入的文字理解完整反馈。
   - 终端消息是主要反馈，`.events` 提供结构化交互数据。
4. **迭代或推进：** 如果反馈改变当前画面，写一个新文件，如 `layout-v2.html`。当前步骤确认后才进入下个问题。
5. **返回终端对话时清空过时画面：** 下一步不需要浏览器时（如澄清问题或讨论取舍），推送等待画面：

   ```html
   <!-- 文件名：waiting.html（或 waiting-2.html 等） -->
   <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
     <p class="subtitle">请继续在终端对话中交流…</p>
   </div>
   ```

   这样用户不会在讨论已转向别处后，仍盯着已经决定的旧方案。下一个视觉问题出现时，再推送新的内容文件。
6. 重复上述过程直至完成。

## 编写内容片段

只写页面主体内的内容。服务端会自动用框架模板补齐标题栏、主题 CSS、选择指示器和交互基础设施。

**最小示例：**

```html
<h2>哪种布局更合适？</h2>
<p class="subtitle">考虑可读性与视觉层级</p>

<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>单栏</h3>
      <p>阅读体验简洁、聚焦</p>
    </div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>双栏</h3>
      <p>侧边导航搭配主内容区</p>
    </div>
  </div>
</div>
```

不需要添加 `<html>`、CSS 或 `<script>` 标签；服务端已提供。

## 可用 CSS 类

框架模板为内容提供以下类：

### 选项（A/B/C 选择）

```html
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>标题</h3>
      <p>说明</p>
    </div>
  </div>
</div>
```

**多选：** 给容器添加 `data-multiselect`，用户即可选择多个选项。每次点击会切换该项状态，指示栏显示已选数量。

```html
<div class="options" data-multiselect>
  <!-- 相同的选项结构，用户可多选或取消选择 -->
</div>
```

### 卡片（视觉方案）

```html
<div class="cards">
  <div class="card" data-choice="design1" onclick="toggleSelect(this)">
    <div class="card-image"><!-- 原型内容 --></div>
    <div class="card-body">
      <h3>名称</h3>
      <p>说明</p>
    </div>
  </div>
</div>
```

### 原型容器

```html
<div class="mockup">
  <div class="mockup-header">预览：仪表盘布局</div>
  <div class="mockup-body"><!-- 原型 HTML --></div>
</div>
```

### 并排视图

```html
<div class="split">
  <div class="mockup"><!-- 左侧 --></div>
  <div class="mockup"><!-- 右侧 --></div>
</div>
```

### 利弊

```html
<div class="pros-cons">
  <div class="pros"><h4>优点</h4><ul><li>收益</li></ul></div>
  <div class="cons"><h4>缺点</h4><ul><li>代价</li></ul></div>
</div>
```

### 原型元素（线框图组件）

```html
<div class="mock-nav">标志 | 首页 | 关于 | 联系方式</div>
<div style="display: flex;">
  <div class="mock-sidebar">导航</div>
  <div class="mock-content">主内容区</div>
</div>
<button class="mock-button">操作按钮</button>
<input class="mock-input" placeholder="输入框">
<div class="placeholder">占位区域</div>
```

### 排版与区块

- `h2`：页面标题；
- `h3`：章节标题；
- `.subtitle`：标题下的辅助文字；
- `.section`：有底部间距的内容块；
- `.label`：小号大写标签。

## 浏览器事件格式

用户点击浏览器选项时，交互记录到 `$SCREEN_DIR/.events`，每行一个 JSON 对象。推送新画面时，文件会自动清空。

```jsonl
{"type":"click","choice":"a","text":"方案 A - 简洁布局","timestamp":1706000101}
{"type":"click","choice":"c","text":"方案 C - 复杂网格","timestamp":1706000108}
{"type":"click","choice":"b","text":"方案 B - 混合布局","timestamp":1706000115}
```

完整事件流反映用户探索过程：最终决定前可能点击多个选项。最后一条 `choice` 事件通常是最终选择，但点击模式也可能体现值得追问的犹豫或偏好。

若 `.events` 不存在，说明用户未与浏览器交互，只使用其终端文字反馈。

## 设计提示

- **按问题决定保真度：** 讨论布局用线框图，讨论细节就提供相应细节。
- **每页说清问题：** 写“哪种布局更显专业？”，不要只写“选一个”。
- **先迭代再推进：** 反馈改变当前画面时先写新版本。
- 每个画面最多 **2–4 个选项**。
- **必要时使用真实内容：** 摄影作品集应使用真实图片（如 Unsplash）；占位内容会掩盖设计问题。
- **保持原型简洁：** 聚焦布局和结构，不必追求像素级完美。

## 文件命名

- 使用有语义的名称，如 `platform.html`、`visual-style.html`、`layout.html`。
- 不要重复使用文件名；每个画面都应是新文件。
- 迭代时添加版本后缀，如 `layout-v2.html`、`layout-v3.html`。
- 服务端按修改时间展示最新文件。

## 清理

```bash
<skill-dir>/scripts/stop-server.sh $SCREEN_DIR
```

若会话使用 `--project-dir`，原型文件会保留在 `.superpowers/brainstorm/` 以供日后参考。停止服务时只有 `/tmp` 会话文件会被删除。

## 参考

- 框架模板（CSS 参考）：`scripts/frame-template.html`
- 辅助脚本（客户端）：`scripts/helper.js`
