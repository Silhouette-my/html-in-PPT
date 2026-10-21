# 从 HTML 一条命令生成 PPTX

在 skill 根目录执行。Windows 和 macOS 使用相同命令，路径带空格时加引号。

## 首次准备

安装 Node.js 22 或 24 LTS，然后执行：

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

`delivery` 必须是尚不存在的新目录，避免覆盖上一份成果。输入应使用本 skill 的模板结构，且为自包含 HTML：图片、字体和媒体嵌入文件，不引用外部脚本、样式或本地旁挂资源。普通参考文献超链接可以保留。导出会执行 HTML 脚本，仅处理已审阅或自行生成的文件。

命令自动完成环境检查、浏览器渲染、等待字体与图片就绪、按顺序捕获全部幻灯片、生成真实 PPTX、设置首页链接、校验和 ZIP 打包。无需 agent 手工点击十次截图。

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

PPTX 每页为一张等比例完整截图。所有分步内容都显示，物理模拟和 CSS 3D 使用模板定义的静态替代。模型的交互能力仍在 HTML 中。`slides` 可用于视觉检查；清单及验证记录用于确认页数、顺序、尺寸、图片和首页链接。

交付优先提供 ZIP。解压后保持 HTML 与 PPTX 在同一目录，在桌面 PowerPoint 中放映并点击第一页即可进入 HTML。macOS 首次打开可能要求授予该 HTML 文件访问权限；Windows 可能显示 Office 外部链接安全提示。确认目标文件后操作，不关闭全局安全保护。

若用户已提供网页地址，可追加 `--url https://example.com/deck.html`。脚本不会上传或发布 HTML。

## 已有逐页 PNG 的入口

原有命令仍可使用，不启动截图浏览器：

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
