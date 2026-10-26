# 项目汇总与收口 · 2026-10-26

当前正式入口为[项目首页的漓江 M8](../web/index.html?revision=20261026-map-1#lijiang)，也可[独立运行 M8](../web/lijiang-m8/raster.html?surface=1&material=1&revision=20261026-m8)。本次网页总览为 [map-1 / overview](../web/index.html?revision=20261026-map-1#overview)，运行场景仍为 M8。本记录汇总已知信息与证据，不启动新的场景研究或追加画质目标。

## 当前完整总览图

[一张图看完整探索](../web/map.html?revision=20261026-map-1) · [PNG](../assets/programmable-worlds-map-20261026.png) · [SVG](../assets/programmable-worlds-map-20261026.svg)

新图将原库、原理、三处实际探索、三张后期参考、六类延续方向、四条技术路线、算法控制方案、下次任务单和价值边界放在同一张图中。图片身份、实现状态与验收范围分别标注。[图文及静态查看器验收](project-map-acceptance-20261026.json)覆盖 8 项检查、5 张桌面/窄屏截图和 51 份 M8 文件冻结；本次没有重新生成三维场景。

## 当前项目边界

| 内容 | 已实现的主要效果 | 已有证据 / 本轮关系 |
| --- | --- | --- |
| Na Pali 原作 | 完整程序海岸、侵蚀、森林、海浪、天空、原作航线与自由驾驶；隐藏 OpenGL 运行器向网页传送实时画面 | [页内运行说明](source-inpage-realtime-current.md)、[既有验收](source-live-acceptance.d3d11.json)；本轮没有重验完整原作 |
| 作品 A：运河老街窗景 | 独立老街与室内，窗边/河岸/书店机位、观察和移动；程序几何与有来源的 CC0 材质、模型相结合 | [重制记录](photoreal-rebuild-current.md)、[窗景运行](canal-real-window-functional.d3d11.json)；不是纯代码素材限定场景 |
| 作品 B：旧船坞车站 | 独立空间与光照、门吊/修理船/候船厅/站台；呼船、靠泊、展开栈桥、上船或目送、暂停与重置 | [当前说明](independent-station-current.md)、[完整流程记录](station-functional.d3d11.json)；与 A 的来信模式分开 |
| 漓江 M8 | 76 座峰体及共享山脚/鞍部/支脊/低丘，实际岩面植株支撑、开放叶冠、林带、晨雾与江面倒影；航线和自由驾驶 | [当前状态](lijiang-current.json)、[M8 验收](lijiang-m8-acceptance.json)；本轮只优化使用方式，不再迭代精细造型 |

老街来信模式与窗景共用同一套空间，只是一种历史交互原型。独立第二件由船坞车站承担；[范围纠正](scope-correction-20261024.md)继续保留。源库是创作与技术参考；当前作品不声称与源库完整着色器、HDR 数值或视觉表现等价。

## M8 的实际使用收口

1. 打开网页和滚动均不自动启动重量场景；点击对应按钮才生成。
2. 每次运行一个作品。离开区域暂停绘制并保留文档；返回不重建。初次准备的生成可能继续，需用“停止并释放”主动结束。
3. 驾驶控制常驻：四个取景预设、六个平移和四个转向方向，支持按住与松开；失焦、取消和离屏会清除移动输入。导航栏可手动收起。
4. 用户选择“流畅”或“清晰”。两档保持山体和植物，改变画布、阴影及反射尺寸；不以删除植株作为此处提速手段。
5. 原有捕获逻辑临时切清晰档并恢复画质与机位；本轮没有重跑完整影片导出。

## 本轮验证及不能外推的部分

事实来源：[M8 验收记录](lijiang-m8-acceptance.json)，原始运行目录 `C:/Users/yun68/CodexTaskArtifacts/014-lijiang-m8-experience/2026-10-26T13-11-44-861Z/`。

| 项目 | 已确认 |
| --- | --- |
| 功能 | 24 项实际 DOM 操作、9 项综合检查通过；综合检查包含生命周期、版本保护、运行桥与 UI，不能把 9 项全称为生命周期检查。使用专用隐藏、不可抢焦点的运行进程，不发送系统键鼠 |
| 冷生成 | 本次 107.147 秒；仍需约 1—3 分钟等待，受机器和负载影响 |
| 短驾驶 | 流畅 23.36fps，清晰 18.36fps；各约 2.5 秒的按钮驾驶样本，不是完整航拍或稳定通用帧率 |
| 画质条件 | 本次 CSS 1174×680；流畅 881×510、阴影 2048、反射 512；清晰 1174×680、阴影 4096、反射 1024 |
| 窄屏 | 父页宽 550 时验证子页 DOM 边界/无溢出及原文档、上下文保留；不是手机实机或完整移动端视觉验收 |
| 发布到首页 | M8 当时验收后将候选 HTML 原样复制为同目录 `index.html`，正式 URL 没有另外完整生成。[当时服务与磁盘一致核对](lijiang-m8-served-verification.json)保留；随后 wrapup-1、futures-1、understanding-1 与 map-1 更新的是首页信息层，未重跑 3D，当前 HTML 不再宣称与该历史候选逐字相同 |
| 导出 | M8 没有重测完整 45 秒导出；M5/M6 的 2700 帧影片只证明它们自己的版本 |

M7 的同机位回归、128 个岩体域的最终几何计数一致，以及 M6 原始裂缝机位闭合，分别记录在对应历史报告。M8 保留这些场景几何；不把过去的图像检查扩大成“本轮每个视角均已人工签收”。

此次网页整理的可用性检查与 M8 场景验收分开记录，不将信息层更新算作新的 3D 通过证据。历史研究引导图继续保留为原作与 A/B 的阶段快照。

## 已知限制

- 生成仍重，且仅离屏不能暂停正在进行的生成；显式启动解决无意触发，不能消除启动成本。
- 实时速度低于 60fps，并随视角、质量和设备变化；离线 1080p60 的文件规格与实时流畅性是两件事。
- 岩面局部偏柔和，部分峰形和灌木仍有程序规律。当前以自洽、可操作的作品体验收口，不宣称照片级完工。
- 完整 M8 导出、手机实机交互和手机整体视觉尚待专门复验。
- 本轮只复核 M8 使用流程；Na Pali、A、B 的历史通过记录不能改写为“此次全部重新 QA”。

当前状态文件标记 `iterationComplete=true`、`fullGoalComplete=false`：表示本轮实用性收口完成，长期创作空间仍保留，不需要为可选目标继续无期限研究。

## 新增参考：三个后期乘船产品方向

[网页参考图区](../web/index.html?revision=20261026-map-1#future-products)与[方向说明](future-product-directions.md)收录用户提供的三张截图，经 AI 去 UI、生成式清理后作为静态参考。它们不是已完成的实时场景截图，不新增原图来源猜测，也不扩大 M8 的验收结论。

- **优先漓江竹筏慢游**：延续 M8，新增筏头低位乘坐、固定河心路线及启程/暂停/转头。[参考图](../assets/extension-references/lijiang-raft-clean-v1.png)
- **海岛泻湖巡游**：独立泻湖、近崖与浅水、长尾船。[参考图](../assets/extension-references/island-lagoon-clean-v1.png)
- **星河港湾夜航**：城市港湾、摩天轮、奇幻天幕与水面联动。[参考图](../assets/extension-references/cosmic-harbor-clean-v1.png)

共同目标是“坐船进入风景”。三方向延续下方六类创作思路，尚未形成新实时产品；商业用途只保留为未验证候选。本次只更新图片与说明，当前 M8 运行不变，不另开研发。

## 未来可选方向

| 方向 | 可做成的小作品或工具 |
| --- | --- |
| 其他风景 | 一个新场景、三个实际机位；先验证布局与取景 |
| 时间与天气 | 同一构图的晨昏、雨停或季节变化 |
| 停留与进入 | 环境音、专注窗景、有限散步或乘船路线 |
| 有延续的故事 | 车站班次、目的地、旅人或返程；选择产生可见后果 |
| 解释过程 | 水滴、植物或机器内部的空间演示，知识机制另行校核 |
| 创作工作台 | 参数/机位保存、导出预设，以及有明确失效规则的生成缓存 |

这些方向均需另定范围与验收，不属于当前网页尚欠的承诺。若继续改善实用性，优先从缓存/生成等待、完整移动端验证或长时间驾驶性能中择一，而非再次全面重做场景。

## 讨论结论：AI 效果、技术控制与项目价值

[网页理解与价值区](../web/index.html?revision=20261026-map-1#understanding)与[完整说明](understanding-and-value-20261026.md)记录本轮讨论。当前价值主要是研究思路、样例和工程积累；技术差异化、稳定省时和商业价值尚未得到验证，没有稳定的“输入图像便自动得到高质量互动世界”的系统。

LLM 辅助写代码、专用 3D 生成器和产品整合管线应分开判断。Hunyuan3D-2.1、TRELLIS.2 可作为单资产生成环节，Marble 提供环境生成与粗布局控制的参考；这些能力没有因此接入本项目。控制方案可包含参考分割/深度、固定模板与素材、seed、有限参数和有界搜索，再以多视角、连续移动与性能验收；完整自动流程尚未实现。

已有控件、生命周期、场景代码和对照经验可复用，常见工程能力不等于护城河。单图隐藏信息不能唯一恢复，增加素材也不保证整体效果。新对话可携带场景模板、参数、参考约束和对照脚本，并区分现有文件与待整理能力。保持当前收口，仅在明确用途及省时、质量或体验增量成立时再投入；本次文字整理不更改 M8，也不新增三维验收结论。

## 漓江历史阶段

| 阶段 | 定位与保留记录 |
| --- | --- |
| 早期原生实验 | [旧入口说明](lijiang-native-previous-entry-description.md)、[质量差距诊断](lijiang-native-quality-gap.md)、[以实际效果验收的原则](lijiang-effect-acceptance.md)；旧判断和失败不抹除 |
| M1—M4 | [M1 历史验收](lijiang-release-acceptance.md)、[M2](lijiang-m2-acceptance.md)、[M3](lijiang-current.m3-history.json)、[M4](lijiang-current.m4-history.json) |
| M5 | [逐轮进度](lijiang-m5-progress.json)、[独立视觉复核](lijiang-m5-visual-review.json)；叶冠体积、岩植接触和连续林带，曾是默认入口 |
| M6 | [山群候选](lijiang-m6-candidate.json)；共脚/鞍部/支脊，以及统一 2 米世界采样网格修复接缝。完整影片与功能证据对应 M6 |
| M7 | [性能候选](lijiang-m7-candidate.json)、[当天性能对照](lijiang-m7-performance-comparison.json)；去掉重复主峰、连接域流水线、细枝与帧调度优化，未复测完整影片 |
| M8 | [本轮验收](lijiang-m8-acceptance.json)、[正式当前状态](lijiang-current.json)；按需启动、保留状态、驾驶控件与画质选择，现为正式入口 |

[此前默认状态快照](lijiang-current.before-m8.json)与[阶段计划](lijiang-next-stage-plan.json)保留作历史；其中未完成项并不自动成为本轮新增任务。

## 来源、许可与旧链接索引

Na Pali 作者为 Leon Lin，固定版本 `4afb7c3a1aad3d0203193100305c46607134d0f5`，MIT；上游许可、CC0 素材清单及 Three.js 许可继续保留。原帖配乐未收入项目。纯代码场景限定仅适用于漓江，A/B 有独立资源来源；新增原创部分未额外声明统一开源许可。

下列索引保留原 README 已引用的入口与证据。旧名称只说明当时的记录：查询参数 `revision` 不会把现在的首页还原为历史页面，查看旧运行应使用对应版本独立入口及固定报告。

<details>
<summary>展开完整历史链接索引</summary>

- [当前状态](lijiang-current.json)
- [M1 历史验收](lijiang-release-acceptance.md)
- [范围纠正记录](scope-correction-20261024.md)
- [Leonxlnx/napali](https://github.com/Leonxlnx/napali)
- [Leon Lin 的海岸航拍](https://x.com/LexnLin/status/2113720560920428685)
- [打开项目首页](../web/index.html#source)
- [页内原作实时界面](../web/runtime/source-live.html)
- [保留原样的上游文件](../web/upstream/index.html)
- [页内运行记录](source-live-acceptance.d3d11.json)
- [实现、实际画面及性能边界](source-inpage-realtime-current.md)
- [本机完整原库实时渲染，35 秒海岬机位，1426×864；截取自隐藏运行验收](../assets/runtime-qa/2026-10-24T01-07-18-256Z/03-headland-35s-canvas.png)
- [原库驾驶记录](runtime-acceptance.latest.json)
- [17 个镜头与首页切换记录](hub-acceptance.gl.json)
- [当前验证说明](verification-current.md)
- [独立编译记录](source-compile-d3d11.json)
- [打开运河老街窗景](../web/canal-real/index.html?experience=window&giSet=r5&probes=1&streetProbes=1)
- [场景与素材署名](../web/canal-real/credits.html)
- [老街重制记录](photoreal-rebuild-current.md)
- [打开独立的旧船坞与运河车站](../web/shipyard-station/index.html)
- [新作当前运行与两次正式入口修复记录](independent-station-current.md)
- [打开老街来信原型](../web/canal-real/index.html?experience=story&giSet=r5&probes=1&streetProbes=1)
- [旧 M5 首页地址（现不回切版本）](../web/index.html?revision=20261026-m5#lijiang)
- [独立实时入口](../web/lijiang-m5/raster.html?surface=1&material=1&revision=20261026-m5)
- [模块说明](../web/lijiang-m5/README.md)
- [M5 进度](lijiang-m5-progress.json)
- [独立视觉复核](lijiang-m5-visual-review.json)
- [M4 历史记录](lijiang-current.m4-history.json)
- [M2 历史验收](lijiang-m2-acceptance.md)
- [M3 历史记录](lijiang-current.m3-history.json)
- [旧入口说明](lijiang-native-previous-entry-description.md)
- [质量差距诊断](lijiang-native-quality-gap.md)
- [直接运行完整候选](../web/lijiang-m6/raster.html?surface=1&material=1&revision=20261026-m6)
- [M6 候选验收](lijiang-m6-candidate.json)
- [分阶段计划](lijiang-next-stage-plan.json)
- [性能改进候选](../web/lijiang-m7-preview.html?revision=20261026-m7#lijiang)
- [M7候选记录](lijiang-m7-candidate.json)
- [性能对照](lijiang-m7-performance-comparison.json)
- [老街窗景运行](canal-real-window-functional.d3d11.json)
- [船坞车站实际完整流程](station-functional.d3d11.json)
- [双场景视觉复核](visual-acceptance-independent.md)
- [首页实际入口与释放](hub-two-worlds-acceptance.d3d11.json)
- [最终引导图证据清单](guide-final-evidence.json)
- [交付记录](delivery-acceptance.json)
- [打开历史研究引导图](../web/guide-history-20261025.html)
- [SVG 原图](../assets/programmable-worlds-guide.svg)
- [生成源码](../src/build_guide.py)
- [固定版本 README](https://github.com/Leonxlnx/napali/blob/4afb7c3a1aad3d0203193100305c46607134d0f5/README.md)
- [固定版本代码](https://github.com/Leonxlnx/napali/blob/4afb7c3a1aad3d0203193100305c46607134d0f5/index.html)
- [MIT 许可证](../web/upstream/LICENSE)
- [历史阶段画质记录](visual-acceptance-final.md)
- [历史窗景检查](window-acceptance.gl.json)
- [历史故事检查](story-acceptance.gl.json)
- [前景木材来源](https://polyhaven.com/a/wood_table_001)
- [早期集成记录](verification.md)
- [返回总索引](../../../README.md)

</details>

[返回项目说明](../README.md)

本次网页整理的[独立验收记录](web-wrapup-acceptance-20261026.json)另存：桌面与小屏网页排版、四入口导航、24 个本地链接、画廊和五项问答通过；没有启动或重新验收三维场景。
