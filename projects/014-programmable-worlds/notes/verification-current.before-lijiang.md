# 当前验证 · 原作与两个独立世界

记录日期：2026-10-25，Asia/Shanghai。原始 run 仍保留 UTC 标识。

原作页内实时展示与控制、老街窗景、新船坞车站的完整功能，以及正式首页和手机嵌入已有各自的真实通过记录。视觉判断另见[双场景复核](visual-acceptance-independent.md)。最终引导图已固定实际证据并通过 CPU 七区排版复核；全项目交付状态以[交付记录](delivery-acceptance.json)为准，不以布局检查代替艺术或运行验收。

## 当前可复核的范围

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

所有自动验收只操作本任务自有隐藏页面及 webContents，`show=false`，不获取系统焦点、不发送系统键鼠。失败报告、原始图片、旧模型和资源继续保留；没有磁盘清理，不读写 ReflectFlow。

[范围纠正](scope-correction-20261024.md)继续有效：旧 `window/story` 共享同一老街，不能作为两个独立空间。新船坞车站承担第二件；基础引擎和部分材质算法可以复用，实际布局、模型、光照和互动分别制作。[更新前的完整验证快照](verification-current.before-independent.md)与[早期集成记录](verification.md)继续保留，仅作历史，不替代当前报告。
