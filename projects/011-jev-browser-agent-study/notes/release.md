# 011 · 发布记录

整理日期：2026-10-23。发布到本仓库既有 GitHub Pages。

## 本次整理

- 摘要说明从 DOM/ARIA 生成候选操作、Jev 结合目标与上下文选择、程序检查与执行、更新页面继续循环及独立业务验收。
- 解释库的价值：复用观察、决策接入、执行、历史、失效重选和调试骨架，可用于动态网页原型及模型比较基线。
- 补全模型适配、复杂网页观测、任务恢复、业务验收与组合、同条件评测等方向，均标明为需要开发和验证的扩展。
- 引导图沿用本次认可的 1920 × 1080 横向图，保留程序、Jev、文字模型和浏览器的分工；详细长图和网页研究内容继续保留。
- 部署的是静态研究网页；没有在服务器运行上游 Agent、调用付费模型或开放真实预订。

## 发布入口

- [研究网页](https://yydshly.github.io/1020_codex_project/projects/011-jev-browser-agent-study/)
- [横向架构图](https://yydshly.github.io/1020_codex_project/projects/011-jev-browser-agent-study/architecture.html)
- [高清 PNG](https://yydshly.github.io/1020_codex_project/projects/011-jev-browser-agent-study/assets/browser-agent-architecture.png)
- [总索引](https://yydshly.github.io/1020_codex_project/)

## 验证状态

已完成提交、推送、GitHub Pages 部署与线上核验。

- 内容提交：`5bb5265899f37215feac33ccd461e50297c3b346`，已推送至远端 `main`。
- [Deploy Pages #39930267359](https://github.com/yydshly/1020_codex_project/actions/runs/39930267359) 的 build / deploy 均成功；[推送检查 #39930240642](https://github.com/yydshly/1020_codex_project/actions/runs/39930240642) 也通过。
- 独立发布目录校验 9 个项目；8 项已有维护测试、静态构建、三个 HTML 页资源与锚点、JavaScript 语法检查均通过。
- 线上核对 13 项资源：研究页、两张图查看器、样式、脚本、四张图、底稿、来源索引、目录封面及站点索引，全部 HTTP 200，字节与发布提交一致。
- 在线目录摘要已包含库的能力、复用价值、适用任务和待实现扩展方向。
- 浏览器实际确认首屏摘要、五项扩展、1920 × 1080 横图、100% / 适应窗口及返回研究页；没有控制台警告或错误。新增模块在 390px 视口下没有横向溢出。
- 横向 PNG 与认可原图逐字节相同，没有重新绘制。线上资源哈希见[online-verification.json](online-verification.json)。
- 发布通过独立工作树完成，只提交 011 内容、其目录条目和发布记录。

[线上首屏](../assets/published-preview.jpg) / [研究结论与扩展模块](../assets/published-directions.jpg)。

## 沿用原图

PNG SHA-256：`2d562c2d31209ff6a02b7becc20d320dc670aa6d1493cfcfcf5ea08fe7f266f7`。

SVG / PNG 没有重新绘制；Git 按仓库规则规范 SVG 的文本换行，PNG 应逐字节保持一致。
