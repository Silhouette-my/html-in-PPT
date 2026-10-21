# 用真实 PPTX 打开 HTML 演示

交付时把 `演示.pptx` 和 `演示.html` 放在同一个文件夹。PPTX 每页是一张完整的 HTML 页面截图；放映第一页时点击画面，打开交互式 HTML。把这两个文件一起移动，默认相对链接仍然有效。

## 导出

先通过浏览器逐页截图，只截幻灯片内容，不包含工具栏、鼠标、选中框或演示控制条。每页使用相同尺寸，展开所有分步内容，并把动态效果停在有意义的状态。

本模板提供纯画布地址 `?export=1#slide-1`，后续页改为 `#slide-2` 等。此模式展示所有分步内容，并使用物理模拟和 3D 效果的静态替代。用 CUA 把浏览器 viewport 设为 `1600 × 900`，每页执行 `screenshot({fullPage:true})`，确认只有该页幻灯片且完整占满画布，再保存。不要使用 `fullPage:false`，当前浏览器截图实现可能裁切画面。截图数据若是 JPEG，先用图像库转换编码为真正 PNG，不能只改扩展名。最后恢复原 viewport。

```text
slides/
  slide-01.png
  slide-02.png
  …
演示.html
```

在有 `@oai/artifact-tool` 和 `jszip` 的 Node.js 环境运行：

```bash
node scripts/export_pptx.mjs --slides slides --html 演示.html --output 演示.pptx
```

导出器读取 PNG 的宽高作为幻灯片尺寸，检查连续页码和相同尺寸，生成真实 OOXML PPTX，并验证页数、图片和第一页超链接。已有 PPTX 不会被覆盖。

若截图名称不连续，可用 `--manifest screenshots.json` 明确顺序：

```json
{ "slides": ["cover.png", "overview.png", "demo.png"] }
```

图片路径相对于 `--slides` 目录。默认链接相对于 PPTX 所在目录；中文和空格会进行 URI 编码。若要链接到已发布的页面，追加 `--url https://example.com/deck.html`。远程地址应由交付者提供，不自动上传 HTML。

## Codex 运行环境

通过 `load_workspace_dependencies` 获取当前平台的 Node、Python 和包路径，用返回的 Node 执行脚本。自动发现兼容 macOS 的 `node/bin/node` 与 Windows 的 `node/node.exe` 布局，不依赖本机固定用户名。

环境变量仅用于生成 PPTX：

- `ARTIFACT_NODE_MODULES` 或 `RUNTIME_NODE_MODULES`：包含 `@oai/artifact-tool` 和 `jszip` 的 node_modules 目录，前者优先。
- `RUNTIME_PYTHON`：Python 可执行文件完整路径（Windows 为 `python.exe`）。
- `PPTX_SKILL_DIR`：Presentations skill 目录；省略时在 `CODEX_HOME`（默认 `~/.codex`）插件缓存中发现。

路径带空格时使用引号。Windows 的 PPTX 与 HTML 不同盘或不同网络共享时不能生成可搬移的相对链接，导出器会明确报错；将两者放在同目录后重试，或提供明确的 `--url`。不要依赖原电脑绝对路径分发文件。

脚本用 Presentations skill 的 finalizer 验证文件，记录保存在输出目录的 `.pptx-export-*` 构建目录中。HTML-only 工作流不需要这些依赖。

## 验收

打开 PPTX，确认页数与截图一致、画面满版且无裁切。进入放映后点击第一页，确认浏览器打开旁边的 HTML；如果 PowerPoint 显示外部链接安全确认，需要允许打开。macOS 首次打开可能显示“授予文件访问权限”，选择同目录的 HTML 文件并授权即可。PPTX 的截图保留静态阅读内容，交互、动画与实时计算在 HTML 中运行。发送给别人时，优先打包两个文件；单独发送 PPTX 无法打开本地 HTML。
