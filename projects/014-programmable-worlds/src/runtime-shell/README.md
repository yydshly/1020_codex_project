# Na Pali 本地原生运行器

此运行器为当前子项目提供独立的 ANGLE 图形后端。不更改 Codex 内置浏览器、现有 Chrome 用户配置、Windows 图形设置或任何既有应用。原作页内实时展示由专用隐藏 OpenGL 进程计算，通过本机 WebRTC 把实际画布送入普通浏览器的 `<video>`；页面操作驱动同一原作场景。

## 来源与范围

- 官方 npm 包：`electron@45.0.0`，仓库 `https://github.com/electron/electron`。
- 普通入口：`http://127.0.0.1:8796/projects/014-programmable-worlds/web/index.html`。原作内嵌 `runtime/source-live.html`，本地服务 `127.0.0.1:8797` 只管理一个专用原作渲染器。页内实时流与新运河的画质目标分别验收。
- 渲染器保持 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、`webSecurity: true`。
- 不提供远程调试、不关闭安全检查、不注册协议、不读取其他浏览器配置或凭据。
- 独立研究页目录：仓库根 `.cache/napali-electron-hub-profile`，使用独立应用名和单实例锁；保留旧源场景运行器的 `.cache/napali-electron-profile`，不激活旧窗口，也不迁移或删除其缓存。

## 准备

在本目录执行：

```powershell
npm install --save-dev --save-exact electron@45.0.0
node node_modules/electron/install.js
node prepare-shell.cjs
```

Electron 45 的 npm 包不再通过 postinstall 自动下载二进制；第二条命令执行其官方安装器，并依据包内 checksums 校验官方运行时。准备脚本只把本目录应用入口与配置放入本目录自己安装的 Electron `dist/resources/app`，不修改 Electron 官方二进制，也不复制另一套大型运行时。

日常从项目根 `Start-Project.ps1` 启动。在工作区根运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\projects\014-programmable-worlds\Start-Project.ps1
```

脚本准备本任务自己的运行入口，检查 `127.0.0.1:8796` 是否已经提供本项目；需要时用 Python 标准静态服务在后台启动，不提供额外 API。占用端口的其他服务会保留，并给出清楚错误。脚本仅在用户执行时打开正常研究页；不会继承隐藏 QA 参数，不结束既有应用。自行启动的静态服务日志位于工作区 `.cache/napali-static-server`。

如果静态服务和原作实时桥接服务都已经运行，也可直接打开以下可执行文件，无需附加命令行参数；日常优先使用上面的 `Start-Project.ps1`，它会准备这两个服务：

```text
node_modules/electron/dist/electron.exe
```

研究页按当前可见面积选择一个实时作品。切到其他作品时销毁旧 WebGL 上下文并卸载 iframe，确认旧页面卸载后才载入下一个；切回原作品会重新生成场景，源库可能重新编译。滚动到说明文字、最小化或切走应用，仅挂起当前的单个场景，回来后继续，避免普通焦点变化触发重新编译。站内的独立体验链接在当前运行器中打开；实际点击 GitHub/X 来源链接才交给默认浏览器。外部地址仅允许这两个 HTTPS 主机，没有页面可用的 Node 或任意打开应用接口。

运行器通过隔离 preload 仅暴露固定的 `worldsHost` 数据（`backend`、`localRenderer:true`），后端来自主进程的白名单参数；不以 Electron 用户代理判断已验证环境。研究页在普通浏览器内也直接内嵌完整原作的视频与控制。`source-live.html` 接收后台原作画布的本机实时 WebRTC 流，页面本身没有原作 WebGL canvas、截图或录像替代。鼠标、键盘、时间和画质操作驱动同一个后台原作渲染器。

原作后台默认采用已实际通过的 GPU offscreen 渲染：窗口始终 `show:false`、`focusable:false`、`skipTaskbar:true`，`webContents.setFrameRate(30)` 设定调度上限，实际吞吐由原作渲染耗时决定。`canvas.captureStream(30)` 捕获原作真正的最终画布呈现，不读取桌面。`NAPALI_SOURCE_OFFSCREEN=0` 仅保留为受控回退实验；正常启动不需要此环境变量。实现依据 [Electron 官方 offscreen rendering 文档](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)。

## 图形后端

`renderer-config.json` 当前选择已通过完整隐藏功能验收的 `gl`，新配置也默认 `gl`。本机日志确认 RTX 4070 Laptop 的 ANGLE OpenGL 硬件上下文；具体吞吐仍取决于原始复杂着色器及机位。Vulkan 未通过本机上下文启动。直接把原作巨大着色器交给 D3D11 编译未通过此前验证；普通 D3D11 客户端接收实时视频、控制原作与页内生命周期已经通过本次 15 项检查。运行器显式设置 `use-gl=angle` 与所选 `use-angle` 后端。这些仅作用于本应用，不更改系统或其他应用配置，也不关闭看门狗、沙箱或安全检查。

配置与运行目录都只属于本任务。依赖重装后需要再次执行准备脚本。

## 验证

源代码语法可通过 `node --check main.cjs` 与 `node --check prepare-shell.cjs` 检查。真正的后端、着色器编译和场景运行效果仍需启动应用后实际查看；准备完成不等于运行成功。

运行器将自身 PID、页面加载、源场景控制台消息、活动 GPU、图形进程及退出诊断写入 `.cache/napali-electron-hub-profile/diagnostics.jsonl`，不记录用户输入或浏览历史。

## 后台实际验收

用户要求继续工作但不要影响桌面操作时，使用独立的隐藏验收模式：

```powershell
node prepare-shell.cjs
node launch-qa.cjs
```

该入口同时设置 `NAPALI_QA=1` 和 `--qa`。窗口固定为 `show:false`、`skipTaskbar:true`、`focusable:false`，关闭后台及遮挡窗口限速，并显式调用自身 `setBackgroundThrottling(false)`；不调用显示、恢复、激活或桌面输入。截图使用自己隐藏窗口的 `capturePage`，明确保持 `stayHidden:true`；额外导出 WebGL canvas 的实际 PNG，按中心区域采样计算画面变化。它不是桌面截图，也不操作其他浏览器或应用。

验收过程使用本应用自己的 `napaliControl` 与 `napaliDrive` 接口：等待完整地形与着色器初始化及真正完成的 GPU 帧，检查播放时间与像素变化、暂停时间稳定性、35/75/128 秒机位、自由驾驶、恢复与挂起。暂停允许原始后处理的逐帧颗粒和抖动，播放变化需超过实测静止噪声；挂起先等待已有 GPU 帧完成后再判断是否稳定。

沙箱、上下文隔离、安全检查保持开启，页面没有 Node 访问能力。测试只在固定的 `127.0.0.1:8796` 本项目地址运行。隐藏模式使用单独的 `.cache/napali-electron-qa-profile`，不会唤醒普通运行器的单实例或读取它的缓存。

输出：

- `.cache/napali-qa-status.json`：当前阶段与实际状态，供后台轮询。
- `notes/runtime-acceptance.json`：本次完整验收结果。
- `notes/runtime-acceptance.baseline.json`：首次保留的已通过基线；失败的复测不会覆盖它。
- `notes/runtime-acceptance.latest.json`：最近一次结果，包括失败或部分通过的复测。
- `assets/runtime-qa/<运行时间>/`：真实 canvas PNG、含控制界面的隐藏页面 PNG 与该轮结果副本。
- `.cache/napali-electron-qa-profile/diagnostics.jsonl`：该隐藏实例的源场景日志与 GPU 进程情况。

默认初始化等待 10 分钟；可通过 `NAPALI_QA_TIMEOUT_MS` 调整到 2–30 分钟。结果为 `passed` 才表示该轮全部功能检查通过；`partial` 或 `failed` 不能当作成功。程序退出只销毁自身隐藏窗口，不结束其他应用。

源场景挂起后还采集八次空闲 `requestAnimationFrame` 回调，记录间隔中位数和最大值，确认隐藏窗口的合成器调度是否限速。此阶段不提交源场景 GPU 帧；该诊断不把空闲回调频率当作渲染 FPS。

仅 QA 模式接受 `NAPALI_QA_BACKEND=gl|d3d11|vulkan`。普通运行器始终使用配置文件。D3D11 和 Vulkan 各用独立的 `.cache/napali-electron-qa-profile-<后端>` 及单实例锁，保留原有 OpenGL QA 配置和缓存。每个场景按后端保存报告，例如 `notes/runtime-acceptance.gl.json`、`notes/runtime-acceptance.d3d11.json`，以及各自的 `.latest.json` 和已通过 `.baseline.json`；实验后端不会覆盖 OpenGL 的验收。原有不带后端的报告路径继续指向 OpenGL 结果。

`NAPALI_QA_COMPILE_ONLY=1` 仅用于源场景，为页面附加 `compileonly=1`，要求页面在四个渲染程序编译完成后立即停止。隐藏验收等待 `napaliDiagnostics.phase === 'renderer-programs-ready'`，上限 20 分钟；不进入地形、海面或画面渲染。结果独立保存为 `notes/source-compile-<后端>.json`、`.latest.json` 和 `notes/compile-runs/<运行时间>-<后端>.json`，进度是 `.cache/napali-compile-qa-status-<后端>.json`。编译通过只证明该后端可以编译源渲染程序，不代表完整实时效果已经验收。

`NAPALI_QA_SCENE=source|source-live|canal-real|window|story|hub` 只允许选择本项目的固定页面，默认仍是 source。`source-live` 使用普通 D3D11 客户端检查实际视频解码与原作控制；`canal-real` 捕获新的运河基准，运行通过不代表画质通过。旧窗景与故事的 `worldAcceptance` 记录仍保留作功能历史。

当前原作页内入口应运行：

```powershell
node prepare-shell.cjs
node launch-source-bridge.cjs
$env:NAPALI_QA_SCENE = 'source-live'
$env:NAPALI_QA_BACKEND = 'd3d11'
node launch-qa.cjs
```

此验收导出真实接收视频帧与自身隐藏页面 PNG，检查 35/75/128 秒机位、暂停、实际相机移动、内部渲染分辨率 100%→50%→100%、重新起飞、生成期间的嵌入可见性变化、研究页内实际解码与切换作品前释放原作。原作的画质设置改变内部 framebuffer，再呈现进固定尺寸画布，因此视频轨道尺寸保持完整；不能用视频尺寸是否减半判断画质设置是否生效。结果为 `notes/source-live-acceptance.d3d11.json`，图像在 `assets/source-live-qa/<运行时间>/`。本轮 15 项通过，详情见 `notes/source-inpage-realtime-current.md`。

另有独立的 `NAPALI_QA_SCENE=calibration` 光照校准模式，仍只打开自身隐藏的窗景页面。它在固定的暂停时间、湿润天气和黄昏氛围下，每次完整重置六项光照参数，采集 theory、低曝光、去天空漫反射、去反弹、去实用灯及 balanced/restrained/moody 共八组窗边画面，再采集 balanced 的细节与河岸机位。校准通过仅表示参数与真实帧已保存；画面判断另行完成。结果为 `notes/calibration-acceptance.<后端>.json`，图像位于 `assets/quality-qa/calibration/<运行时间>/`，不会覆盖窗景或故事的功能验收。

`NAPALI_QA_SCENE=look` 则独立比较显示变换：固定 balanced 的六项光照参数、暂停时间、天气和相机，分别采集 three/曝光1.55、source/曝光1.55、source/曝光2.0，在窗边、细节、河岸三个机位共九组真实帧。它检查实际显示模式、曝光及相机一致性，像素差异只作为对照，不代表艺术质量通过。结果为 `notes/look-acceptance.<后端>.json`，图像位于 `assets/quality-qa/look/<运行时间>/`；其他验收基线保持独立。

例如仅运行故事验收：

```powershell
$env:NAPALI_QA_SCENE = 'story'
node launch-qa.cjs
```

两个作品分别输出 `notes/window-acceptance.json`、`notes/story-acceptance.json` 及 `.latest.json`，保留已通过基线；图像放在 `assets/quality-qa/window|story/<运行时间>/`。源库还记录上游/运行副本 SHA-256 和至少八个完成帧的计时样本。所有数值通过只表示运行与功能通过，**不等于作品画质已经达到源库**；艺术质量需对照真实截图另外验收。

`NAPALI_QA_SCENE=hub` 及 `assets/hub-qa/` 保留了旧版直接嵌入原作 canvas 的历史验收。其 17 个 CINE 关键时刻等源作功能记录仍有效，但该 harness 依赖 canvas，不能代表目前视频嵌入入口的验收。当前研究页内原作与释放顺序由上面的 `source-live` 检查；新运河另行运行 `canal-real`，功能通过和画质达标分别记录。
