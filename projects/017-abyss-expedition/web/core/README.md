# 可复用模块

以下九个纯模块可直接作为浏览器或 Node.js ES module 导入，不依赖 DOM、Three.js、地图或深海业务。

| 模块 | 输入与输出 | 边界 |
| --- | --- | --- |
| temporal-core.mjs | `createExplorer(dataset)` 返回状态、派生视图、动作、订阅、URL 编解码 | 从 015 已有资产逐字节复用；连续阶段 `[from,to)`，末端 `max + 1`；预设 route / labels 两个图层 |
| entity-index.mjs | `createEntityIndex(entities)` → `search(query,limit)` 与 `resolve(idOrAlias)` | 使用规范化名称与显式别名；精确歧义返回 null；不做领域特有后缀猜测 |
| track.mjs | `interpolateTrack(frames,time)` → 坐标与数值通道的插值结果 | 时间严格递增、相同数值字段、0–1 平面坐标；端点钳制；不是物理运动模型 |
| latest-task.mjs | `createLatestTask().run(loader,onCommit,onError)` | 只有最近任务能提交或报告错误；不是请求取消器；提交回调保持同步 |
| camera-state.mjs | 相机位置、观察目标与模式的校验、版本化编解码、容差比较 | 只管状态协议；安全镜头、地形视线和过渡由渲染适配器负责 |
| director-core.mjs | `createDirector(shots)` 返回片内进度、当前镜头、播放/暂停/选章/完成状态与订阅 | 第六个核心；以秒计时，不调度动画帧，不操作相机、字幕、URL、设备或个人记录 |
| learning-core.mjs | `createSamplingSession(config)` → 临时样本快照、collect/reset/subscribe/destroy | 第七个核心；同类配对门槛、冻结快照与会话生命周期，无 DOM、渲染或存储依赖 |
| pilot-core.mjs | `createPilotController(options)` → 独立位姿、速度、离底高度与阻挡状态；位姿编解码 | 第八个核心；运动与注入的高度场／整机碰撞查询约束，无 DOM、Three.js、计时器、航次时钟或个人存储 |
| narration-cues.mjs | `compileNarrationCues({text,duration,cues,timing?})` → 冻结计划；`getNarrationCue(plan,seconds)` 查询当前提示 | 第九个核心；精确语句锚点和媒体时间查询，无播放器、渲染、主题规则或计时器依赖 |

## 接入

```js
import {createExplorer} from './core/temporal-core.mjs';
import {createEntityIndex} from './core/entity-index.mjs';
import {interpolateTrack} from './core/track.mjs';
const explorer = createExplorer(dataset);
const index = createEntityIndex(dataset.entities);
const unsubscribe = explorer.subscribe(view => {
  render(view, interpolateTrack(dataset.frames, view.state.time));
});
render(explorer.getView(), interpolateTrack(dataset.frames, dataset.min));
const entity = index.resolve('某个别名');
// 业务层决定选该实体的哪个事件，再发 SELECT_EVENT。
// 退出时：unsubscribe(); explorer.destroy();
```

深海地形、镜头控制、科普内容、样本收集、报告与备用电量的含义都留在业务层。模块不会默认理解这些概念。`src/check-core.mjs` 同时检查两条实际航次、课程数据与仓库轨迹，不靠相似主题的截图代替复用证据。

来源：时序核心来自本工作区 015 项目的独立提炼实现；其他八个模块在 017 新写。参考江山时序的技术思想，但这些文件不从原库控制器提取。源库没有本工程的自由驾驶、海洋三维提示和语句提示模块。新增与复用代码均为 GPL-3.0-only。

## 随语句递进的提示 · narration-cues.mjs

这个第九个核心把精确语句引用编译为媒体时间区间，再按传入秒数查询当前提示。它不播放音频、不运行时钟，也不解释 `kind`、`targetIds` 或移动场景。以下非海洋例子与测试夹具使用相同契约：

```js
import {compileNarrationCues,getNarrationCue} from './core/narration-cues.mjs';

const plan = compileNarrationCues({
  text:'Inspect rack A. Check aisle B.',
  duration:8,
  cues:[
    {id:'rack',quote:'rack A',kind:'inspection',targetIds:['rack-a']},
    {id:'aisle',quote:'aisle B',kind:'navigation',targetIds:['aisle-b']}
  ]
});
// 未提供 timing 时只使用文字与标点估时；这里没有声学对齐。
const selected = getNarrationCue(plan,3);
// 界面读取 selected?.cue；暂停时保留同一媒体秒数，seek后再次查询。
```

每项 cue 必须有唯一 `id` 和在原文中精确出现一次的 `quote`，按原文顺序排列且不能重叠。其他有限 JSON 元数据会复制并深冻结，主题目标的存在性由适配层验证。`timing` 可提供与全文、音轨时长匹配的锚点；offset 是 JavaScript UTF-16 文本偏移，必须与 seconds 一起严格递增，并覆盖片头和片尾。锚点之间按文字及标点权重插值。

`getNarrationCue(plan,seconds)` 返回 cue、序号、区间、区间进度等冻结数据；在第一条提示之前返回 null。它只接受本模块编译出的计划和 0～音轨时长的有限秒数，不接受反序列化对象冒充计划。同一媒体时刻得到同一提示，因此暂停与反向 seek 无需维护独立动画时钟。

本项目的12段环境音轨共用55个精确引用。`src/build-environment-cue-timing.mjs` 离线分析未改动的 MP3，将122处实测停顿与标点启发式匹配，再估算段内时刻；这不是逐词强制对齐，没有逐词误差保证。`--dry-run` 只分析，默认执行会更新 `../data/environment-cue-timing.mjs`，不联网、不改音轨或调用语音生成。

`../environment-guide.js` 用原语音播放位置驱动查询，并把 cue 交给场景。`../rendering/environment-cues.mjs` 和 `cue-labels.mjs` 使用真实相机投影、`viewOffset` 与避开UI的画面区域，选择可见地形、水体和实体；岩壁显示贴合法向的金圈与局部面高亮，水流显示短流线，海洋雪显示下沉颗粒。海洋内容保存在 `../data/environment-cue-tracks.mjs`。视觉提示可单独关闭；本段提示按钮只定位语音时刻并暂停，旁白和切段不自动接管主镜头、不选择航次事件或写报告。

用户主动点击“看清当前对象”才请求场景对准，随后可“回到我的镜头”；驾驶输入恢复原镜头，手动拖动转为独立观察。远处或被遮挡的生物由 `cue-lens.mjs` 在独立三维观察窗中展示同站原有几何，原实体和潜器保持原位，主镜头继续由用户控制。它不是把生物复制进当前驾驶海床。`environment-location.mjs` 仍仅为当前主题的位置说明辅助，不计入九个通用核心。

场景适配器暴露 `getEnvironmentCueStatus()`，返回当前提示、目标可见性、临时对准／可恢复状态和观察窗状态。界面通过 `onFocus`、`onRestoreView`、`getCueStatus` 请求主动操作与读取结果；渲染布局与镜头安全由场景处理，不进入语句核心。`computeCueLayout({width,height,occupied})` 返回最多六个互不重叠的像素 `rects`、归一化 `regions` 与 `focus`；occupied 是相对场景的UI矩形并会外扩8像素。全遮挡时 `valid:false`，中央备用构图不会冒充无遮挡区域。

换主题可复用布局扣除、独立观察窗与状态反馈接口，再接入该主题的实体根节点、相机／投影、地形、标注和安全规则。`cue-layout.mjs` 虽是纯计算，仍是渲染适配工具；`cue-lens.mjs` 依赖 Three.js、DOM 和实际几何，均不增加九个纯核心的数量。

验证命令：`node projects/017-abyss-expedition/src/check-narration-cues.mjs`。包括精确锚点、非法／重叠输入、冻结计划、暂停／seek查询、停顿匹配及仓库检查流程夹具。当前浏览器与几何覆盖见[画面提示验收](../../notes/verification-environment-cues.md)，不由纯测试推断所有效果已通过。

布局与观察窗分别运行 `node projects/017-abyss-expedition/src/check-cue-layout.mjs`、`node projects/017-abyss-expedition/src/check-cue-lens.mjs`。当前可见性、主动对准和自由操控的实际覆盖见[可见提示验收](../../notes/verification-visible-cues.md)；这些几何／生命周期检查不代替浏览器重播。

## 自由驾驶核心 · pilot-core.mjs

输入自身方向上的 `forward`、`strafe`、`lift`、`turn` 四个轴，输出世界坐标与冻结快照。朝向使用弧度，零朝向为 -Z，正转向和正横移分别为右转、右移。核心处理加减速、横向输入归一化、边界、顶部高度与碰撞回调约束；不读取键盘、不解释模型几何、不移动 Three.js 对象，也不推进航次分钟。以下最小例子只有中心高度保护，整机与道具保护还需接入后面的三个选项。

```js
import {createPilotController} from './core/pilot-core.mjs';

// 必须与渲染场景使用同一个高度场和坐标单位。
const heightAt = (x,z) => Math.sin(x/80)*4 + Math.cos(z/90)*3;
const pilot = createPilotController({
  bounds:{minX:-580,maxX:580,minZ:-580,maxZ:580},
  minClearance:18,
  ceiling:414,
  heightAt,
  startPose:{position:{x:0,y:heightAt(0,0)+30,z:0},heading:0}
});
pilot.setInput({forward:1,strafe:0,lift:0,turn:0});
const state = pilot.step(1/60); // 由调用方提供秒数，在自己的帧循环中重复调用。
// 渲染适配器读取 state.position、state.heading；不写回预定航迹。
pilot.clearInput(); // 立即停止；普通松键 setInput({}) 则按减速度停下。
pilot.destroy();
```

| 接口 | 契约 |
| --- | --- |
| `getState()` | 冻结的 position、heading、velocity、speed、verticalSpeed、turnSpeed、clearance、minimumY、bodyClearance、poseCorrected、correction、blocked 与 enabled |
| `setInput(input)` | 替换四轴输入，遗漏轴归零，有限输入钳制至 -1～1 |
| `step(deltaSeconds)` | 以固定 240Hz 子步推进；默认最多消费 0.1 秒，防止后台大时间差追赶 |
| `clearInput()` / `setEnabled(false)` | 清空输入、速度和子步余量，立即停止 |
| `setPose(pose)` / `reset(pose?)` | 校正边界、地形与顶限并清空运动，返回校正标志；未解决的固体穿插或无法满足顶限时原子拒绝。默认 reset 回初始位姿 |
| `destroy()` | 停止并拒绝后续写入，重复销毁安全 |

`heightAt(x,z)` 必须返回有限高度，并与渲染地形使用相同坐标和单位。默认扫掠间隔 `sweepSpacing` 为 0.5 模型单位。缓坡允许有限离底修正，陡壁缩短水平运动，需要主动上升或移开；核心没有水动力、物体编辑或真实遥控设备控制。

| 可选碰撞配置 | 单体查询契约 |
| --- | --- |
| `terrainEnvelope({x,z,heading})` | 返回该朝向下整机最低安全中心 Y，必须为有限数；由适配器计算机身、机械臂和安全余量。核心取它与 `heightAt(x,z)+minClearance` 的较大值 |
| `isPoseBlocked({position:{x,y,z},heading})` | 返回是否与固体道具相交的布尔值；可只检查固体，避免重复地形查询。参数冻结，回调不得修改 |
| `bodyRadius` | 整机水平包络圆半径，默认 0；从四侧收缩 XZ 原点边界，保证所有朝向都留在范围内。它自身不替代整机地形或固体查询 |

带任一整机配置时，每个 240Hz 子步分开扫掠合法升降、转向与平移；转向按角度及半径产生的弧长细分，中途姿态同样查询。转角被挡仍可执行合法升降或平移，屋顶阻挡上升时仍可侧移脱困。回调须在扫掠分辨率下可靠描述障碍；未配置这些选项时保留原中心高度场行为。

`blocked.terrain / bounds / ceiling` 分别表示地形、边界和顶限阻挡；`blocked.obstacle` 表示固体道具，`blocked.rotation` 表示转向被截断，可与前述原因同时出现。`clearance` 是原点至中心下方高度场的差值；`minimumY` 是当前查询得到的最低安全中心 Y，`bodyClearance` 为原点相对该安全面的余量。`ceiling` 限制原点 Y，适配器应按机体顶部预留空间。

`poseCorrected` 和冻结的 `correction:{bounds,terrain,ceiling}` 记录最近一次 `setPose` 的校正，启用驾驶不会抹去它；成功恢复会清零速度和输入。回调返回非法值、未解决的固体穿插或不可满足的净空会拒绝操作，保留原有效状态及积分余量。业务层可先做附近推离与安全回退，避免旧贴壁链接仅靠升高越过整面高墙。

### 与场景碰撞适配器连接

```js
import {createPilotController} from './core/pilot-core.mjs';
import {createCollisionWorld} from './rendering/collision-world.mjs';
import {
  ROV_COLLISION_PROFILE,ROV_BODY_RADIUS,snapshotSolidColliders
} from './rendering/collision-assets.mjs';

// heightAt、propsGroup 和 startPose 由调用场景提供。
// 网格参数是本项目地形约定；换地形时必须匹配实际三角网格。
const world = createCollisionWorld({
  heightAt,terrainCell:4.125,terrainOrigin:{x:-660,z:-660},
  bounds:{minX:-660,maxX:660,minZ:-660,maxZ:660},
  colliders:snapshotSolidColliders(propsGroup),ceiling:414,margin:.8
});
const pilot = createPilotController({
  heightAt,minClearance:18,ceiling:414,startPose,
  bodyRadius:ROV_BODY_RADIUS,
  terrainEnvelope:({x,z,heading})=>world.minimumYAt(x,z,heading,ROV_COLLISION_PROFILE),
  isPoseBlocked:pose=>world.isBlockedBySolids(pose,ROV_COLLISION_PROFILE)
});
// 可先 world.resolveRestoredPose(urlPose, profile, {fallbackPose:lastSafePose})，
// 检查 valid，再仅把 {position,heading} 交给 pilot.setPose。
```

`collision-world.mjs` 对保守的整机定向包围盒（OBB）提供地形最低高度、固体相交、扫掠、恢复与相机范围查询；规则格点、三角形对角线及可选外围地形三角形必须与场景相符。`collision-assets.mjs` 依赖 Three.js，逐 mesh 和逐 InstancedMesh 实例提取世界轴对齐包围盒（AABB），保留透明实体，排除不可见祖先、标注环及显式关闭碰撞的子树。二者属于几何适配资产，不增加九个通用纯核心的数量。

当前 ROV profile 已包含 `.85` 世界比例、机械臂全状态、瓶盖开闭与小幅横滚；无需再次乘场景比例。换模型或题材时需重新标定整机 profile、边距和固体快照；静态对象变换后也需更新快照。这是保守 OBB 对地形与逐 mesh／instance AABB 的保护，复杂网格内部空隙可能被包围盒封住，不是精确网格刚体碰撞或任意洞穴引擎。

合并渲染的 mesh 可用 `userData.collisionBoxes=[{min,max},…]` 显式提供独立局部包围盒，替代整批几何的大盒；实例网格会逐实例展开这些盒。管虫群按每条硬管的实际顶点保留独立盒与嘴缘实例，软冠关闭硬碰撞，避免把群落之间的水体封成假墙。

`encodePilotPose` / `decodePilotPose` 为 URL 的 `pose=v1:x,y,z,heading` 提供编解码，位置量化为 0.1，角度为 0.001 弧度；分享范围为 x/z ±580、y -600～430。URL 的 `pilot=chase|cockpit|orbit` 属于业务层，恢复时零输入、零速度。非前向视角可附带原相机协议的 `cam`，不把驾驶模式塞入其三种 mode；场景还需再次校验海床、顶部和可见性约束。

`../pilot-ui.js` 负责 W/S 前后、A/D 转向、Q/E 横移、R/F 升降、空格急停、1/2/3 视角和屏幕长按。`scene.js` 负责潜器、跟随／前向／独立相机及高度场。进入驾驶时业务层停止导演音频与航次回放，隐藏原遥测；附近站仅只读查看，不写个人报告。驾驶中换航次保留手动模式和视角类型；退出恢复航次观察。菜单、弹窗、失焦和页面隐藏会清空操纵。

验证：`node projects/017-abyss-expedition/src/check-pilot.mjs` 检查运动、整机回调、转向扫掠与原子拒绝；`node projects/017-abyss-expedition/src/check-collision-world.mjs` 检查场景碰撞查询；`node projects/017-abyss-expedition/src/check-collision-assets.mjs` 检查实例世界变换与实际 ROV 包络。两种场景高度场检查仍为 `node projects/017-abyss-expedition/src/check-terrain.mjs`。实际驾驶、触摸、镜头、分享恢复与模式切换的历史覆盖见 [驾驶验收](../../notes/verification-piloting.md)，这些核心和几何检查不等于本轮浏览器或全片重放验收。

## 导演播放核心 · director-core.mjs

导演时钟与航次时序分开：输入镜头清单中的 `duration` 是影片秒数，镜头 `eventId` 再由业务层选择对应的航次分钟。本作品两条短片分别为十一镜头，配音版按实际音轨派生为热液 311.2 秒（5:11.2）和峡谷 298.5 秒（4:58.5），核心本身不规定镜头数、题材或景别名称。它复制并冻结镜头数据，提供 `enter/exit`、`play/pause`、`next/previous`、`seek/seekShot`、`tick`、订阅和完成状态；具体契约见 [导演核心指南](director-README.md)。

浏览器适配层 `../director-ui.js` 用动画帧调度核心，并把当前镜头与进度交给场景，同时管理字幕、章节、景别/速度控件、后台暂停和退出。`../rendering/shot-camera.mjs` 是纯机位规划函数，仍按当前现场的坐标尺度安排镜头；`expedition-context.mjs` 是依赖 Three.js 的母船、水柱与设备组件，不计入九个通用核心。

URL 属于业务层：导演状态用 `film=shotId` 保存章节，打开后暂停在本章起点，不存片内秒数、自由 `cam` 或临时景别。`context=0/1` 保存普通探索的语义标注勾选，导演期间启用标注、退出恢复勾选。导演取水仅保留临时演示记录，不自动写入个人报告。当前提供 MiniMax 预生成语音与字幕；音频适配器以实际播放位置推进时钟，并用已缓冲的本地对象 URL 支持精确定位，避免静态开发服务器缺少 HTTP Range 导致音频回到开头。没有视频导出。核心验证命令为 `node projects/017-abyss-expedition/src/check-director.mjs`；设备与原理实际覆盖见项目 `notes/verification-equipment.md`，此前 `notes/verification-learning.md` 和导演记录保留原范围。

## 临时学习会话 · learning-core.mjs

`createSamplingSession({id,sites:{near:{id,label,kind},far:{id,label,kind}}})` 接收两个不同站位；`kind` 默认 `water`，新主题可使用明确的其他样本类别。返回 `getState()`、`collect('near'|'far')`、`reset()`、`subscribe(listener)` 与 `destroy()`。快照和记录冻结；同站重复收集与空会话重复重置不重复通知，销毁后拒绝写入。模块不保存全局状态、浏览器存储或个人报告。

状态中的 `comparisonUnlocked` 只有近、远样本均存在且 `kind` 相同才成立。这只是流程门槛，不证明取样规范、成分差异或因果关系。当前作品统一为 A／B 水样；位置、深度、时刻与编号由主题内容和业务适配提供，成分仍待分析。

`../learning-ui.js` 连接按钮、取样瓶关闭动画和会话；动画实际完成后才提交样本。它还连接概念词典、按片内进度自动展开的原理步骤、暂停后手动选步，以及结尾“已知原理 / 本轮记录 / 待分析”。`../data/learning-content.mjs` 保存主题内容，`../rendering/learning-world.mjs` 提供三维解释。重播清空本次演示记录；这些临时记录不自动写入普通探索的个人报告。

验证命令：`node projects/017-abyss-expedition/src/check-learning.mjs` 与 `node projects/017-abyss-expedition/src/check-learning-content.mjs`。分别检查会话行为与章节／概念／站位契约；实际采水按钮、原理动画和音画衔接由浏览器验收。

## 相机状态协议 · camera-state.mjs

这个新增模块保存实际位置、观察目标与相机模式，供手动旋转、平移、缩放后的视角分享使用。它不依赖 DOM、Three.js 或海底数据，也不自行操作 URL 或相机。

```js
import {
  validateCameraState, encodeCameraState, decodeCameraState, isSameCameraState
} from './core/camera-state.mjs';

const state = {
  position: [485, 400, 535],
  target: [0, -30, 0],
  mode: 'overview'
};
validateCameraState(state); // true；无效时抛 TypeError
const params = new URLSearchParams();
params.set('cam', encodeCameraState(state)); // 让 URLSearchParams 负责转义
const restored = decodeCameraState(params.get('cam'));
// 渲染适配层在验证全部成功后，一次应用 restored 的模式、位置与目标。
// if (!previous || !isSameCameraState(previous, state)) { ... }
```

| API | 输入与输出 | 严格约定 |
| --- | --- | --- |
| `validateCameraState(state)` | 合法返回 `true`，否则抛 `TypeError` | 普通对象恰好包含 position、target、mode；不修改输入 |
| `encodeCameraState(state)` | 返回一个 URL 参数的原始值 | 协议为 `v1:mode:px,py,pz:tx,ty,tz`；坐标量化到 0.1，规范化负零；不修改输入 |
| `decodeCameraState(raw)` | 返回独立、深冻结的状态对象 | 只接受 v1 与规定字段数量；拒绝未知版本、重复片段、空字段、额外坐标及非规范数字 |
| `isSameCameraState(a,b,tolerance=.15)` | 返回布尔值 | 两边均需合法；模式相同且每个坐标差不超过容差。容差为非负有限数，null 不是有效初始状态 |

位置与目标必须为密集的三个有限数值数组，每轴绝对值不超过 5000；两者距离须在 10–2500 之间。模式仅支持 `overview`、`follow`、`top`。相同轴值如 `[0,0,100]` 合法；重复字段、重复结构片段、嵌套数组、稀疏数组和额外属性不合法。

解码坐标使用至多一位小数的十进制文本，不接受科学计数法、正号、前导零、NaN、Infinity 或空白。编码会再次校验量化结果：极贴近距离边界的输入，如果量化后超界，会整体抛错，不生成不可恢复的链接。调用层应保留旧有效状态并给出反馈，不能边解码边修改相机。

该协议保存观察位姿，不保存投影类型、镜头焦距、控件惯性、过渡动画或场景单位。新渲染器须约定相同坐标系、单位与三种模式的含义；其他尺度需先做适配，不能直接把任意世界坐标塞入协议。

当前 `scene.js` 在通用协议之外施加海底安全条件：距离 48–1040，普通探索的相机极角约 0.12–1.16 弧度（相机相对目标的位置从竖直向上方向计），以及目标范围、海床净空和地形视线保护；俯视模式另有近垂直约束。只有安全位姿会按 0.1 量化恢复。旧贴地、山后或边界外镜头会回到合适观察位并由业务页面提示，不保证逐坐标复现不安全旧镜头。距离 10–2500 的协议测试保持不变；协议合法不等于在目标场景中构图安全。

验证：`node projects/017-abyss-expedition/src/check-camera-state.mjs`。覆盖三种模式往返、量化、输入不可变、恶意字段与向量形状、非法数值、版本／片段校验、非法恢复保持旧状态、返回值深冻结与比较容差。这里的编解码测试不替代浏览器中实际相机恢复验收。

## 主题视觉适配层

九个通用核心之外，`rendering/` 保存主题几何与机位适配。几何组件依赖 Three.js；纯机位函数虽然不依赖渲染库，也保留当前现场的坐标、尺度与构图约定，不自动成为适用于所有题材的通用核心。

| 模块 | 接入参数与输出 | 适用边界 |
| --- | --- | --- |
| `rendering/hydrothermal-plume.mjs` | `createHydrothermalPlume({origin,height,texture,random,primary})` → `{object,update(elapsed)}` | `origin` 是局部 x/z，height 是喷口高度；调用方提供纹理、随机源，设置组变换并按秒更新时间。粒子数由 primary 选择，不是流体仿真 |
| `rendering/benthic-life.mjs` | `createVentLife({random,count,groundHeight})`、`createSpongeColony({random,count,groundHeight})` → Three.js Group | 调用方提供可复现随机源、数量和局部 x/z 对应落地高度；管虫与海绵几何规则已经实现，新物种需扩展规则 |
| `rendering/shot-camera.mjs` | `planExpeditionShot({framing,progress,subject,vehicle,surface,aspect,isVent})` → `{position,target,fov}` | 纯机位规划；没有 DOM、时钟或 Three.js 状态，仍按本场景尺度安排六种镜头，安全与实际应用交给场景 |
| `rendering/learning-world.mjs` | 原理类型、步骤与采样进度 → 解释性三维对象 | 依赖 Three.js；热液剖面、沉积、食物关系、栖地、对照和总结的视觉表达，不是科学计算模型 |
| `rendering/environment-cues.mjs` / `cue-labels.mjs` | cue元数据、媒体秒数、观察位置、投影与可用区域 → 高亮、动画和方向标记 | 主题视觉适配；实体保持原位，流线与海洋雪标示意，旁白不自动接管驾驶、主镜头或报告 |
| `rendering/cue-layout.mjs` | `computeCueLayout({width,height,occupied})` → 像素矩形、归一化区域与主构图 | 纯渲染布局计算，扣除外扩的UI占用；全遮挡明确返回 `valid:false`，不计为新增纯核心 |
| `rendering/cue-lens.mjs` | 场景实体、原几何、地形与可用视口 → 独立三维观察窗 | Three.js／DOM适配；复制同站原几何作近景，保留原位实体，不移动潜器或主镜头；共享资源归场景所有 |
| `rendering/collision-world.mjs` / `collision-assets.mjs` | 整机 profile、同源地形与逐 mesh／instance 固体 AABB → 净空、相交、扫掠和恢复查询 | 保守几何适配；assets 依赖 Three.js，world 依赖匹配的地形网格约定，不计为新增纯核心，不是精确网格刚体 |
| `rendering/expedition-context.mjs` | 母船、水柱、海床环境与采样设备的创建函数 | 依赖 Three.js；解释科考现场的上下和任务关系，水柱压缩示意，不是实测场景或真实工程设备 |

实体 `appearance: 'tube-worms'` 或 `'sponges'` 在场景适配器中选择相应群落。`../terrain.js` 的热液低脊裂隙与峡谷高壁曲槽采用不同三维几何，并将同一高度场提供给驾驶核心。可把这些视觉模块与地形、照明组合，但不能只替换任意主题 JSON 就获得完整作品；坐标尺度、对象外观、镜头和业务语义仍需设计。无深链接入口和普通探索切航次会停在导演开场，驾驶中切航次保留手动模式；明确的时间、事件、相机、章节或驾驶链接继续恢复，逐站导览仍从起点；抽屉、叙事提示、小航线图和沉浸模式属于 `app.js` 的体验层。

当前可见提示实际覆盖见 [verification-visible-cues.md](../../notes/verification-visible-cues.md)，此前语句提示见 [verification-environment-cues.md](../../notes/verification-environment-cues.md)。此前[环境导览](../../notes/verification-environment-guide.md)、[驾驶](../../notes/verification-piloting.md)、[设备](../../notes/verification-equipment.md)、[学习](../../notes/verification-learning.md)和 [导演](../../notes/verification-director.md)验收保留原测试范围，画面对照见 [quality-comparison.md](../../notes/quality-comparison.md)。通用协议、主题适配器和画面验收须分别检查，不将视口检查说成实物手机测试，也不由旧记录推断全片已经重放通过。

