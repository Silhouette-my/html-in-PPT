# 从 HTML 一条命令生成 PPTX

在 skill 根目录执行。Windows 和 macOS 使用相同命令，路径带空格时加引号。

## 首次准备

安装 Node.js 22+（推荐 22 或 24 LTS），然后执行：

```bash
npm ci
npm run browser:install
npm run doctor
```

依赖固定在 `package-lock.json`，截图使用 Playwright Chromium，PPTX 使用 PptxGenJS。无需 Codex 专用运行时、Python、Office 或额外的 Presentations skill。第一次安装需要网络；依赖和浏览器准备好后，自包含 HTML 的导出可离线运行。

`doctor` 检查 Node、导出依赖和 Chromium。缺少依赖时按提示安装，不必等到截图结束后才发现问题。仅浏览 HTML 成品无需这些依赖；`new_deck.py` 仍是仅需 Python 3 的模板复制入口。

## 自动截图、导出和打包

先由 agent 完成 HTML 的内容和设计，再运行：

```bash
npm run export -- --html "presentation.html" --output-dir "delivery"
```

`delivery` 必须是尚不存在的新目录，避免覆盖上一份成果。频繁修改时可改用自动编号，不必删除旧目录：

```bash
npm run export -- --html "presentation.html" --auto-version "delivery"
```

这会分配 `delivery-001`、`delivery-002` 等新目录。`--auto-version` 与 `--output-dir` 二选一；原有拒绝覆盖行为不变。输入应使用本 skill 的模板结构，且为自包含 HTML：图片、字体和媒体嵌入文件，不引用外部脚本、样式或本地旁挂资源。普通参考文献超链接可以保留。导出会执行 HTML 脚本，仅处理已审阅或自行生成的文件。

命令自动完成环境检查、浏览器渲染、等待字体与图片就绪、按顺序捕获幻灯片、写入原生备注、生成 PPTX、设置首页链接、校验和 ZIP 打包。默认每个 HTML 页对应一个完整画面；备注不进入截图。

### 页码范围和步骤展开

默认输出全部页，每页所有 `data-step` 内容均可见。可以指定页码并按步骤导出：

```bash
npm run export -- --html "presentation.html" --output-dir "delivery" --pages 1,3-5
npm run export -- --html "presentation.html" --output-dir "delivery-steps" --pages 2 --steps
```

`--pages` 接受逗号分隔页码和范围；重复页码去重，最终顺序按源文稿页序。`--steps` 对选中的每一页依次导出初始状态 `0` 和揭示状态 `1..N`；关闭 `--steps` 时仍是一页 HTML 对一张包含全部步骤的截图。`--ready-timeout <ms>` 控制每页准备就绪的最长等待，默认 `30000` 毫秒；超时应修复指出的页面或资源，而不是降低等待要求。

导出器按顺序等待页面自己的 `window.htmlDeck.ready` Promise、每页的 `htmlDeck.prepareExport({index,step})` Promise、`document.fonts.ready`、所有图片完成 `decode()`，再等两个 animation frame 后截图。页面准备逻辑若有异步资源，必须让 `htmlDeck.ready` 在它们完成时才 resolve；自定义效果的确定性状态放在 `prepareExport` 中。超时会指出当前页和等待时长。静态导出应固定在明确、可重复的状态，不截取随机动画中间帧。

### 性能测量

同一冻结版本（`4125628`）的 10 页示例，各运行旧版和新版导出流程 3 次：

| 测量项 | 旧流程 | 新流程 |
| --- | ---: | ---: |
| 总耗时，3 次（ms） | 2195 / 1421 / 1366 | 1612 / 1228 / 1235 |
| 总耗时中位数（ms） | 1421 | 1235（降低约 13.1%） |
| 启动与依赖检查中位数（ms） | doctor+capture 合计 582 | 浏览器启动 304；依赖检查 126 |
| 页面准备中位数（ms） | 257 | 213 |
| 截图中位数（ms） | 440 | 425 |
| PPTX 打包中位数（ms） | 111 | 137 |

新版把浏览器复用并将依赖检查与浏览器启动分开计时；PPTX 打包因新增原生备注而略慢。相同输入下，新版 PNG 与旧版逐页字节一致。此数据只描述该固定示例和运行环境，不代表任意文稿都能提速。

输出：

```text
delivery/
  presentation.html
  presentation.pptx
  presentation-bundle.zip
  slides/slide-01.png …
  manifest.json
  validation.json
```

自动导出会重新加载原始 HTML，使用文稿定义的初始参数，不读取其他浏览器窗口里的临时状态。PPTX 正文每页为一张等比例完整截图；物理模拟和 CSS 3D 使用模板定义的静态替代。讲稿从每个源页唯一的 `speaker-note` 写入对应页的 PowerPoint 原生备注，包含段落、空行、列表标记与操作提示，不进入图像。模型的交互能力仍在 HTML 中。按步骤导出时，一个源页可能对应多张 PPTX 页；不要用 PPTX 页码代替源页码解释备注。

ZIP 包含 HTML、PPTX 和 `使用说明.txt`，截图、清单和验证记录留在输出目录供检查。manifest 保持 `slides` 文件名字符串数组，另有逐导出页的 `notes` 与 `mapping`：`sourcePage` 为源 HTML 页码，`step` 为 `'all'` 或步骤数字，`totalSteps` 为该源页步骤数。`interactiveSlides` 记录带 `data-interactive` 或 `data-effect` 标记的交互源页。交付优先提供 ZIP。解压后保持 HTML 与 PPTX 在同一目录，在桌面 PowerPoint 放映并点击第一页即可进入 HTML。macOS 首次打开可能要求授予该 HTML 文件访问权限；Windows 可能显示 Office 外部链接安全提示。确认目标文件后操作，不关闭全局安全保护。

若用户已提供网页地址，可追加 `--url https://example.com/deck.html`。脚本不会上传或发布 HTML。

## 已有逐页 PNG 的入口

原有命令仍可使用，不启动截图浏览器，也不要求为已有 PNG 提供备注：

```bash
node scripts/export_pptx.mjs --slides slides --html presentation.html --output presentation.pptx
```

图片为同尺寸的真实 PNG，按 `slide-01.png`、`slide-02.png` 连续编号。自定义顺序可指定 `--manifest screenshots.json`：

```json
{ "slides": ["cover.png", "overview.png", "demo.png"] }
```

图片路径相对于 `--slides`。输出 PPTX 不覆盖已有文件。默认超链接相对于 PPTX 所在目录，中文、空格和特殊字符正确编码。Windows 跨盘或跨网络共享无法形成可搬移的相对链接时会报错；将两份文件放在同目录，或提供明确的 `--url`。

## 验收

自动校验通过后，仍需看截图是否有内容裁切、字体问题或不合理布局。导出脚本负责忠实捕获已完成的页面，不替 agent 判断内容或审美。桌面 PowerPoint 的实际链接跳转与权限提示需要在目标设备确认，结构测试不代替 Office 真机测试。

## 常见问题

### 提示 Export dependencies are missing

确认当前目录包含本项目的 `package.json`，执行 `npm ci`，再运行 `npm run doctor`。只安装了 skill 文件，不代表 npm 依赖已安装。

### 提示 Chromium could not start

执行 `npm run browser:install`，然后重跑 `npm run doctor`。下载不可用但系统已有 Chrome/Edge 时，可按下节选择系统浏览器。Linux 若缺少系统库，按 doctor 提示使用 `npx playwright install --with-deps chromium`；系统依赖安装可能需要管理员权限。Windows/macOS 不需要这一步。

### 提示 Refusing to overwrite

选择新的 `--output-dir`，如 `delivery-v2`。已有 PNG 的导出入口则更换 `--output` 文件名。先检查已有成果，不直接清空目录。

### 提示 Only self-contained HTML is supported

页面使用了外部脚本、字体、图片或本地旁挂文件，或者图片无法解码。让 agent 按错误中列出的资源修正：脚本/样式内联，图片等嵌入 data URL。不要只删除检查而把缺失资源交付出去。

### 提示 Expected html-deck template

此命令面向本项目模板，不是任意网页转 PPTX 工具。保留 `#deck > .slide` 结构，以及 `?export=1#slide-N` 的导出模式。自定义内容放在模板的内容区域，不删除演示引擎。

### 导出成功，但字体或画面不对

先查看输出目录的 `slides/`。截图由运行导出的电脑生成，系统字体不同会影响排版；调整 HTML 字体与布局后重新导出。脚本的尺寸和文件结构检查不替代视觉检查。

### 首页点击没有打开 HTML

先确认已解压 ZIP、两份文件在同一目录，并在桌面 PowerPoint 的放映模式点击第一页。编辑模式的点击行为取决于 PowerPoint。按目标系统提示确认文件权限；网页 Office 或学校设备策略可能不允许打开本地 HTML，此时可直接打开 HTML 或使用静态 PPTX。

## 下载受限时使用系统 Chrome / Edge

默认仍使用 Playwright 配套 Chromium。已安装系统浏览器时，可显式设置 `HTML_DECK_BROWSER_CHANNEL`，Chrome 用 `chrome`，Edge 用 `msedge`。环境检查与实际导出使用同一选择，doctor 会报告所选浏览器。不会自动更改浏览器或系统安全设置。

macOS / Bash：

```bash
HTML_DECK_BROWSER_CHANNEL=chrome npm run doctor
HTML_DECK_BROWSER_CHANNEL=chrome npm run export -- --html "presentation.html" --auto-version "delivery"
```

Windows PowerShell：

```powershell
$env:HTML_DECK_BROWSER_CHANNEL = "msedge"
npm run doctor
npm run export -- --html "presentation.html" --auto-version "delivery"
```

回到默认浏览器时，Bash 执行 `unset HTML_DECK_BROWSER_CHANNEL`，PowerShell 执行 `Remove-Item Env:HTML_DECK_BROWSER_CHANNEL`。选定浏览器未安装或无法启动时，按错误信息安装该浏览器或取消选择；这不会解决 npm 包本身尚未安装的问题。
