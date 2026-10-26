# 014 · 可编程世界

**原作是什么。** Na Pali 是 Leon Lin 的程序化海岸作品：代码生成地形、侵蚀、植被、海浪、天空与光照，再以航线和镜头组织观看体验。它体现的是针对特定风景持续调校的制作方法，不是输入任意图片便能自动得到世界的通用工具。本站保留来源与原作，完整实时控制通过本机运行桥提供。

**我们做了什么。** 我们参考这种思路，完成了老街窗景、独立船坞车站和漓江晨航三处实践，并积累航线、驾驶、画质选择、按需启动、暂停释放与实际对照检查等工程能力。当前价值主要是研究、可运行样例与工程经验；技术差异化、稳定省时和商业价值尚未验证，三个后续乘船方向仍是候选。

**下次怎样做。** 遵循“确认约束 → 固定模板 → 有界求解 → 独立验证”：先确认构图、尺度、观看位置和允许改变的部分；固定素材版本、随机种子与已验证模块，仅开放少量参数；在限定范围、次数和计算预算内比较候选；再以未参与调参的机位、连续路线、实际操作与性能条件验收。单图不能唯一恢复隐藏空间，评分也不能代替审美判断。已有部分参数和检查脚本，但这套流程的完整自动化尚未实现。

计划公开地址：[GitHub Pages 项目页](https://yydshly.github.io/1020_codex_project/projects/014-programmable-worlds/)。这是待发布的公开入口，发布与在线检查结果由实际部署记录确认。

**公开版与本机完整版的区别：** 公开版的 Na Pali 区域提供原作说明、真实运行截图与源库入口，不提供已部署的云端实时原作控制。本机完整版仍通过专用 Electron/OpenGL 运行桥和 WebRTC 展示、驱动原作。当前桥固定请求 `http://127.0.0.1:8797`，只接受本机 `http://127.0.0.1:8796` 来源并监听本机地址；静态部署不会带上这项能力。其他作品的公开运行情况以在线实际检查为准，不能直接借用本机验收结论。

从 Na Pali 的程序海岸出发，制作可以在网页中观看、驾驶和参与的场景。**当前正式漓江入口为 M8**；M8 收口重点是按需启动、可见驾驶控件和手动画质选择。源库提供创作与技术参考，作品以自身实际效果和使用体验为标准，不以“与原库等价”为完成条件。

[打开项目总览](web/index.html?revision=20261026-map-1#overview) · [进入漓江 M8](web/index.html?revision=20261026-map-1#lijiang) · [项目汇总与历史索引](notes/project-wrap-up-20261026.md)

## 一张图汇总整个探索

[打开可缩放总览图](web/map.html?revision=20261026-map-1) · [完整 PNG](assets/programmable-worlds-map-20261026.png) · [可缩放 SVG](assets/programmable-worlds-map-20261026.svg) · [本次图文与网页验收](notes/project-map-acceptance-20261026.json)

1800×7280 的单张图，以 7 张带身份标注的效果图串起八部分：原作效果与原理、三处实践、三种后期参考、六类扩展与产品形态、技术路线、算法与控制流程、下次任务单、当前价值和证据边界。已实现成果、静态参考和未实现方案分别标注，原作来源及现有性能限制一并保留。

网页支持缩放、原尺寸、适应宽度和章节定位。首页仅加入入口，不预加载完整长图。此轮检查图像解码与浏览功能，未重跑四个三维场景；旧研究引导图保留为历史快照。

## 四部分内容各是什么

| 部分 | 当前内容与入口 | 范围 |
| --- | --- | --- |
| 源库 Na Pali | [完整原作实时界面](web/runtime/source-live.html)：海岸、侵蚀、森林、海浪、天空与原作航线，可播放、选机位和自由驾驶 | 保留作者作品；本机通过专用隐藏 OpenGL 运行器将真实画面传到网页，不是静态图片演示 |
| 作品 A · 一扇窗外的世界 | [运河老街窗景](web/canal-real/index.html?experience=window&giSet=r5&probes=1&streetProbes=1)：窗边、河岸、书店，观察、移动与暂停水流 | 一套独立老街空间，使用程序几何及有来源的 CC0 材质、植物等资源 |
| 作品 B · 旧船坞的下一班船 | [独立船坞车站](web/shipyard-station/index.html)：呼船、靠泊、展开栈桥、登船离开或留岸目送 | 另建布局、主体模型、光照和互动流程，独立于老街；不是老街来信模式换标题 |
| 漓江晨航 M8 | [正式页内入口](web/index.html?revision=20261026-map-1#lijiang) / [独立运行](web/lijiang-m8/raster.html?surface=1&material=1&revision=20261026-m8)：峰林山群、林带、岩缝植物、晨雾、水面倒影和 45 秒航线 | 纯代码生成场景，不加载外部模型、图片、材质图或 HDR；与原作完整着色器的结果不宣称数值或视觉等价 |

此前把同一老街的“窗景”和“来信”两种模式称为两件独立作品，是范围错误；[纠正记录](notes/scope-correction-20261024.md)和[来信历史原型](web/canal-real/index.html?experience=story&giSet=r5&probes=1&streetProbes=1)保留。

## 使用方式

首页只在点击各作品启动按钮后加载对应作品。页面每次运行一个作品；离开已启动区域会暂停绘制并保留当前场景，返回时继续。**初次准备中的生成仍可能继续**，点击预览上方“停止并释放”可结束；主动切换作品时先释放上一处，下次进入需要重新准备。

漓江 M8 支持：

- 播放、暂停、重播和时间轴；四个取景预设。
- 常驻的平移与转向按钮，可按住操作；也可拖动观察、`WASD` 移动、`Q/E` 升降、`C` 切换航线与驾驶。导航栏可手动收起。
- 太阳、晨雾、倒影、波纹、曝光等参数调整；`H` 净画面。
- 默认“流畅”使用 75% 线性画布、2048 阴影和 512 反射；“清晰”使用完整画布、4096 阴影和 1024 反射。两档保留相同山体和植物。
- 现有航拍导出入口；捕获时临时使用清晰档并恢复用户画质与机位。**M8 本轮未重新验证完整 45 秒导出。**

在仓库根目录运行项目启动器：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\projects\014-programmable-worlds\Start-Project.ps1
```

它准备本机页面及原作服务，并打开项目窗口。页面端口为 8796，原作运行服务为 8797；公开发布版不启动历史 8798 原生实验，当前漓江 M8 直接在浏览器运行。完整本地研究工作区仍保留旧实验。

只运行当前漓江时，可从仓库根目录启动静态服务，然后打开首页：

```powershell
python -m http.server 8796 --bind 127.0.0.1 --directory .
```

地址：`http://127.0.0.1:8796/projects/014-programmable-worlds/web/index.html?revision=20261026-map-1#overview`。若还要运行原作，可另执行 `node projects/014-programmable-worlds/src/runtime-shell/launch-source-bridge.cjs`。原作服务使用项目专用 Electron；依赖和后端说明见[原作运行说明](notes/source-inpage-realtime-current.md)。

## 已验证到什么程度

当前事实以[漓江当前状态](notes/lijiang-current.json)和[M8 验收记录](notes/lijiang-m8-acceptance.json)为准。本轮围绕 M8 的实际操作和生命周期收口，**没有重做原作、老街和车站的整套验收**。

| M8 本轮证据 | 结果与适用范围 |
| --- | --- |
| 页面实际操作 | 24 项 DOM 操作检查通过，覆盖可见控件、驾驶与画质等本轮功能 |
| 综合检查 | 9 项综合检查通过，覆盖生命周期、版本保护、运行桥及 UI 等；24 项为实际 UI 操作数量 |
| 首次生成 | 本次约 **107 秒**；仍需等待，不是秒开 |
| 两档短驾驶 | 流畅约 **23.36fps**、清晰约 **18.36fps**；各为约 **2.5 秒**按钮驾驶样本，不能当作完整航线、其他机位或设备的稳定帧率 |
| 本次画布 | CSS 视口 1174×680；流畅实际 881×510，清晰 1174×680 |
| 窄屏 | 父页宽度 550 时验证子页 DOM 边界、无溢出和同一文档/上下文保留；不是手机实机测试，也没有完成手机整体视觉验收 |
| 正式入口 | M8 当时验收后将候选 HTML 原样复制到同目录首页，正式 URL 未再完整生成。[当时服务内容核对](notes/lijiang-m8-served-verification.json)保留；首页随后经历 wrapup-1、futures-1、understanding-1 与 map-1 信息层更新，未重跑 3D，不能继续称当前 HTML 与当时逐字相同 |
| 完整影片 | M5/M6 有各自 2700 帧影片证据；M8 没有重测整部导出，不能借用旧影片宣称本版已通过 |

M8 延续此前已经改善的叶冠体积、实际岩面根部支撑、林带连续性，以及 M6 的共同山脚、鞍部、支脊和统一 2 米采样网格。M7 保留这些几何并优化生成与绘制调度；M8 本轮没有继续改山形或做新的精细画质迭代。

## 已知限制与收口范围

- 首次生成仍可能需要 1—3 分钟；离屏仅暂停绘制，不自动暂停生成工作。
- 实时速度取决于机位、画质、设备和后台负载；不承诺实时 60fps。离线视频的 60fps 规格不能证明实时速度。
- 部分岩面仍偏平滑、部分灌木与峰形有程序规律；不声明照片级完成、逐视角签收或与原库同等表现。
- M8 的完整导出、手机实机体验与完整移动端视觉仍未复验。
- 本轮实用性整理已完成；这不等于所有长期目标完成，也不代表所有作品在本轮全部验收通过。

后续如有新的明确需求，可再选一项推进：更快生成与缓存、完整移动端适配、持续帧率优化、镜头/参数收藏、环境变化，或车站班次与旅人故事。它们是可选方向，不是本轮尚未交付的隐含承诺。[六类扩展方向与历史阶段](notes/project-wrap-up-20261026.md)集中记录。

## 后期产品方向：坐船进入风景

[网页参考图区](web/index.html?revision=20261026-map-1#future-products) · [方向说明与六类扩展对应](notes/future-product-directions.md)

三张参考图是用户截图经 AI 去界面、生成式清理后的静态图，用来讨论未来体验；不是已经完成的实时产品或本机运行证据。当前 M8 场景保持不变，本次只整理方向，不启动研发。

| 候选方向 | 体验与所需扩展 |
| --- | --- |
| **优先：漓江竹筏慢游** | 在 M8 山水基础上增加筏头前景、低位乘坐和固定河心路线；先做启程、暂停与转头。[参考图](assets/extension-references/lijiang-raft-clean-v1.png) |
| 海岛泻湖巡游 | 独立泻湖地形、近崖与浅水关系，以及长尾船巡游。[参考图](assets/extension-references/island-lagoon-clean-v1.png) |
| 星河港湾夜航 | 城市港湾、摩天轮、奇幻天幕与水面联动。[参考图](assets/extension-references/cosmic-harbor-clean-v1.png) |

共同目标是从观看风景转为坐船进入风景，延续新风景、环境变化、参与、叙事、解释旅程和创作工具六类思路。竹筏方向优先，其余尚未制作或排期；商业用途仅为候选，未验证。

## 理解与价值：当前沉淀了什么

[网页理解与价值区](web/index.html?revision=20261026-map-1#understanding) · [完整讨论结论与官方参考](notes/understanding-and-value-20261026.md)

当前价值主要是研究思路、可运行样例与工程积累；技术差异化和商业价值尚未验证，也没有稳定的“图像到高质量互动世界”自动系统。LLM 写代码、专用 3D 生成器与产品整合管线是三层能力，生成器可以成为生产环节。已有控件、生命周期和测试经验可复用，但不能把常见技术称为护城河。

参考分区与深度、固定模板/素材/seed、有限参数搜索、多视角与性能验收，可以让后续工作更可控；这套集成自动管线尚未实现。新对话可携带场景代码、参数、参考约束和对照脚本，文档不等于自动能力已完成。项目继续收口，仅在明确用途及省时、质量或体验增量成立时再投入。

## 证据与历史入口

- 当前：[M8 验收](notes/lijiang-m8-acceptance.json)、[当前状态](notes/lijiang-current.json)。
- 各作品既有证据：[原作页内实时](notes/source-live-acceptance.d3d11.json)、[老街窗景](notes/canal-real-window-functional.d3d11.json)、[独立车站](notes/station-functional.d3d11.json)、[A/B 视觉复核](notes/visual-acceptance-independent.md)。这些报告只对应各自版本与测试范围。
- 漓江演进：[M5 视觉修复](notes/lijiang-m5-visual-review.json)、[M6 山群与接缝](notes/lijiang-m6-candidate.json)、[M7 性能候选](notes/lijiang-m7-candidate.json)。旧 M5 默认入口和 M7 候选定位已被 M8 正式入口取代，原文件与报告保留。
- [项目汇总与完整历史链接索引](notes/project-wrap-up-20261026.md)保留早期失败、范围纠正、旧入口和各轮证据，历史通过不替代当前验证。
- [历史研究引导图](web/guide.html) / [SVG](assets/programmable-worlds-guide.svg) / [生成源码](src/build_guide.py)：原作与 A/B 的研究快照，未包含后续漓江全套演进；[图中证据清单](notes/guide-final-evidence.json)保留。

## 来源与许可

源库为 [Leonxlnx/napali](https://github.com/Leonxlnx/napali)，固定研究版本 `4afb7c3a1aad3d0203193100305c46607134d0f5`，作者 Leon Lin，MIT。[作者原帖](https://x.com/LexnLin/status/2113720560920428685)、[固定 README](https://github.com/Leonxlnx/napali/blob/4afb7c3a1aad3d0203193100305c46607134d0f5/README.md)、[固定源码](https://github.com/Leonxlnx/napali/blob/4afb7c3a1aad3d0203193100305c46607134d0f5/index.html)、[本地原样文件](web/upstream/index.html)与[许可证](web/upstream/LICENSE)均保留；原帖配乐未收入本项目。

原作适配保留 33 段原始模板字符串（含 GLSL），但本项目的不同作品采用不同渲染方式。老街的 CC0 素材、Three.js 等许可见[场景署名](web/canal-real/credits.html)及各资源清单；例如[前景木材](https://polyhaven.com/a/wood_table_001)来自 Poly Haven。纯代码约束针对漓江场景，不应用于整个项目的 A/B 素材。

上游代码、原始 007 场景、旧原型与新增研究文字/作品分开保存。新增原创部分未额外声明统一开源许可。

[返回总索引](../../README.md)

此前 wrapup-1 网页整理的[独立验收记录](notes/web-wrapup-acceptance-20261026.json)另存：桌面与小屏网页排版、四入口导航、24 个本地链接、画廊和五项问答通过；没有启动或重新验收三维场景，也不作为本次新增产品方向的实现证明。

本次参考图与产品方向接入的[网页验收记录](notes/future-products-web-acceptance-20261026.json)另存，覆盖三张图实际解码、桌面/小屏排版、链接及静态参考标识；未启动三维场景。

[本次理解与价值区的网页验收记录](notes/understanding-web-acceptance-20261026.json)另存：桌面与小屏排版、路线表、三项折叠阅读和本地链接通过，M8 运行时保持原版本。
