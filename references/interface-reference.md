# PowerPoint 界面参考

查阅日期：2026-10-21。当前主要基准是用户提供的 **六张 PowerPoint 网页版实际截图**，采用浅色单行功能区。官方资料补充交互含义。不同账户、发布通道、语言与窗口尺寸会改变实际界面；本次按这些截图对齐，不将“最新版”解释成所有 Microsoft 365 客户端共用的固定样式。

## 六张截图确定的界面

1. **视图**：备注、标尺、幻灯片浏览、常规、沉浸式阅读器、缩放、适应窗口大小。
2. **幻灯片放映**：从头开始、从当前幻灯片开始、演示者视图、自定义幻灯片放映。
3. **开始**：剪贴板、新建幻灯片、字体/段落、形状、查找、听写、加载项与 Designer 的紧凑单行结构。
4. **文件**：左上浮层菜单，包括新建、打开、共享、创建副本、导出、打印、重命名、移动、版本历史、信息。
5. **审阅**：审阅演示文稿、校对、辅助功能、修订和批注操作。
6. **放映控制条**：左下紧凑深灰条，上一页、页码、下一页、概览、画笔、黑屏、演示者与更多。

共有结构：完整标签顺序“文件、开始、插入、绘图、设计、切换、动画、幻灯片放映、审阅、视图、帮助”；标题行居中搜索，标签右侧批注/跟进/演示/编辑/分享。模板当前有 10 页可运行内容，不用参考截图中的空白标题页替换真实文稿。

以 1991×1150 的截图为几何参考：标题行约 44px，标签行 38px，功能区约 40px；侧栏约 253px，备注条 32px，状态栏 23px；画布区上下留白约 64px。小窗口按断点缩减边距，画布仍为等比例 16:9。浅灰工作区使用 `#f5f5f5`，选中缩略图使用橙红边框。

## 外观基准

- [Use the Simplified Ribbon in PowerPoint for the web](https://support.microsoft.com/en-us/powerpoint/use-the-simplified-ribbon-in-powerpoint-for-the-web)：简化功能区的结构与切换方式。
- [Link to slides in PowerPoint for the web](https://techcommunity.microsoft.com/blog/microsoft365insiderblog/link-to-slides-in-powerpoint-for-the-web/4407506)：微软官方 2025 年网页版演示图，参考标题行、选项卡、简化功能区、缩略图与灰色画布。
- [What's new in PowerPoint craft](https://techcommunity.microsoft.com/blog/microsoft_365blog/whats-new-in-powerpoint-craft/4535409)：2026 年桌面版外观参考，用于补充 Fluent 配色、控件及经典功能区的分组层次。
- [The new look of Office](https://support.microsoft.com/en-us/office/foundations-experiences/the-new-look-of-office)：Office 视觉更新背景。

## 放映交互

- [Start the presentation and see your notes in Presenter view](https://support.microsoft.com/en-us/powerpoint/training/start-the-presentation-and-see-your-notes-in-presenter-view)：演讲者视图的当前页、下一页、备注、计时与双屏使用。
- [Use keyboard shortcuts to deliver PowerPoint presentations](https://support.microsoft.com/en-us/accessibility/powerpoint/use-keyboard-shortcuts-to-deliver-powerpoint-presentations)：翻页、指定页跳转、黑白屏和指针工具的操作参考。

界面参考 Microsoft PowerPoint，并使用其名称和官方图标；本项目是独立实现。图标来源为 [Microsoft Office CDN](https://res.cdn.office.net/files/fabric-cdn-prod_20251117.001/assets/brand-icons/product/svg/powerpoint_16x1.svg)，以 SVG data URI 内嵌，无运行时网络请求。不显示虚假的 Microsoft 账户或云端保存状态。搜索执行本地可用命令并定位幻灯片；文件菜单提供真实下载、打印、重命名和信息。未实现的编辑、协作和云端功能保留截图位置但禁用，并说明离线浏览模式不支持。浏览器窗口与投屏能力由浏览器提供。
