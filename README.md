# HTML Deck

生成大学课堂 pre、课程报告和答辩用的离线 HTML 幻灯片。

## 安装 skill

把整个 `html-deck` 文件夹复制到支持文件夹式 skills 的工具的技能目录，保留 `SKILL.md`、`assets`、`references`、`scripts`。具体目录取决于所用工具，例如某些 Codex 环境使用 `~/.agents/skills/`，某些 Claude Code 环境使用 `~/.claude/skills/`。此压缩包并不代表已自动安装到当前聊天；目标工具必须支持读取这些本地资源。

## 使用示例

> 使用 html-deck skill，为我的“生成式 AI 对大学学习的影响”做一个 8 分钟中文 pre。受众是同班同学，需要问题、论证、案例、局限和参考文献。输出一个离线 HTML，打开像 PowerPoint 的浏览工作区，点击后能全屏放映。以下是我的材料：……

将主题和材料替换成你的作业内容。没有真实资料时，skill 应标注缺失信息，而不是编造文献和数据。

## 先看效果

双击 `assets/deck-template.html`：左边为真实缩略图，中间为 16:9 画布，下方为讲稿。点击“开始放映”进入演示。方向键 / Space 翻页，Home / End 到首尾，Esc 返回；“概览”可快速跳页。点击“打印 / PDF”，在浏览器打印窗口选择“另存为 PDF”。

模板是可运行的 7 页演示，不是空白壳。它也不是完整 PPT 编辑器：没有拖拽编辑、保存编辑、PPTX 导出或双屏演讲者窗口。修改内容由 AI 改写 HTML 完成。讲稿会显示在工作区，屏幕共享时请先进入放映。

创建副本：

```bash
python3 scripts/new_deck.py presentation.html
```

然后由 AI 根据 `SKILL.md` 替换示例内容、讲稿、标题和视觉设计。

## 本地继续开发

```bash
git clone https://github.com/Silhouette-my/html-deck.git
cd html-deck
```

直接用浏览器打开 `assets/deck-template.html` 查看样例，无需安装 Node.js 或启动服务。创建副本的脚本需要 Python 3。

| 文件 | 用途 |
| --- | --- |
| `SKILL.md` | AI 的生成流程、内容约束与验收要求 |
| `assets/deck-template.html` | 单文件演示引擎、样式与 7 页中文样例 |
| `references/design-guide.md` | 内容结构与排版参考 |
| `scripts/new_deck.py` | 复制模板，不覆盖已有文件 |

修改演示交互与样式时，直接编辑模板中的 CSS / JavaScript；修改默认生成策略时编辑 `SKILL.md`。模板内的 `DECK CONTENT START/END` 标记用于定位示例幻灯片。

## 当前验证状态

初版已检查内联 JavaScript 语法，以及复制脚本能生成同内容文件并拒绝覆盖已有文件。完整浏览器交互、全屏、窄屏和打印分页验证尚未完成：开发环境的浏览器策略阻止了 `file://` 访问，后续浏览器验证被中断。请在本地按 `SKILL.md` 的验收清单检查后，再用于正式演示。
