# 图生 3D 探索：从参考图到可漫游街区

**2026-10-25：研究收束并准备公开发布。** 本次实现了图生 3D：Codex 理解单张参考图，通过 Python/bpy 在 Blender 重建可编辑几何、材质、灯光与相机，再导出 GLB 接入网页漫游。研究页保留源帖与我们的真实效果、三档入口选择、V1–V5、补景、猫与漫游支线、SPACE01–11，以及能力边界和投入产出。旧版本全部保留，不再继续优化场景。

上一次收束仅获准本地整理；本次用户已明确授权提交远端与网页部署。发布结果以实际部署与线上核验记录为准，不预先视为已上线。

[当前研究网页](web/index.html) · [源帖四张原图](web/index.html#source) · [三档入口与完整引导](web/index.html#reference) · [我们的实际渲染](web/index.html#results) · [最终 SPACE11 可漫游街区](web/index.html#scene3d) · [全部版本档案](web/index.html#archive) · [能力边界](web/index.html#boundary) · [投入产出](web/index.html#investment) · [完整收束说明](docs/research-closure.md)

本地预览：<http://127.0.0.1:8062/index.html>。计划发布入口：<https://yydshly.github.io/1020_codex_project/projects/007-canal-blender-test/>。历史 8057 预览目前未运行。

## 当前结论

- **图生 3D 原型已经实现**：由单图生成可编辑工程、真实 Cycles 渲染、GLB 和有限户外可漫游街区，能换角度查看与继续修改，超过了仅验证工具连接。
- 具体方法是 AI 看图后程序化建场景，遮挡区域与镜头外街区包含后续设计；不是精确扫描恢复，**高保真还原未完成**。
- 没有安装、实跑 DSH / MCP；没有同输入、同资产、同预算的 DeepSeek / Codex 对照，不能据此判断哪个库或模型更强。
- 三档入口中只选择最简单的最终预算版实际建模；另外两档保留为范围取舍的候选，没有对三档分别建模或比较性能。
- 最初偏向类似氛围，V4 才显式校准参考图。V5 几何与湿面两轮各两张低清，均未最终接受；后续补景改变了任务范围。
- 猫的 V3–V12 基于外部 CC0 静态资产后自绑 / 程序动作；A 基于 JonasDichelle / BlendSwap 的 CC BY 3.0 模型和原生 Walk / Run 后适配，不是全部从零生成。
- 最终保留 SPACE11；04 / 07 / 09 / 11 为运行层版本，分别复用03 / 06 / 08 / 10的GLB。单个工程或 GLB 不等于最终网页呈现。
- 有单次机器执行 / 渲染计时，没有可靠总研究工时或总费用。图生 3D 对快速搭景、参数化编辑和自动化导出有价值；构图、空间、材质与角色自然感需要另外投入，后期逐项微调回报递减，故停止继续优化。

## 本轮整理与来源

原 X 帖四图已由官方 oEmbed / syndication 找回，保存在 `web/research-media/source/`，逐图出处、尺寸和 SHA 见 `provenance.json`。源作者自报 `1.58eToken / 1h20min / 12rmb` 原样保留，未独立复核。逐图输入 / 输出归属并非全部明确，部分是群友作品。源媒体用于研究起点与效果对照，保留作者及原帖出处，不主张其为开放许可资产。

三个老街入口原图均已找齐：初始候选、高复杂度候选与最终预算版。初始候选围绕三店一桥；高复杂度候选扩大为约 10–12 栋、两桥、电车与多层道路；最终预算版收回三店一桥，排除电车与阶梯山城等范围。`assets/reference.png` 是唯一实际建模输入，即这三档中选定的最简单预算版。三档表达范围取舍，没有全部实测，也不形成严格难度或模型性能排名。

主引导和封面沿用专门生成的完整概述图 `assets/control-guide-original.png`，涵盖源展示示意、两种控制路径、验证、公平比较和研究意义；V1–V3 的 SVG 保留为历史附件。生成参考、概述图均不是源帖效果或 Blender 实测成图。网页分别展示原帖照片、生成参考、真实离线渲染、实时截图和第三方资产。

收录 47 个阶段条目、45 个既有网页入口与 16 个 GLB，完整原文件索引、38 个连续节点的过程审计及最终报告可从网页回查。代表媒体原字节复制；原始工程与旧页不覆盖。公开证据副本清理本机路径，对大型数组明确摘录并分别记录原始 / 公开 SHA。

原 V4 主页原字节保留为 [research-v4-original.html](web/research-v4-original.html)；上次仅本地整理稿保留为 [research-closure-local-original.html](web/research-closure-local-original.html)。原始 README 与 Blender 工程继续在本地研究目录保留。

重新整理入口：`python scripts/package_research_closure.py`；证据打包：`python scripts/package_research_evidence.py`；同步本页与入口：`python scripts/prepare_research_closure.py`。这些资料脚本不运行 Blender；提交与 GitHub Pages 部署另按授权的发布流程执行。不要用历史 `package_web.py` 的 V4 清单覆盖新收束资料。


## 公开归档范围

本提交发布完整网页、历史交互页面、GLB、实际效果素材、经过路径净化的文档与证据、实验脚本记录，以及必要的三档参考和完整概述原图。原始 `.blend` 工程、大型逐帧诊断、模型下载包、缓存与运行日志保留在本地，不随静态网页归档上传。

`scripts/` 记录实际实验实现；重新生成部分结果仍需本地对应工程、原始资料及 Blender，不能把本归档当成无需依赖的一键生成器。已发布的 `web/` 可独立静态托管，三维查看依赖已随网页打包。

本次选择三档中最简单预算版建模，不代表另外两张也已实现三维还原。源图、解释概述、真实渲染和实时网页的归属均在研究页区分。

发布流程与线上核验以 GitHub Actions 的对应提交记录为准：[Deploy Pages](https://github.com/yydshly/1020_codex_project/actions/workflows/deploy-pages.yml)。
