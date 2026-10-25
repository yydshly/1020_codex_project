# 历史地图能力集成：来源与修改声明

这是把016山河行记的当前地图运行时接入017研究档案的本地集成包。它没有把历史地图引擎重新署为独立原创，也没有把这套渲染器迁移到深海作品。

- 上游：DeanChensj / jiangshan-map，https://github.com/DeanChensj/jiangshan-map ，固定版本 53059f1c7fed305807b19365857a5f135daf3ac6。54份上游输入按原始哈希核验；引擎与数据保持原始字节，专题HTML副本仅移除原站统计脚本。见 atlas-source.json 与 integration-source.json。
- 016新增：地图入口、路线编排、同一历史状态驱动的Three.js三维地图、现代DEM投影适配。此次打包不修改016源文件。
- 017新增：同源嵌入桥、生命周期API、相机保留选项、集成来源页面和可重建脚本。完整派生修改及输入/输出SHA-256见 integration-source.json。
- 代码：上游GPL-3.0；016和017新增代码GPL-3.0-only；许可全文为UPSTREAM-LICENSE。浏览器直接加载的JS即对应源代码，桥与API附加源单独保留。
- 数据例外：CHGIS V6、Hartwell等历史政区与疆域数据仍受原始学术、非商业条款约束；GPL代码许可不改变其条款。参见UPSTREAM-README_ZH.md、UPSTREAM-CONTRIBUTING_ZH.md、NOTICE-016.md。
- Three.js 0.180.0：MIT，模块、source.json和LICENSE完整保留于vendor/three/。
- 现代DEM：Mapzen Terrain Tiles / AWS Open Data。Global SRTM / GMTED2010 terrain data courtesy of the U.S. Geological Survey; global ETOPO1 terrain data from U.S. NOAA. https://github.com/tilezen/joerd/blob/master/docs/attribution.md 。解码高程与15张瓦片来源哈希在assets/atlas-elevation*.json。该包不复制原始瓦片。
- 历史边界为近似示意；现代高程不表示古代地貌，三维显示使用高度夸张；路线连线不等于精确行路轨迹。
- 核心地图运行不请求8016或远程渲染服务，不依赖在线AI。专题HTML的历史文字、作者归属和原站链接保留，原站统计脚本从集成副本中移除。原库古琴播放器的5首Wikimedia音轨仍需联网，未下载或缓存；只有点击播放时使用，不影响地图、三维或时间轴。
- 不打包旧微缩场景、旧三站地图、原始高程瓦片、私有配置或凭据。

重建：在仓库根执行 node projects/017-abyss-expedition/src/build-atlas-integration.mjs。以HTTP服务启动017/web，再打开 /integrations/atlas/?embedded=1&view=3d。
