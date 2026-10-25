# 016 · 山河行记 · 历史时空地图

> 在同一张地图里拖动时间、查看疆域、搜索古城与人物，沿生平或自定路线读历史；舆图与三维山河共享年份、人物和路线状态。

[进入作品](http://127.0.0.1:8016/) · [舆图视角](http://127.0.0.1:8016/?view=2d) · [能力、操作与来源](http://127.0.0.1:8016/process.html)

![山河行记实际运行：同一历史地图的三维地形、疆域、城池与时间轴](assets/acceptance-atlas-3d.jpg)

## 这次实现什么

用户最新要求是“参考源库效果，实现类似的能力”。此前三个独立微缩景观偏离了这个目标。当前主页改为完整历史时空地图：**复用江山时序的完整引擎与数据，再扩展同状态驱动的三维视角和路线编辑器**，不是从零原创的历史地图引擎。

上游固定为 `53059f1c7fed305807b19365857a5f135daf3ac6`。本项目保留 54 个上游文件，清单和校验值见 [atlas-source.json](web/atlas-source.json)。它在自己的 `web/` 内独立运行，不嵌入 015 展示页，也不依赖 015 服务。运行时未接入 Claude 或其他在线 AI 调用。

| 能力 | 当前作品 | 可以怎样核对 |
| --- | --- | --- |
| 历史时间轴 | 保留年份、朝代、年号、编年事件和阶段疆域联动 | 输入前 230 年，再推进至前 221 年，观察秦灭六国各阶段 |
| 点地溯源 | 保留古今地名搜索、城池沿革、历代归属和当地史事 | 搜索长安，打开沿革卡片，点史事跳到对应年份 |
| 点人溯事 | 保留人物档案与完整生平事件、行迹和逐站播放 | 搜索苏轼或秦始皇，逐条切换经历，核对年份、地图与路线 |
| 路线 | 保留源库同年、跨年路线；新增 2–20 站编辑器 | 填地点和年份，校验地名、年份数量及公元 0 年，生成后逐站浏览 |
| 古今图层 | 保留疆域、州道政区、古地名、山川、关河丝路与现代省界 | 在图层菜单切换，比较明代疆域和现代省界 |
| 寻址挑战 | 保留古地名线索、落针与距离评分 | 进入挑战后自动切到舆图，根据线索落针作答 |
| 同图三维视角 | 新增真实高程网格上的疆域、城池和人物 / 自定路线 | 切换 2D / 3D，再旋转、缩放和点站点，检查探索状态一致 |

固定数据包包含 **18 个历史时期、167 个时期快照、468 条编年事件、113 个人物档案和 7 条预设人物旅程**。统计细节：`ATLAS_SNAPSHOTS` 共 168 个键，其中包括 `neighbors`；166 个历史快照由阶段显式引用，现代时期隐式使用 `s_prc`。1405 是各时期城池记录之和，不是去重城市数。数据数量不代表本项目重新校勘了所有史实。

## 从哪里开始

页面提供六个直接入口：秦扫六合、长安沿革、苏轼生平、杜甫归乡、古今对照、寻址挑战。它们直接操作地图；进入后可以继续搜索、改年份或切换视角。

- 拖动底部时间轴，或输入年份；负数表示公元前，没有公元 0 年。
- 搜索人物、古今地名、州府或年号。人物卡片可以切换经历，城池卡片可以查看历代沿革。
- 点击“＋ 自建路线”，输入 2–20 个地点；年份可以填一个，或与每个地点一一对应。
- “舆图”用于精细政区悬停、透视镜和寻址挑战；“3D 山河”用于观察地形、疆域、城池与路线的空间关系。3D 拖动旋转、滚轮缩放、右键平移。
- 切换视角保留当前年份、人物与路线。进入挑战自动切回 2D，退出后可再进入 3D。

## 本地运行

从仓库根目录启动，需 Python 3；三维视角需浏览器支持 WebGL 2：

```powershell
python -m http.server 8016 --bind 127.0.0.1 --directory projects/016-dongpo-journey/web
```

打开 [http://127.0.0.1:8016/](http://127.0.0.1:8016/)。015 原作展示与指令手册继续使用 8015；两项目可同时独立运行。核心地图、数据与 Three.js 模块均在本地，不需要 npm 安装或 AI API 密钥。源库保留的外部资料链接与可选外部资源不属于本地核心地图资源。

## 实现结构

| 文件 | 作用 |
| --- | --- |
| `web/index.html` / `atlas-workbench.css` | 完整地图入口、视角切换、六项体验和路线编辑界面 |
| `web/js/` / `web/css/` | 固定版本的原库控制器、历史数据及舆图样式 |
| `web/atlas-workbench.js` | 调用上游控制器，同步 2D / 3D 状态，验证路线输入 |
| `web/atlas-terrain.js` | Three.js 三维地形、疆域、城池、路线和相机交互 |
| `web/atlas-source.json` | 54 个上游文件的固定版本、路径与校验记录 |
| `web/assets/atlas-elevation.json` | 与原库墨卡托投影对齐的 361 × 253 高程格网 |
| `web/assets/atlas-elevation-source.json` | 15 张高程瓦片的来源、归属、哈希及格网说明 |
| `web/vendor/three/` | Three.js 0.180.0 本地模块、MIT 许可与来源清单 |
| `src/integrate_atlas.py` | 集成固定版本的完整原库资源 |
| `src/build_atlas_terrain.py` | 下载 / 复用高程源瓦片，生成全域地形格网 |

高程格网有 **91,333 个采样点**，保留米制海拔与负值，采用原库的 1000 × 700 墨卡托投影。渲染时另行处理海面与垂直夸张，地形和疆域使用同一坐标参照。

## 复现与验收

```powershell
# 可选：重建全域高程。需 Pillow；已有缓存时无需下载瓦片。
python projects/016-dongpo-journey/src/build_atlas_terrain.py

# 校验当前完整地图产物
node projects/016-dongpo-journey/src/verify-atlas.cjs

python scripts/projects.py check
```

本轮已核对 54 个上游文件哈希、人物与旅程数据、91,333 个高程点及 15 张来源瓦片。浏览器已实测年份与疆域联动、人物搜索和逐站播放、城池沿革、诗词路线、自建路线和刷新恢复、图层、挑战落针评分及手机布局。具体操作与边界见 [当前地图验收记录](notes/verification-atlas.md)；这不代表所有史料均已重新校勘。

早前 `notes/verification-3d.md` 对应微缩景观版本，不能用作当前地图版本的验收依据。

## 来源与表达边界

- 上游：[DeanChensj / jiangshan-map 固定版本](https://github.com/DeanChensj/jiangshan-map/tree/53059f1c7fed305807b19365857a5f135daf3ac6)。本作品保留其 SVG 地图、数据、查询和交互能力；新增部分为集成界面、路线编辑和联动三维视角。
- 历史疆域、政区边界及历史地点沿用上游示意数据，不是精确测绘边界；人物事件和史料仍需按上游校勘约定核对。
- 三维地形来自**现代公开高程数据**，不是各朝代古地貌复原。垂直比例为便于辨识而夸张；路线连线表达地点或事件关系，不是精确行路轨迹。
- [Mapzen Terrain Tiles / AWS Open Data](https://registry.opendata.aws/terrain-tiles/)；[格式](https://github.com/tilezen/joerd/blob/master/docs/formats.md)与[归属条款](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)。Global SRTM / GMTED2010 terrain data courtesy of the U.S. Geological Survey; global ETOPO1 terrain data from U.S. NOAA。
- 新增代码 GPL-3.0-only，Three.js 为 MIT。源库中 CHGIS V6 / Hartwell 等数据的学术、非商业条款继续适用，不因代码采用 GPL 而变更。详见 [NOTICE](NOTICE.md)、[上游许可说明](web/UPSTREAM-README_ZH.md)与[来源页](web/process.html#sources)。

早前 `miniatures.html` 和 `map-2d.html` 保留为历史草稿，不属于当前主入口与能力验收范围。目录名 `dongpo-journey` 保留以免破坏已有路径。

[返回总索引](../../README.md)

