# Na Pali 场景复用模板

直接继承 [Leon Lin 的 Na Pali](https://github.com/Leonxlnx/napali/tree/4afb7c3a1aad3d0203193100305c46607134d0f5) 的完整代码，通过配置改场景和镜头。这里保留了真实算法和可运行入口，下次不需要先让模型重新写一个渲染器。

固定上游：`4afb7c3a1aad3d0203193100305c46607134d0f5`，MIT。作者 README 记载由 Claude Code 辅助开发。模板还复用了第 014 项目已经验证的异步编译、GPU 分批调度、驾驶与生命周期适配；所有上游 GLSL 模板保持不变。

本次已通过 5 项构建契约与 5 项实际浏览器检查，包含真实基线帧和网页嵌入接口，记录见 [verification.json](verification.json)。运行验证使用 RTX 4070/OpenGL、640×480 视口和 50% 初始渲染比例；这不是全屏性能承诺。

## 直接使用

需要 Python 3.10+，启动与构建不需要安装 Python 包或 Node 包。浏览器需要 WebGL2 和可用 GPU。

在这个目录打开终端：

```powershell
python scene.py verify
python scene.py serve
```

手动打开 `http://127.0.0.1:8820/`，点击“启动完整场景”。打开启动页不会自动加载三维内容。停止按钮卸载场景；切走页面或移出视口会在完成当前工作后挂起逐帧渲染。已经开始的着色器编译/地貌生成不会被中途取消，停止按钮可以直接卸载。

初次编译和地貌生成较重，模板保留了原作的这个成本。50% 的初始渲染比例只降低每帧像素量，基线仍使用 4096 高度纹理、1024 侵蚀网格和 4000 次侵蚀。它不代表低性能设备能达到流畅帧率。

## 创建下一件作品

```powershell
python scene.py new --output C:\work\my-coast --name my-coast
cd C:\work\my-coast
python scene.py serve --config configs/scene.json
```

得到独立的完整工作副本，包含上游源代码、配置、构建器和验收工具。目录存在时不会覆盖。新对话直接打开该目录，附上 NEXT-CHAT.txt 的任务说明即可；AGENTS.md 会告诉后续模型如何保留基线和控制改动。

## 三层改动入口

| 层 | 文件/入口 | 已能直接复用的内容 | 需要检查什么 |
|---|---|---|---|
| 参数 | `configs/scene.json` 的 `params` | 山高、坡势、侵蚀、林密度、风浪、雾、太阳、曝光 | 地貌、生态和画面是否协调，性能是否仍满足用途 |
| 镜头 | `camera.keyframes` | 源库 PCHIP 插值、云台取景、视场角过渡、收尾逻辑 | 连续运动、穿山/树冠、近岸间距 |
| 几何 | `geometry` 指向的数据文件 | 源库基形、距离场、侵蚀和后续渲染链 | 新轮廓是否成立，原库局部修形是否需要适配 |

`configs/baseline.json` 是原作参数基线；`coast-light-study.json` 是同一海岸的光照/水面参数练习；`coast-camera-study.json` 展示独立镜头配置。后两者不是新的独立作品，也未宣称已经获得新题材的画质验收。

```powershell
python scene.py serve --config configs/coast-camera-study.json --port 8821
```

### 参数边界

可调的 18 个参数和范围定义在 `scene.py` 的 `BOUNDS`。未知参数、非有限数值、错误纹理尺寸与无效镜头时间会被拒绝。范围是本模板设置的工作边界，不是保证每个组合都好看的算法。

建议第一轮只改 3–5 个变量。`en/eiters/hres` 属于生成质量，降低后构建清单会标记 `worldQualityReduced: true`；不要把它与仅改变逐帧 `render.scale` 混为一谈。

**冻结 `camH/pitch/vfov`。** 在原库中它们还用于将图像空间海岸控制点反投影到世界坐标，改动会影响整个地貌。镜头配置使用 `camera.keyframes`：

```text
[时间秒, x, y, z, 看向x, 看向y, 看向z, 垂直视场角度]
```

时间从 0 严格递增。模板保留原作结束时的参考构图，因此最后一个 key 必须保持 `[结束时间, 0, 1000, 0, 0, 0, 839.1, 38]`。需要不同收尾方式时，再明确适配源库的 settle 逻辑。

### 新地貌

复制 `configs/geometry.original.json`，在场景配置中写 `"geometry": "my-geometry.json"`。支持 `COAST_IMG`、`VALLEYS_IMG`、`CLIFFS_IMG`、`MASSIF_IMG`、`BEACHES_IMG`、`SHELVES_IMG` 六组图像空间控制数据；字段含义见同目录的 geometry-guide.md。可只覆盖需要更改的数组。

原作包含针对这片海岸的局部修形、生态规则和水色调校。几何配置是接入新布局的入口，不是通用地貌生成器；漓江喀斯特、封闭泻湖等题材不能只靠改几项参数就保证成立。可以继承渲染链，再有针对性地替换地形与题材规则。

## 接入自己的网页

`python scene.py build --config configs/scene.json --output build` 生成可独立部署的静态目录，无需本地桥接服务。把该目录完整放到网站的 `my-scene/` 下，用户点击时再挂载：

```html
<button id="enter">进入场景</button>
<button id="leave">停止场景</button>
<div id="scene" style="height:75vh"></div>
<script type="module">
  import {mountScene} from './my-scene/embed.js';
  let scene;
  document.querySelector('#enter').onclick = () => {
    scene ??= mountScene(document.querySelector('#scene'), './my-scene/engine.html');
  };
  document.querySelector('#leave').onclick = () => { scene?.dispose(); scene = null; };
  // await scene.ready; scene.pause(true); scene.seek(35); scene.quality(0.75);
</script>
```

要求同源部署。源库和运行代码均已打包在生成目录里；能否渲染仍取决于访问者的 WebGL2、GPU 和驱动。这里不会把网页模板描述成旧项目云端实时渲染问题已经解决。

## 验证与留档

```powershell
python -m unittest discover -s tests -v
python scene.py build
```

`scene-build.json` 记录源库版本、文件哈希、配置哈希、几何/镜头改动与生成质量标记。构建时验证固定上游的全部 21 个文件，并比较全部 GLSL 模板，避免无意中把成熟效果换成简化实现。

实际浏览器验收复用源库自己的 `tools/cdp.mjs`，需要 Node 22+ 和 Chrome。使用独立浏览器配置，不操作用户窗口。先启动服务，再运行：

```powershell
$env:CDP_PROFILE = 'C:\work\napali-test-profile'
$env:ANGLE = 'd3d11'
$env:CHROME_FLAGS = '--use-gl=angle'
node tools/acceptance.mjs --runtime
```

在本研究仓库中也可以使用已有 Electron 环境的明确隐藏入口：`node tools/launch-project-acceptance.cjs`。独立副本可用官方 Electron 运行 `tools/electron-acceptance.cjs`；模板不打包 Electron 二进制。Windows 的显卡分配可能按程序路径不同而不同，验收要记录实际 GPU 和后端；本机 Chrome 的 Intel 核显/D3D11 与项目 Electron 的 RTX 4070/OpenGL 不是同一个运行条件。

它检查启动页、手机布局、完整地貌生成与真实帧、时间跳转、画质、自由驾驶和停止卸载。GPU 串行锁沿用上游工具。没有 `--runtime` 时只检查启动页，不宣称三维运行通过。可用 `NAPALI_SCENE_URL`、`NAPALI_SCENE_ARTIFACTS` 指定地址和证据目录。

运行后的 `iframe.contentWindow.sceneTemplate.checkRoute(2)` 可按两秒采样地面间距；该值基于 CPU 高度回读，不包含全部岩石位移、树冠和悬垂，必须结合连续路线检查。一次小视口运行也不能证明全屏性能。

下一次交付保留：配置、几何数据、构建清单、固定机位对照、连续运动与操作检查，以及测量视口/画质。流程是：**原作基线 → 确认约束 → 配置或局部替换 → 有限参数调整 → 实际验证 → 达到用途后收口。**

## 上游模块定位

| 能力 | 保留的上游部件 |
|---|---|
| 海岸、地形、GPU 侵蚀、FFT 海浪、后处理 | `vendor/napali/tools/v2_template_backup.html` |
| 距离场几何、树木、岩体、阴影与步进 | `vendor/napali/tools/v3_geo.glsl` |
| 材质和光照 | `vendor/napali/tools/v3_shade.glsl` |
| 海浪、泡沫、近岸水色 | `vendor/napali/tools/v4_water.glsl` |
| 天空与云 | `vendor/napali/tools/v4_sky.glsl` |
| 航线、FPV 与电影镜头 | `vendor/napali/tools/v2_flight.js`，以及固定 `index.html` 的 CINE/CS/cineCam |
| 合并和历史调校 | `vendor/napali/tools/rebuild.cjs`、`patch_v3.cjs`、`patch_v4.cjs`、`tweaks.cjs` |

默认从固定 `vendor/napali/index.html` 构建，完整部件一并保留供以后明确修改算法时研究。不要在只改场景配置的任务中运行上游重建脚本改写 vendor，也不要默默更新 `upstream.lock.json`。保留源库 MIT 许可和 Leon Lin 署名。
