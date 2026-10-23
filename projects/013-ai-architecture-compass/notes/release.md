# 013 · 发布记录

整理日期：2026-10-23。发布目标为本仓库已有 GitHub Pages。

## 目标与内容

**代码是基石，需求是目标。** 这份原创手册整理如何在 AI 持续实现需求的过程中，把控业务概念、规则归属、模块边界和依赖关系，让代码能够承载项目的长期演进。

- 业务建模：DDD。
- 代码组织：分层、垂直切片。
- 依赖控制：六边形、整洁、洋葱。
- 整体与部署：模块化单体、微服务。
- 协作与扩展：插件式、事件驱动。
- 数据与状态：CQRS、事件溯源。

每种方法说明场景、原理、方向、意义、代价与验证方式。按问题选择最小有效组合，再通过项目指令、代码边界、自动检查、行为验证及决策记录持续约束实现。网页提供架构对比、组合选择器、任务约束卡和五份实践模板。

## 两种图的用途

- 新生成的 **一图速览**：1536 × 1024 PNG，用目标主线、六类方法、条件组合与实现闭环帮助快速建立理解；同时作为目录封面。
- 已有的 **完整引导图**：1800 × 18534 SVG，保留七章内容、十二种方法的详细说明和图文阅读器。

速览图使用内置 image_gen 工具生成，生成后人工目视核对十二种方法及主线文字，原始 PNG 字节直接复制到 `assets/` 与 `web/`，没有重绘或重新压缩。提示词保存在 [overview-prompt.txt](overview-prompt.txt)。图中的组合为按条件采用的教学示例，不表示所有方法都必须同时引入。

## 发布入口

- [研究手册](https://yydshly.github.io/1020_codex_project/projects/013-ai-architecture-compass/)
- [一图速览](https://yydshly.github.io/1020_codex_project/projects/013-ai-architecture-compass/overview.html)
- [PNG 原图](https://yydshly.github.io/1020_codex_project/projects/013-ai-architecture-compass/architecture-overview.png)
- [完整引导图](https://yydshly.github.io/1020_codex_project/projects/013-ai-architecture-compass/guide.html)
- [总索引](https://yydshly.github.io/1020_codex_project/)

## 发布状态

发布准备中。提交、工作流和线上资源核验结果将在完成后记录于此。

本次通过最新远端 `main` 的独立工作树发布，只包含 013 子项目和它的生成索引。网页为静态研究手册；架构教学案例未在真实业务项目中实施，不将页面交互或文档完整性视为业务架构已经验证。
