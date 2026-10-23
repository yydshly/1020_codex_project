# 010 · 发布记录

整理日期：2026-10-23。发布目标为本仓库已有 GitHub Pages，不新建其他托管站点。

## 本次内容

- 网页和项目摘要明确列出少数派、小众软件、V2EX、Buzzing、NewsNow、今日热榜、SoPilot，以及官网、Issues、Show HN 等补证入口。
- 说明读取原文、追溯出处、同源去重、保留独立实测与反例、互补核验、缺口补查、证据沉淀和判断复用。
- 说明工具选型、工作流、简报、趋势、需求/竞品研究及垂直站、订阅、自动助手等方向，以及减少重复调研、遗漏和保留判断依据的目标价值。
- 引导图直接沿用本次生成的 1600 × 8570 完整图，保留 SVG / PNG、缩放与章节跳转，没有重新生成或替换。
- 自动采集、生产证据库、外部模型接入与业务收益仍未运行验证。

## 发布入口

- 网页：https://yydshly.github.io/1020_codex_project/projects/010-ai-evidence-workbench/
- 全景图：https://yydshly.github.io/1020_codex_project/projects/010-ai-evidence-workbench/guide.html
- 总索引：https://yydshly.github.io/1020_codex_project/

## 验证状态

已完成提交、推送、GitHub Pages 部署和线上验证。

- 内容提交：`61669a2d56cdc890a081bdfc365a71936437369d`，已推送到远端 `main`。
- 部署工作流：[Deploy Pages #39923682954](https://github.com/yydshly/1020_codex_project/actions/runs/39923682954)，build / deploy 均成功。
- 发布目录：8 个项目通过 catalog check；8 项单元测试通过；静态打包成功。
- 线上首页、图查看器、SVG、PNG、样式、脚本、图标和三份模板共 12 项资源均返回 HTTP 200，且与已提交 Git blob 的字节相同。
- 在线总索引包含完整来源、处理、扩展与价值摘要。
- 浏览器实际确认 7 行来源、顶部摘要、8 章图目录、8570px 原图、章节跳转及 100% 缩放；当前 839px 窗口页面无横向溢出。
- SVG 仅按仓库 `.gitattributes` 将 Windows CRLF 规范为 LF，绘图内容与生成原图相同；PNG 与生成原图逐字节相同，未重新绘制。
- 原工作区其他项目的未提交内容未纳入此次提交。

## 原图 SHA-256

- `source-to-evidence-guide.svg`：`4dd2440755979d11e59b859a4205ab1874f994dc605b9c836bc8b49483fa6af6`
- `source-to-evidence-guide.png`：`f08c635a5f1b3fa64437905a864bf05f932bee437d528926fc3190525d78bc75`

## 线上校验资料

- 核验时间（UTC）：`2026-10-23T08:23:41+00:00`
- 逐资源哈希与结果：[online-verification.json](online-verification.json)。
- 线上截图：`assets/online-preview.png`。
- 线上 SVG SHA-256：`71d2915ed924a194bf881fe1169d18680cfa58bf1b6d9ec10b034a74722560d8`。
- 线上 PNG SHA-256：`f08c635a5f1b3fa64437905a864bf05f932bee437d528926fc3190525d78bc75`。
