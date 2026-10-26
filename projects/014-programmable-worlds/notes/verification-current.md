> 漓江画质目标已重新打开，当前全项目交付状态为reopened。以下成功记录只证明其原始范围，不能证明达到源库画质；见[重开说明](lijiang-quality-reopen.md)。

# 当前验证 · 原作、两个运河作品与漓江晨航

记录日期：2026-10-25，Asia/Shanghai。原始 run 仍保留 UTC 标识。

原作页内实时展示与控制、老街窗景、新船坞车站的完整功能，以及正式首页和手机嵌入已有各自的真实通过记录。视觉判断另见[双场景复核](visual-acceptance-independent.md)。最终引导图已固定实际证据并通过 CPU 七区排版复核；全项目交付状态以[交付记录](delivery-acceptance.json)为准，不以布局检查代替艺术或运行验收。

## 当前可复核的范围

2026-10-25 新增的纯代码山水另存于 `web/lijiang-flythrough/`，直接嵌入正式首页第四个入口。它由用户桌面目标文档指导制作，不替换原作、老街或船坞。以下新增记录与旧三入口快照各自保留。

| 新增范围 | 实际记录 | 边界 |
| --- | --- | --- |
| 漓江默认场景与完整航线 | [15项实际功能](lijiang-functional.d3d11.json)，`04-16-32-477Z` | 0/12/25/45秒构图、真实45秒飞行、净空、自由移动、GUI、参数像素变化、390/640窄屏、销毁；无外部景物资源 |
| 完整1080p60导出 | [实际导出](lijiang-recording.d3d11.json)与[ffprobe实际解码](../assets/lijiang-qa/2026-10-25T04-20-57-291Z/ffprobe.json) | VP9 WebM、1920×1080、60/1、2700实际解码帧、45.000秒、78,797,616字节；固定步长和严格包时间戳，非实时录屏帧率推断 |
| 正式四入口与手机 | [21项完整首页记录](lijiang-hub-acceptance.d3d11.json)，`04-50-53-221Z` | 漓江→原作→漓江→老街→船坞→漓江；旧文档释放后再启动，峰值1；native拖动和轻点、实际376/390×845的净画面和恢复、小编码取消后相机/UI/尺寸恢复 |
| 最后补齐的空气参数 | [实际GUI与画布比较](lijiang-atmosphere.d3d11.json)，`04-56-11-308Z` | 雾团数量7→0、高度偏移0→60米、暖/冷色温均改变画面，归零后同一运行默认画布差0；补充检查不冒充重跑全部飞行或完整视频 |
| 默认画质 | [独立视觉记录](lijiang-visual-acceptance.md) | 按纯代码兴坪山水意象、峰林/江面/雾层与四镜头、正式手机嵌入判断；不主张摄影真实或与napali质量等同 |

完整样片是[真实WebM文件](../assets/lijiang-qa/2026-10-25T04-20-57-291Z/actual-flight.webm)。本机D3D11、1440×902、OSR目标60时，4秒片段实测约60.07提交帧/秒、59.82窗口绘制帧/秒；主页验收窗口目标30，二者不混写为网页处处恒定60。编码用时约58.37秒不是视频时长。

前两版画质被拒绝、终景裁切、GUI类名与启动锚点失败及修正都保存在[制作迭代](lijiang-iteration-log.md)。默认场景不使用外部图片/模型/贴图/HDR，反射/折射、阴影和AO是场景在内存中实时生成的渲染结果；地貌为构图创作，未声称测绘复刻。旧SVG仍是原作+A/B研究快照，新增实践由实时入口和上述记录承载。

| 范围 | 实际记录 | 边界 |
| --- | --- | --- |
| 完整 napali 页内实时原作 | [15 项页内记录](source-live-acceptance.d3d11.json)与[运行说明](source-inpage-realtime-current.md) | 原渲染器真实流、相机驾驶、暂停与释放；完整 33 段模板含 GLSL 保留检查另做 |
| 老街窗景 `canal-street` | [13 项运行记录](canal-real-window-functional.d3d11.json)与[双场景视觉判断](visual-acceptance-independent.md) | 实际窗边、河岸、书店、驾驶、水流、窄屏和释放；老街来信仅为其历史模式 |
| 独立船坞车站 `shipyard-station` | [15 项完整功能](station-functional.d3d11.json)、[独立页原始视觉范围](visual-acceptance-independent.standalone.md)与[当前说明](independent-station-current.md) | 四机位、真实客船、栈桥登船、留岸、完整两结局；不复制旧 25 秒漂信流程 |
| 正式首页与手机嵌入 | [18 项完整正式报告](hub-two-worlds-acceptance.d3d11.json)，`2026-10-24T18-38-15-177Z` | `candidateOverride=false`；原作→老街→新车站→老街，活动文档/重场景峰值 `1/1`，请求 375/390 宽的实际 376/390×845 中 idle/docked 四组均检查 |

新场景实际使用独立 GLB 与 lighting fingerprint。当前 23 组静态完整漫反射为 **22×128 样本＋oak 单组 2048 样本**，不是把全部 23 组写成 2048，也不以样本量判断画质。正式 [manifest](../web/shipyard-station/baked-r1/manifest-oak2048.json) 和[新作记录](independent-station-current.md)保留来源、局部重积分与动态船实时遮蔽的边界。

## 失败、修正与视觉标志的时间关系

`station-functional` 的 `18-17-51-965Z` 在独立视觉判断前已完成全流程，因此其中 `lighting.accepted=false` 保持原样。后续实际视觉复核通过、[visual-review.json](../web/shipyard-station/visual-review.json) 绑定同一模型/光照/manifest/运行修订后，正式 `18-38-15-177Z` 才捕获到 `accepted=true`。早先功能记录和制作 manifest 的 false 不被回写；数据校验、功能成功与艺术判断各自成立。

两次正式入口失败继续保留：

- [`18-29-33-944Z` 原始 failed](../assets/hub-qa/d3d11/2026-10-24T18-29-33-944Z/acceptance.json)：无活动浏览器 pointer 的捕获错误；加入兼容处理，最终用隐藏自有 webContents 的 native mouse 重新验证。
- [`18-35-03-197Z` 原始 failed](../assets/hub-qa/d3d11/2026-10-24T18-35-03-197Z/acceptance.json)：父页面浮层遮挡手机 reset，badge 与 hint 交叠；仅在 B 的 `concept-station` 范围隐藏父浮层，保留子界面与正文入口，CSS 版本 `20261025-station-preview-controls-1`。

最终通过是[一次新的完整正式首页运行](../assets/hub-qa/d3d11/2026-10-24T18-38-15-177Z/acceptance.json)，包含桌面入口与四组手机状态，不将旧失败覆盖成通过，也不以 standalone 的截图替代嵌入操作。正式手机实际画面仍由视觉记录独立判读，测试数量不证明完成度。

## 来源、运行与历史

固定上游为 `Leonxlnx/napali` commit `4afb7c3a1aad3d0203193100305c46607134d0f5`，MIT / Leon Lin。[原样上游](../web/upstream/index.html)另存；[源码检查程序](../src/build_runtime.py)核对 33 段原始模板字符串逐字一致。适配保留地形、侵蚀、植被、水与天空的质量参数，提供异步编译、分批提交和驾驶；默认 100% 分辨率。原作普通页面接收隐藏完整原渲染器的实际流，不是截图播放。

启动使用 [Start-Project.ps1](../Start-Project.ps1)，准备 8796 页面服务与 8797 原作后台服务。大型原作首次出帧与运行帧率受后端和本机负载影响；历史约 2.52 帧/秒记录不是对所有场景的性能承诺。完整原作与重制作品的统计不互相套用。

所有自动验收只操作本任务自有隐藏页面及 webContents，`show=false`，不获取系统焦点、不发送系统键鼠。失败报告、原始图片、旧模型和资源继续保留。D盘耗尽时，本项目旧船坞的234个制作中间件逐文件长度和SHA256校验后完整保留到C盘任务目录，原路径用已检查联接恢复，未丢弃文件；回执见仓库 `.cache/014-shipyard-retention.json`。日常库、浏览器数据和ReflectFlow未清理或改动。

[范围纠正](scope-correction-20261024.md)继续有效：旧 `window/story` 共享同一老街，不能作为两个独立空间。新船坞车站承担第二件；基础引擎和部分材质算法可以复用，实际布局、模型、光照和互动分别制作。[更新前的完整验证快照](verification-current.before-independent.md)与[早期集成记录](verification.md)继续保留，仅作历史，不替代当前报告。
