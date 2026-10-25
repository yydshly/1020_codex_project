# 来源与许可边界

研究与创建日期：2026-10-24；研究页地图集成范围更新：2026-10-25。

## 方法参考

DeanChensj/jiangshan-map，固定版本 `53059f1c7fed305807b19365857a5f135daf3ac6`：
https://github.com/DeanChensj/jiangshan-map/tree/53059f1c7fed305807b19365857a5f135daf3ac6

该项目代码采用 GPL-3.0。深海主作品学习其时序阶段、实体解析、多视图联动、分层渲染、深链接和过期请求保护方法。本轮另对照作者[在线作品](https://deanchen.me/jiangshan-map/)的场景占比、信息层次和事件联动；在线版可能较固定源码更新。所检查的固定源库以 SVG 和浮雕底图呈现地图，不是深海作品的三维引擎。深海主场景没有导入其地图控制器、历史资料、底图、样式或主体布局；不将九个纯核心的模块化方案描述成源库已有架构。017研究网页新增的独立完整地图展品另有直接复用范围，见下一节。

## 研究页中的历史地图集成展品

`web/research.html` 新增独立地图展品，以同源 iframe 运行 `web/integrations/atlas/`。它直接集成016当前完整地图运行时：54份江山时序固定版本文件，包含历史引擎、资料、SVG界面、样式和资源；另有016新增的入口、路线编辑、联动Three.js三维地形、解码现代DEM，以及本地Three.js模块。深海 `web/scene.js` 不导入这套地图运行时，地图状态与深海航次状态分开。

本地入口为[研究页](http://127.0.0.1:8017/research.html#atlas-demo)与[独立地图](http://127.0.0.1:8017/integrations/atlas/?view=3d)，核心资源只需8017服务。`src/build-atlas-integration.mjs` 按固定白名单从016读取并核验来源，不改016文件、不下载网络素材，不打包旧微缩场景、原始高程瓦片或私有配置。35份专题HTML副本仅删除原站统计脚本；历史文字、数据、作者归属和资料外链保留。集成入口、workbench API附加代码、terrain镜头保留选项的派生修改均记录输入/产物SHA-256。

`web/atlas-demo.js` 是017父页适配器，管理入口、预设、状态读数与实例生命周期；`web/integration-assets/atlas-bridge.mjs` 是集成 iframe 的同源消息桥，校验父窗口及会话并转发白名单命令；`atlas-api-suffix.mjs` 构建时追加到016适配器的集成副本，访问原控制器和三维视图并暴露状态、命令、暂停及释放接口。新增集成代码采用 GPL-3.0-only，不声称为源库自带SDK。

上游代码遵循GPL-3.0，原许可全文、中文说明和校勘约定完整保留。**CHGIS V6／Hartwell相关历史GIS数据的原始学术、非商业条款继续适用，代码GPL不会改变这些数据的独立条款。** Three.js 0.180.0遵循MIT；现代DEM来自Mapzen Terrain Tiles / AWS Open Data，保留USGS SRTM／GMTED2010与NOAA ETOPO1归属。DEM为现代地形并有显示高度夸张，不是古地貌复原；地图历史边界为示意，路线不等于精确道路。原古琴播放器5首Wikimedia外链音轨未缓存，仅播放音乐需要联网。

详细来源、每份文件哈希与修改记录见[集成清单](web/integrations/atlas/integration-source.json)、[来源页](web/integrations/atlas/integration-source.html)、[本次声明](web/integrations/atlas/INTEGRATION-NOTICE.md)和[016原始声明](web/integrations/atlas/NOTICE-016.md)。重建使用 `node projects/017-abyss-expedition/src/build-atlas-integration.mjs`；静态检查使用 `node projects/017-abyss-expedition/src/check-atlas-integration.mjs`，运行8017后可加 `--base-url=http://127.0.0.1:8017/` 核对HTTP资源字节。这些检查不构成浏览器手势、生命周期或故障恢复已经通过的声明。

## 直接复用的既有资产

`web/core/temporal-core.mjs` 复制自同一工作区 015 研究项目的 `web/lab/temporal-core.mjs`。它是前一阶段自行编写的、受源库交互思路启发的独立学习模块，并非从江山时序控制器摘取。文件保留 `GPL-3.0-only` 声明，复用时保留此来源。

## 第三方软件

Three.js 0.180.0 与 OrbitControls：MIT。原始许可证保存于 `web/vendor/three/LICENSE`；版本、文件来源和校验信息保存于 `web/vendor/three/source.json`。它们是第三方三维基础库，不属于本次原创引擎。

## 新增实现与数据

环境导览新增 `web/environment-guide.js`、`environment-guide.css`、`data/environment-guide.mjs` 与 `core/environment-location.mjs`，以及独立语音生成、校验工具，均为自主实现，采用 GPL-3.0-only。环境界面复用既有播放时钟与语音适配器，不操纵镜头或任务事件；位置说明仅是两张教学地形的粗分区，不能当作实测地名或水深。

新增12条环境配音与原22条导演配音分目录保存，仍使用 MiniMax `speech-2.8-hd`、`male-qn-qingse` 音色。新增公开清单位于 `web/assets/environment-narration/`，共378.432秒；密钥仍只从项目外部私有配置读取。科学概念直链保留在 `web/data/environment-guide.mjs`，覆盖 NOAA 深海环境、峡谷、浑浊流、海洋雪、珊瑚海绵与 WHOI 热液资料。内容为中文科普转述，非机构现场录音。运行网页仅播放本地音轨，不请求大模型生成解释。实际覆盖见[环境导览验收](notes/verification-environment-guide.md)。

随讲解递进的画面提示新增 `web/core/narration-cues.mjs`、`web/data/environment-cue-tracks.mjs`、`environment-cue-timing.mjs`、`web/rendering/environment-cues.mjs`、`cue-labels.mjs` 以及 `src/build-environment-cue-timing.mjs`，均为自主实现或编写，采用 GPL-3.0-only。纯提示核心为第九个通用核心，有非海洋测试；`environment-location.mjs` 仍是主题位置辅助，不计入通用核心。所研究的源库没有这些三维驾驶、语句提示或海洋动画模块。

12章共55个提示引用原旁白精确短语；本地 ffmpeg 停顿检测提供122处与标点匹配的实测停顿锚点，锚点之间用文字与标点权重插值。实测停顿不等于逐词强制对齐，标点对应关系是启发式，未保证逐词时刻误差。此过程不联网，不改音轨，不重新生成语音；文件中的哈希用于关联原文本与音频。

表面框选、流线箭头、缓慢下沉颗粒和实体原位光环均为主题视觉表达。水流和海洋雪标为示意，不是实测流向、速度或已鉴定物质；遮挡与画外方向标记引导用户自行观察，不改变相机、航次或个人记录。视觉提示可独立关闭，暂停冻结时间相位，seek重新计算提示。新增浏览器和几何覆盖见[画面提示验收](notes/verification-environment-cues.md)，不以纯模块或本地音频检查宣称全部画面已验收。

视觉返工新增 [Poly Haven / Rock Surface](https://polyhaven.com/a/rock_surface) 岩面 PBR 材质，作者 Amal Kumar，采用 [CC0](https://polyhaven.com/license)。项目保留原始 diffuse、OpenGL normal 与 roughness 三张 1K 图片；来源、原始校验及 SHA-256 见 `web/assets/materials/sources.json`。素材用于三维表面着色，不是实测海床影像。

实体查询、关键帧插值、异步保护、相机状态编解码与校验、导演播放时钟、临时学习会话，以及科考业务界面、逐站导览、样本比较、报告导出和海底场景适配器均为本项目自主新增代码，采用 GPL-3.0-only，完整许可见 [LICENSE](LICENSE)。其中 `camera-state.mjs`、`director-core.mjs` 与 `learning-core.mjs` 不来自江山时序，也不包含 Three.js 实现。航次、遥测与逐站观察说明为虚构教学内容，地形由程序生成，无真实海域测深或 DEM 数据；作品运行不调用大模型生成内容。

`web/rendering/hydrothermal-plume.mjs` 与 `benthic-life.mjs` 属于自主实现，采用 GPL-3.0-only。前者为喷口粒子生命周期的视觉表达，后者生成管虫与海绵群落几何；二者依赖 Three.js，属于主题视觉适配模块，不计入九个无渲染依赖的通用核心，也不构成流体、生态或生物生长仿真。`appearance` 字段选择已实现的外观，不能自动适配任意新主题。

`web/core/pilot-core.mjs`、`web/pilot-ui.js` 与 `web/pilot.css` 为自主新增，采用 GPL-3.0-only。驾驶核心不依赖 DOM 或 Three.js，管理持续输入、运动积分、地形与边界保护、停止及位姿编码；没有从源库复用驾驶功能。两航次使用不同的程序高度场，网格与驾驶碰撞共用三角形插值高度。模型位置、航速和离底高度不是实测读数，不代表真实潜器动力学。驾驶范围 X/Z±580、离底保护18、顶限Y414，均为模型单位；驾驶模式相机距离另约束为23–620。

导演模式新增的 `web/director-ui.js`、`web/data/director-shots.mjs`、`web/rendering/shot-camera.mjs`、`expedition-context.mjs` 与 `narration-player.mjs` 均为自主实现或编写，代码采用 GPL-3.0-only。浏览器适配连接时钟、字幕、调查导航与音轨；机位规划虽为纯函数，仍保留本场景的尺度约定；母船、水柱、环境与采样设备是解释性三维组件。水柱垂直距离经过压缩，不能据此换算真实潜航深度；界面环境水深与读数均为教学模拟。

`web/core/learning-core.mjs`、`web/learning-ui.js`、`web/data/learning-content.mjs` 与 `web/rendering/learning-world.mjs` 均为自主实现或编写，代码采用 GPL-3.0-only。纯学习核心只管理临时采样会话与同类配对门槛；浏览器适配提供词典、设备清单、原理自动／手动步骤、点击取水、样本卡、对照表和结尾整理。三维剖面、箭头、颗粒和食物关系用于解释原理，不是热力、化学或生态计算模型。

`web/rendering/rov-system.mjs` 是自主实现的共享 Three.js 潜器与船端工作台工厂，采用 GPL-3.0-only。科考现场与设备教学的潜器共用 `createRovSystem()` 的几何、部件分组、锚点和动作；教学层另以高亮、剖视、声波与通信粒子解释八组职责。`createRovControlStation()` 仅生成放大的船端教学工作台，正常母船仍由既有 `research-vessel.mjs` 生成。选择设备后可运行四秒独立演示，影片和语音保持暂停。这些形态和动作不构成真实导航、声学、压力或设备控制算法。

设备说明明确 ROV 不载人，人员留在母船；黄色部件为固体浮力材料，耐压舱保护电子设备。随身小瓶架与 A／B 站预布的较大海床采水架分别表示两类装置，不将大型采水架描述成机械臂负载。声呐表现目标、距离和障碍线索，不能替代水样化验；所有读数和装置比例均为教学设计。

A／B 演示均取水，只有两份同类样本实际完成后才解锁对照；化学成分标为待分析，不把模拟读数当作本航次新证据。学习会话中的临时演示记录与用户主动保存的个人航次报告分开；结尾区分“已知原理 / 本轮记录 / 待分析”。原理成立来自所列科普来源，不由取样动画证明。

中文旁白由本项目编写，二十二段音轨（新增两段设备配音，原二十段使用校验缓存）通过 MiniMax `speech-2.8-hd`、`male-qn-qingse` 音色合成，接口依据见[MiniMax 官方同步语音合成文档](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)。这是生成的解说，不是机构录音或真人现场采访。`src/generate-narration.mjs` 与 `src/minimax-tts.mjs` 为自主实现的生成工具，代码采用 GPL-3.0-only。工具通过绝对路径 `--env-file` 从项目之外读取私有配置；密钥不写入 MP3 清单或网页。播放端只加载项目内 MP3 与公共来源、文本、时长和校验信息，不在浏览器中直接调用 MiniMax。项目不提供视频导出。

两个航次共用场景适配器，适配器按 terrain 类型选择地形与物体生成规则。九个独立核心模块覆盖时序、查询、插值、异步保护、相机状态协议、导演播放时钟、临时学习会话、自由驾驶与语句提示，不意味着任意业务只替换数据便能自动得到合适的三维场景。相机协议记录位置、观察目标与模式，坐标按 0.1 量化，允许距离 10–2500；普通航次相机另限制为 48–1040，并保护俯角、目标范围和地形视线。仅安全镜头按协议恢复，旧贴地或被山体遮挡的镜头可能调整并提示。坐标约定、镜头运动和业务规则仍需由目标项目适配。

每条导演短片含十一镜头，两条航次共二十二段解说；配音版片长按音频清单计算，每镜为 `max(原分镜时长, ceil((音轨秒数+1)×10)÷10)`，当前热液 311.2 秒（5:11.2）、峡谷 298.5 秒（4:58.5）。影片秒数与教学航次分钟独立。音轨开启时实际播放位置驱动影片，缓冲时镜头等待；关闭语音后可继续字幕放映。`film` 链接仅保存章节并暂停打开，不包含片内进度、自由相机或临时景别，导演播放也不自动写入个人采样记录。`context` 参数保存物体语义标注勾选；导演期间临时启用该类标注，退出恢复原勾选。

无深链接参数进入作品或切换航次时，自动停在本航次导演开场，不自动出声；明确的时间、事件、相机或章节分享参数继续按链接恢复。

驾驶中切换航次保持手动模式并停止移动。`pilot` 保存驾驶视角，`pose` 保存量化的模型位置与机头朝向，非前向视角可另存 `cam`；打开后不自动移动。驾驶不会调用个人报告记录流程。最新驾驶与场景区分的实际覆盖见[驾驶验收](notes/verification-piloting.md)，旧版验收范围保留。

接口契约与接入方法见 [核心模块指南](web/core/README.md)，本轮设备体验的实际覆盖范围见 [设备验收](notes/verification-equipment.md)，此前二十章 [学习验收](notes/verification-learning.md) 保留原范围，旧版 [导演验收](notes/verification-director.md) 与 [配音版验收](notes/verification-narrated.md) 保留原测试范围，此前画面对照见 [效果对照与验收](notes/quality-comparison.md)；[前轮记录](notes/verification-polish.md)与 [首版记录](notes/verification.md)保留其各自测试范围。源库截图为作者在线页面的对照证据，未作为深海场景素材或海床渲染底图使用；作品运行截图为实际浏览器画面。390×844 记录为 CSS 视口检查，不代表物理手机设备测试，也不宣称作品已达到原作艺术质量。

## 科普来源

出处见 `web/sources.json`，NOAA 与 WHOI 官方说明支持科普事实。页面仅以简短中文转述相关原理，不使用机构照片、视频、品牌标志或整篇文章；来源链接不意味着机构参与或背书。

- WHOI Hydrothermal vents：热液与矿物烟囱。
- NOAA Photosynthesis and chemosynthesis：化能合成。
- NOAA Do all corals live in warm water?：冷水珊瑚。
- NOAA Remotely Operated Vehicles：ROV 结构与遥操作。
- NOAA Ocean floor features：海底地貌。

作品的站名、坐标、航线、采样和数值不应作为真实调查、导航或设备操控依据。模拟温度对应 ROV 周围海水，不代表热液喷口流体；模拟电量为备用电量。
