# HTML Deck

为大学课堂 pre、课程报告和答辩生成离线 HTML 幻灯片。双击 `assets/deck-template.html` 即可打开 10 页可运行示例，无需安装依赖或启动服务。除熟悉的放映操作，还支持逐步讲解、实时数学图表、物理模拟和可旋转三维模型。

工作区按用户提供的六张 PowerPoint 网页版截图重建：完整标签顺序、居中搜索、右侧操作区、单行功能区、文件浮层菜单、可折叠缩略图栏、紧凑备注条与缩放状态栏。按用户要求使用 PowerPoint 名称与官方图标，图标已内嵌，离线可显示。云端协作和未实现的内容编辑控件禁用，并通过提示说明原因。

## 开始一次 pre

1. 在“幻灯片放映”中选择“从头开始”或“从当前幻灯片开始”；右上角“演示”也可启动放映。全屏未获浏览器允许时仍可窗口内放映。
2. 需要看讲稿时，先点击“演示者视图”。它会打开独立窗口，显示当前页、下一页、备注和计时。将窗口拖到自己的显示器，只向听众共享另一个放映窗口。浏览器拦截弹窗时，允许本页弹窗再重试。
3. 点击幻灯片背景，或按方向键 / Space 执行下一步：先显示本页下一组内容，再翻页。上一页按钮 / ← 先撤回一步，再回到上一页的完整状态。数字 + Enter 直接跳页，G 打开所有幻灯片，Esc 结束放映。
4. 放映中按 B / W 切换黑屏 / 白屏；L 开关激光笔，P 开关画笔，E 清除本页墨迹。墨迹按页保留到关闭页面，不写入文件或 PDF。
5. 点击“文件”打开浮层菜单。“打印”可通过浏览器另存 PDF；“创建副本 · HTML”或“导出 · HTML”下载完整程序和内嵌资源，不包含临时墨迹、步骤、计时、交互参数或模拟状态。“重命名”修改显示名称和下载副本名称，不更改磁盘上的原文件。

工作区始终显示完整内容。每次从工作区开始放映，从当前页第 0 步开始；缩略图、概览、页码和 URL 跳转同样重置目标页步骤。“动画”中的“逐步显示”可开关此行为，“重置当前页步骤”可重讲；“切换”中的“淡入切换”提供真实淡入，系统减少动态效果设置优先。点击链接、表单、视频或交互模型不会推进步骤；画笔、激光笔、拖动、选中文字时也不会误翻页。

## 试用 HTML 独有的演示

- **第 2、3 页：逐步讲解。** 第 2 页有 3 组要点，第 3 页有 4 个流程步骤；放映控制条及演示者窗口显示当前步骤。
- **第 6 页：实时数学图表。** 调节逻辑函数的陡峭程度与中心，SVG 曲线及 `y(1)` 立即重算。初始值为 `0.7311`；这是数学模型，不是实验数据。
- **第 7 页：阻尼弹簧。** 运行 / 暂停 / 重置，调整阻尼和劲度，查看以米、秒、米每秒表示的真实数值积分结果。离开页面、隐藏浏览器页面、黑屏或打印会暂停；返回后手动继续，不会在后台持续计算。
- **第 8 页：三维结构。** 直接拖动 CSS 3D 立方体，也可用角度滑块；模型获得焦点后，方向键旋转，重置恢复默认视角。不会自动旋转。

打印显示全部步骤；实时图表保留当前曲线，物理与三维模型使用清楚标明的静态结构图。缩略图、概览与演示者下一页预览同样保持内容完整；演示者当前页与听众的揭示步骤同步。

顶部搜索可查找并执行演示命令，也可按标题或页码定位幻灯片。“视图”提供备注、标尺、幻灯片浏览、常规、缩放与适应窗口；底部备注条点击展开，再点收起。缩略图栏边缘按钮可折叠侧栏，功能区右端箭头可折叠功能区。

放映底部左侧保留紧凑控制条；画笔和更多菜单提供激光笔、清除墨迹、黑屏、计时、快捷键与结束放映。计时也可通过“开始”功能区末尾更多菜单或顶部搜索操作，支持开始、暂停、继续和重置；结束放映自动暂停，再次开始继续累计。首次开始新的排练前可重置。F1 可查快捷键；F5 从头放映，Shift+F5 从当前页放映。

## 用自己的材料生成

```bash
python3 scripts/new_deck.py presentation.html
```

脚本复制完整模板，不覆盖已有文件。随后由 AI 按 `SKILL.md` 替换示例内容、标题、讲稿、来源和视觉设计。默认生成 `.html`；配套 PPTX 导出见下节。

示例请求：

> 使用 html-deck skill，为我的“生成式 AI 对大学学习的影响”做一个 8 分钟中文 pre。受众是同班同学，需要问题、论证、案例、局限和参考文献。输出一个可离线打开、带备注和演讲者视图的 HTML。以下是我的材料：……

没有真实材料时应标明信息缺口，不能编造文献或数据。编辑内容由 AI 改写 HTML 完成；模板没有拖拽编辑、云保存或协作；配套脚本能生成真实的截图式 PPTX。

## 自动生成配套 PowerPoint

在仓库目录中准备 Node.js 22 或 24 LTS，首次安装：

```bash
npm ci
npm run browser:install
npm run doctor
```

agent 完成 HTML 后，只需一条命令：

```bash
npm run export -- --html "presentation.html" --output-dir "delivery"
```

自动逐页截图、生成真实 PPTX、设置第一页链接、校验并打包。`delivery` 是一个新目录，包含 HTML、PPTX、配套 ZIP、截图和验证记录。默认链接指向同目录 HTML，发送时使用 ZIP。不会覆盖已有交付目录。

导出只需项目依赖中的 Playwright Chromium、PptxGenJS 和 ZIP 工具，不再依赖 Codex 专用运行时、Python 或 Office。初次安装需要网络，准备好后自包含 HTML 可离线导出。详细选项、输入要求和已有 PNG 的兼容入口见 [导出流程](references/pptx-export.md)。

顶部显示 `.pptx` 文稿名，浏览器标签使用内嵌 PowerPoint 图标；HTML 下载仍保留正确的 `.html` 扩展名。

## Windows / macOS

HTML 成品双击即可打开，不需要 Python、Node.js 或服务器。Windows 推荐 Edge / Chrome，macOS 推荐 Chrome / Safari。系统字体按平台自动回退，画布保持 16:9。

| 操作 | Windows | macOS |
| --- | --- | --- |
| 从头放映 | F5 | ⌘⇧Return（也可 Fn+F5） |
| 从当前页放映 | Shift+F5 | ⌘Return |
| 下一步 / 上一步 | → / ←、Space / PageUp | → / ←、Space / Fn+↑ |
| 首页 / 末页 | Home / End | Fn+← / Fn+→ |
| 退出放映 | Esc | Esc |
| 打印 | Ctrl+P | ⌘P |

功能键被系统或浏览器占用时，用界面上的放映按钮。全屏被拒绝时仍在窗口内放映，演示者视图需要允许弹窗。

PPTX 和 HTML 要一起解压到同一目录，再用桌面 PowerPoint 打开放映。macOS 首次跳转可能要求授予 HTML 文件访问权限；Windows 可能显示 Office 外部链接安全提示。确认目标是自己的 HTML 后再打开，不需要关闭受保护视图或全局安全设置。PPTX 图片是静态内容，交互在浏览器中运行。

## 安装和调用 skill

本仓库本身就是一个文件夹式 skill，名称为 `html-deck`。**下载源码或 ZIP 不等于已经安装。**

Codex 用户可将仓库克隆到用户技能目录，目标目录已存在时先检查，不覆盖：

macOS（终端）：

```bash
git clone https://github.com/Silhouette-my/html-in-PPT.git "$HOME/.codex/skills/html-deck"
```

Windows（PowerShell）：

```powershell
git clone https://github.com/Silhouette-my/html-in-PPT.git "$env:USERPROFILE/.codex/skills/html-deck"
```

如果设置了 `CODEX_HOME`，改用其 `skills/html-deck` 子目录。也可以把 skill ZIP 中的 `html-deck` 文件夹解压到这个位置。重新打开会话，让工具发现 skill；其他 AI 工具使用其自己的 skills 目录。

随后发送：

> 使用 $html-deck，按下面的资料制作一个 8 分钟中文 pre，输出配套 HTML 和 PPTX。资料：……

### skill 是怎样生效的

1. 工具扫描 `SKILL.md` 的名称和 description。显式写 `$html-deck` 可指定它，也可由工具按任务描述匹配。
2. 模型读取 skill 正文，按需读取设计、交互和 PPTX 导出参考。它们是生成工作的说明，不是后台常驻程序。
3. 模型复制 HTML 模板，改写主题内容、视觉和讲稿。模板内的 JavaScript 负责点击推进、缩放、画笔、计时和交互模型；成品运行时不需要 AI。
4. 请求 PPTX 时，模型运行自动导出命令，脚本通过 Chromium 逐页截图并生成 PPTX。导出器生成真实 OOXML，并把第一页链接指向 HTML，最后验证和交付两份文件。

`new_deck.py` 只复制模板，不会自行写作。自动导出命令处理截图和打包，内容与审美由执行模型决定。HTML 制作不依赖 PPTX 工具链；其他有文件和命令执行权限的 agent 也可使用同一套 npm 命令。

## 开发文件

获取项目：

```bash
git clone https://github.com/Silhouette-my/html-in-PPT.git
cd html-in-PPT
```

| 文件 | 用途 |
| --- | --- |
| `SKILL.md` | AI 生成流程、内容约束与验收要求 |
| `assets/deck-template.html` | 自包含样式、逐步演示引擎与 10 页中文交互样例 |
| `references/design-guide.md` | 内容结构与排版参考 |
| `references/interface-reference.md` | PowerPoint 官方界面和交互参考 |
| `references/interactive-authoring.md` | 逐步内容、交互区域、静态替代与生命周期约定 |
| `scripts/export_pptx.mjs` | 保留已有 PNG → PPTX 的导出入口 |
| `package.json` / `package-lock.json` | 自动导出、环境检查及锁定的跨平台依赖 |
| `references/pptx-export.md` | 截图、依赖、导出与超链接验证流程 |
| `scripts/new_deck.py` | 复制模板，不覆盖已有文件 |
| `scripts/test_runtime.cjs` | 无依赖的步骤状态机与示例结构测试 |

模板内 `DECK CONTENT START/END` 标记定位样例幻灯片。每页 `<aside class="speaker-note">` 提供备注。模板内联 CSS、JavaScript 与 SVG，不加载 CDN、远程字体或其他网络依赖。参考页的外部链接只在主动点击时联网。

## 验证

```bash
npm test
```

- macOS：已在 Chrome 检查放映、步骤撤回、模型操作、演示者同步和打印；真实 PowerPoint 打开了 10 页 PPTX，点击第一页成功打开同目录 HTML。
- Windows：路径和快捷键逻辑有确定性测试；GitHub Actions 在 Windows/macOS 安装依赖与 Chromium，运行脚本及自动导出测试。原生 Windows Office、浏览器全屏及实际双屏投影仍需目标设备现场验收，CI 不代替这些检查。
- 导出器：验证真实 PPTX 包、页数、尺寸、图片和首图链接，并拒绝覆盖已有输出或缺失截图。
