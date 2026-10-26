# 两个独立空间的视觉验收

复审日期：2026-10-25（Asia/Shanghai）。截图目录中的时间保留原 run 标识。

**结论：accepted，限本文实际查看的独立页面及画面范围。** 我的评审判断是，老街窗边与修正后的船坞车站已进入原作同档实时作品的完成度区间，当前所见画面没有应阻断该范围交付的视觉问题。这是对可信光照、材质、空间组织、构图和可见瑕疵的质量判断，不声称客观逐像素等价，也不以哈希、采样量、几何数量或功能测试次数证明艺术质量。

## 范围纠正继续有效

[scope-correction-20261024.md](scope-correction-20261024.md) 中承认的范围错误不撤回：旧 `window/story` 是同一套老街的两种模式，旧的视觉通过不能证明已有第二个独立作品。原作 `napali` 的实时展示也不计为我们制作的第二件。

本次分别评审以下两个空间：

| sceneId | 实际空间与模型内容 | 与另一空间的可见区别 |
| --- | --- | --- |
| `canal-street` | `web/canal-real/` 的老街空间，窗边近景、对岸深窗洞砖楼、窄运河、街树与书店。 | 以室内窗框组织前景，视线穿过窄水道抵达连续街屋。 |
| `shipyard-station` | `web/shipyard-station/` 的独立船坞车站模型与布局：宽航道、站台雨棚与钟、票务候船厅、修船滑道与门吊、厂桥、烟囱、水塔及客船。 | 站台与船坞分处两岸，工业地标与宽水面组织空间；登船后回望站台，与留岸目送形成不同观察位置。 |

新作的空间独立性可以直接从多机位实际画面辨认，不能仅归因于更名、换机位、改色或更换剧情。基础纹理、水与反射算法的复用没有把它变回老街模型。

## 实际查看的证据

canvas 为实际网页画布，page 为带实际界面的截图。像素尺寸已读取 PNG 文件头核对。制作阶段离线图、`gi=0` 预览及旧缓存候选没有作为本次通过依据。

| Run / 尺寸 | 已实际查看的证据 | 支持的判断 |
| --- | --- | --- |
| 原作 `2026-10-24T01-07-18-256Z`，1426×864 | [03-headland-35s-canvas](../assets/runtime-qa/2026-10-24T01-07-18-256Z/03-headland-35s-canvas.png) | 原作的统一日光、大气层次、近远材质与水面组织基准。 |
| 老街 `2026-10-24T13-49-00-916Z`，1440×902 | [01-window-canvas](../assets/canal-real-qa/2026-10-24T13-49-00-916Z/01-window-canvas.png) | 老街窗边实际参考，与新船坞车站直接比较空间、模型内容和材质完成度。 |
| 新作修正版 pilot `2026-10-24T18-12-49-173Z`，1440×902 | [01-platform-canvas](../assets/shipyard-station-qa/2026-10-24T18-12-49-173Z/01-platform-canvas.png)、[02-shipyard-canvas](../assets/shipyard-station-qa/2026-10-24T18-12-49-173Z/02-shipyard-canvas.png)、[03-hall-canvas](../assets/shipyard-station-qa/2026-10-24T18-12-49-173Z/03-hall-canvas.png)、[04-basin-canvas](../assets/shipyard-station-qa/2026-10-24T18-12-49-173Z/04-basin-canvas.png) | 站台、滑道船坞、候船厅与水域全景分别成立；模型布局明显不同于老街。 |
| 同一修正版 pilot，1440×902 | [03-hall-diffuse-canvas](../assets/shipyard-station-qa/2026-10-24T18-12-49-173Z/03-hall-diffuse-canvas.png)、[05-pilot-actual-docked-canvas](../assets/shipyard-station-qa/2026-10-24T18-12-49-173Z/05-pilot-actual-docked-canvas.png)、[06-pilot-boarding-path-canvas](../assets/shipyard-station-qa/2026-10-24T18-12-49-173Z/06-pilot-boarding-path-canvas.png)、[07-pilot-onboard-canvas](../assets/shipyard-station-qa/2026-10-24T18-12-49-173Z/07-pilot-onboard-canvas.png)、[07-pilot-onboard-page](../assets/shipyard-station-qa/2026-10-24T18-12-49-173Z/07-pilot-onboard-page.png) | 木面异常亮点的修正、近船材质、登船中间状态和开放甲板眼位。diffuse 图只用于诊断，不当作最终外观。 |
| 全流程 `2026-10-24T18-17-51-965Z`，1440×902 | [06-on-actual-passenger-deck-canvas](../assets/shipyard-station-qa/2026-10-24T18-17-51-965Z/06-on-actual-passenger-deck-canvas.png)、[07-complete-aboard-canvas](../assets/shipyard-station-qa/2026-10-24T18-17-51-965Z/07-complete-aboard-canvas.png)、[07-complete-aboard-page](../assets/shipyard-station-qa/2026-10-24T18-17-51-965Z/07-complete-aboard-page.png)、[08-complete-on-shore-canvas](../assets/shipyard-station-qa/2026-10-24T18-17-51-965Z/08-complete-on-shore-canvas.png)、[08-complete-on-shore-page](../assets/shipyard-station-qa/2026-10-24T18-17-51-965Z/08-complete-on-shore-page.png) | 甲板、上船离站完成与留岸完成画面的构图、远岸边界和界面完整性。 |
| 同一全流程，390×845 | [viewport-390-845-canvas](../assets/shipyard-station-qa/2026-10-24T18-17-51-965Z/viewport-390-845-canvas.png)、[viewport-390-845-page](../assets/shipyard-station-qa/2026-10-24T18-17-51-965Z/viewport-390-845-page.png) | **独立页 standalone idle** 的窄屏场景与界面；未据此推断停靠选择状态。 |
| 同一全流程，640×521 | [viewport-640-521-canvas](../assets/shipyard-station-qa/2026-10-24T18-17-51-965Z/viewport-640-521-canvas.png)、[viewport-640-521-page](../assets/shipyard-station-qa/2026-10-24T18-17-51-965Z/viewport-640-521-page.png) | **独立页 standalone idle** 的紧凑布局与画面；不是正式首页嵌入证据。 |

本次新作有效候选为 `runtimeRevision=shipyard-oak2048-aftdeck-2`，使用 `baked-r1/manifest-oak2048.json`；manifest SHA-256 为 `97eb5a39b308d200f0011f9732725a812b7794cca48553178a11e4841b0f882e`。这些标识只用于绑定所评版本，不是画质通过理由。`2026-10-24T18-07-35-039Z` 被发现仍加载部分旧缓存，未用于判断新修正是否有效。

## 通过条件与修正结果

- 两个空间都有明确的主体、尺度、观察关系与独立地标。新作的工业留空与老街的密集街屋不同，不单因题材稀疏就判为未完成。
- 新作站台阴影、灯下照明、砖木与金属材质、水面反射组成可读的整体。候船厅原先分散的明亮橙红异常点已显著收敛，柜台与地板不再被这些火点破坏。
- 近船的甲板、舱壁接缝、檐边、玻璃和栏杆有可辨的材质与遮蔽关系。它与岸边处在同一场景中，不再呈现初轮那种完全均匀白块的资产观感。
- 登船终点是开放甲板回望站台的眼位，船舱屋顶不再遮住半幅视野。离站完成画面没有暴露断水、岸体漏空或未处理的硬场景边缘；院墙、厂房和站台形成工业岸线。
- 小栏杆及锌棚虽有背光暗面，当前实际帧中未见可明确归为未采样图表的孤立黑条。未按未采样面数量推定可见缺陷。
- 两种桌面结局的场景与文字完整。已查看的 390×845、640×521 standalone idle 页面中，标题、场景机位、呼船、暂停与重新开始控件均可见，没有正文被裁掉或控件堆叠遮挡的可见问题。

原作海岸、新作老街与船坞车站无需具有相同的波浪、白沫或植被密度。评审比较完成度与可信度，不要求工业运河复制海岸的自然要素。候船厅深色木面、工业场地留空等仍可继续润饰，但当前所见不足以构成新的交付阻断。

## 尚未覆盖的入口与布局

本文件不替代功能时序、输入约束、两分支逻辑、性能、入口切换或资源释放检测。全流程截图证明本评审看到了对应画面，不由此文另行宣布功能测试通过。

**正式首页 hub 的嵌入布局尚待独立实际审查**，包括 375/390 宽度下的 embed idle 与 docked 选择状态。本次两种窄屏证据仅为 standalone idle，不能扩大为所有手机状态或正式入口已通过。后续取得 hub 实图后应补充记录；若发现布局或画面问题，需要继续修正。

## 正式 hub 嵌入追加复核

追加日期：2026-10-25。**正式 hub 在以下实际尺寸与状态中的视觉复核通过。** 本节更新上一节“尚未覆盖”的状态；原段保留以说明独立页通过与正式入口审查的先后顺序。追加前的独立页范围记录另完整保存在 [visual-acceptance-independent.standalone.md](visual-acceptance-independent.standalone.md)。

本次实际查看正式生产入口 run `2026-10-24T18-38-15-177Z` 的四组 page，以及各自的 live-frame。PNG 文件头确认页面实际为 **376×845、390×845**；内部实时画布分别为 **321×520、335×520**。本节不把 376 宽的实际证据写成已查看 375 宽。

| 实际页面尺寸 / 状态 | 实际查看的 page 与 live-frame | 可见结果 |
| --- | --- | --- |
| 376×845，embed idle | [idle-page](../assets/hub-qa/d3d11/2026-10-24T18-38-15-177Z/mobile-376-845-station-idle-page.png)、[idle-live-frame](../assets/hub-qa/d3d11/2026-10-24T18-38-15-177Z/mobile-376-845-station-idle-live-frame.png) | 标题、观察提示、三个机位按钮，以及呼来客船、暂停、重新开始完整可见。 |
| 376×845，embed docked | [docked-page](../assets/hub-qa/d3d11/2026-10-24T18-38-15-177Z/mobile-376-845-station-docked-page.png)、[docked-live-frame](../assets/hub-qa/d3d11/2026-10-24T18-38-15-177Z/mobile-376-845-station-docked-live-frame.png) | 船已靠岸的实际画面与选择框对应；问句、上船离开、留在站台、继续及重新开始均完整可见。 |
| 390×845，embed idle | [idle-page](../assets/hub-qa/d3d11/2026-10-24T18-38-15-177Z/mobile-390-845-station-idle-page.png)、[idle-live-frame](../assets/hub-qa/d3d11/2026-10-24T18-38-15-177Z/mobile-390-845-station-idle-live-frame.png) | 标题、提示和两排控件完整；未见横向裁切或控件之间的遮挡。 |
| 390×845，embed docked | [docked-page](../assets/hub-qa/d3d11/2026-10-24T18-38-15-177Z/mobile-390-845-station-docked-page.png)、[docked-live-frame](../assets/hub-qa/d3d11/2026-10-24T18-38-15-177Z/mobile-390-845-station-docked-live-frame.png) | 停靠选择框和底部继续、重新开始有清楚的分区，未被父页面重复浮层覆盖。 |

这四组实际页面中，未发现此前父级预览浮层覆盖子页面提示或重置控件的问题。page 中的场景与对应 live-frame 一致，站台、客船和水面保持已评审的视觉状态；无需因输入绑定修正重做静态场景质量判断。

因此，本文的视觉通过范围现补充覆盖上述正式 hub 手机嵌入的 idle 与 docked 状态，未见新的可见交付阻断。它仍不替代点击是否生效、输入监听、原作与两作品间切换、资源释放或性能验收；这些由 [hub-two-worlds-acceptance.d3d11.json](hub-two-worlds-acceptance.d3d11.json) 等运行记录另行证明，也不扩大为所有设备与所有界面状态。
