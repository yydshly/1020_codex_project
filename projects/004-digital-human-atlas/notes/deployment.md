# 发布记录

发布日期：2026-10-23（Asia/Shanghai）。

- 网站：[数字人技术图谱](https://yydshly.github.io/1020_codex_project/projects/004-digital-human-atlas/)
- 总目录：[GitHub 项目研究集](https://yydshly.github.io/1020_codex_project/)
- 内容提交：[b8a8263](https://github.com/yydshly/1020_codex_project/commit/b8a82631f433b1bd587ccfb79edf04d7e922baf6)
- 部署：[Deploy Pages / 39828244423](https://github.com/yydshly/1020_codex_project/actions/runs/39828244423)，build 与 deploy 均成功。

## 本次发布内容

首屏和摘要解释研究目标、八类路线、当前适合的方案、研究意义与可扩展产品方向。使用已经生成的八路线长图作为引导图和总目录封面，保留机制示意与未实测的说明。网页包含 13 个章节、31 个模型与工具、33 个来源入口，以及模型对比、成本计算、试验清单和数据导出。

当前建议为优质动作素材＋MuseTalk，Ditto 回退，FlashHead Lite 作为对照实验。复杂自主动作与精确空间交互分别评估生成式和 3D，不声称存在经统一实测证明的全面最佳模型。

## 验收证据

- 发布前：子项目 build/check 通过，仓库 5 项测试通过；对实际暂存文件制作独立快照，目录校验与站点构建通过。
- 云端：Pages 工作流完成目录校验、5 项测试、打包和部署。
- 线上：总目录显示新摘要及 004 入口，点击可进入研究页。
- 线上：首屏目标、推荐结论与长图正常加载，运行状态 ready，模型卡片 31 项、产品方向 6 项。
- 线上：搜索 MuseTalk 返回 2 / 31；重置与产品方向跳转正常；所查控制台 error / warn 为空。
- 响应式：发布前验证 390px 视口没有页面级横向溢出；发布后保存宽屏截图并恢复默认窗口尺寸。
- 截图：[发布首屏](../assets/published-overview.png)。

本次只提交并发布 004 子项目及其总目录条目；002、003 的现有未提交工作留在本地。后续只补入本发布记录、截图与 README 状态，不改变本次已部署的 `web/` 内容。

未进行 GPU 推理、付费 API 调用或模型间同条件画质测评。网页上线验收不等同于数字人模型效果验证。
