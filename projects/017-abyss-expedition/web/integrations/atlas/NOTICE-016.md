# 来源与许可

## 当前作品：山河行记 · 历史时空地图（2026-10-24）

本作品直接复用 DeanChensj / jiangshan-map 的完整历史地图引擎、SVG 界面基础与数据，固定 commit 为 `53059f1c7fed305807b19365857a5f135daf3ac6`。54 个收录文件及校验记录见 `web/atlas-source.json`。它不是从零独立原创的历史地图引擎，也不是把原站嵌入 iframe。

新增集成界面、路线编辑及同状态驱动的 Three.js 三维地图视角，按 GPL-3.0-only 提供。上游许可全文保留于 [LICENSE](LICENSE) 与 `web/UPSTREAM-LICENSE`，原始说明保留于 `web/UPSTREAM-README_ZH.md`、`web/UPSTREAM-CONTRIBUTING_ZH.md` 和 `web/UPSTREAM-llms.txt`。

**数据例外继续适用。** 上游明确说明：源自 CHGIS V6 与 Hartwell China Historical GIS 的府州郡政区边界及战国疆域数据受原始学术、非商业使用条款约束，不适用代码的 GPL-3.0 许可。本版收录完整地图数据，包括上述数据；不能沿用旧三站草稿“未提取州府政区”的范围判断。其他素材也保留上游来源与条款，本项目不重新许可这些数据。

Three.js 0.180.0 使用 MIT 许可，未修改模块与许可保存在 `web/vendor/three/`；原地址和 SHA-256 见其中的 `source.json`。

全域三维地形使用 [Mapzen Terrain Tiles / AWS Open Data](https://registry.opendata.aws/terrain-tiles/) 的现代公开高程数据。15 张 Terrarium z4 原始瓦片保存在 `assets/atlas-terrain-source/`；URL、SHA-256、归属与处理说明见 `web/assets/atlas-elevation-source.json`。数据解码为米制值，并按原库的墨卡托投影重采样为 361 × 253 格网，共 91,333 点。文件保留负海拔；渲染器另作垂直夸张等显示处理。

Global SRTM / GMTED2010 terrain data courtesy of the U.S. Geological Survey; global ETOPO1 terrain data from U.S. National Oceanic and Atmospheric Administration。完整来源与条款见 [attribution.md](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)。提取、重采样与显示修改不表示原始数据提供者认可本作品。

历史疆域和政区为示意边界；现代高程不代表古代地貌。人物与自定路线的连线表达时空关系，不是精确导航路线。核心地图没有接入在线 AI 生成或问答服务。

## 历史草稿：东坡南行三维小景

以下说明仅对应保留的 `miniatures.html` 及 `scenes.js` 等旧草稿，不代表当前主作品的复用范围。

三个微缩场景中的地形、建筑、桥梁、古塔、植物、舟船与水面着色器为独立创作，按 GPL-3.0-only 提供，不声称为宋代遗址的精确复原。旧总览使用 6 张 Mapzen Terrarium 瓦片生成 241 × 241 网格，来源与哈希保存在 `web/assets/elevation-source.json`，源瓦片位于 `assets/terrain-source/`。

## 历史草稿：三站二维专题

以下说明仅对应保留的 `map-2d.html`、旧 `app.js`、`story.js` 及其提取资源。

该草稿的界面、投影、渲染、视图控制、叙事交互和构建脚本按 GPL-3.0-only 提供。经典诗文引句为公有领域作品；新写阅读导引的事实依据记录于草稿页面。

草稿从相同固定版本提取北宋政权轮廓、自然水系和地形底图；输入与输出 SHA-256 见 `web/assets/map-source.json`。当时没有使用完整上游控制器或州府政区图层；这一历史描述不适用于当前主作品。

旧三站草稿把儋州点位由上游约 `[109.58, 19.52]` 调整为中和古治所附近的 `[109.35, 19.74]`。这是草稿中的独立定位处理，不能推断为本版完整上游数据已全局修改；均不作为故居的精确测绘点。

