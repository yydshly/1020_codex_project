# 地图研究与深海探索：阶段归档发布

2026-10-25。发布范围为015、016、017三项目及相应目录入口。保留源库和第三方许可，不把其他本地未提交项目纳入本次提交。

## 能力、原理、效果与扩展

- 源库江山时序用结构化历史资料、年份阶段快照、统一地理投影与SVG分层绘制，使时间轴、疆域、城池、人物行迹和内容卡联动；浮雕底图提供山体层次。可扩展地方史、人物行旅、文化路线与交通网络叙事，另有语义参数和离线GeoJSON工具。
- 015保留完整原作本地体验，增加六个入口、研究与指令；016直接复用历史引擎和资料，新增现代DEM、Three.js真三维、共享状态与路线编辑。现代高程不等于古地貌复原。
- 017是独立深海流程实验：两条各11章教学航次、设备与原理动画、采水对照、导演、MiniMax本地音轨、自由驾驶和镜头。可作为设备教学、实验操作与巡检流程的候选基础，新领域仍需对象、规则、资料与适配。
- 地图叙事与动作流程分开评价。九个纯核心为自行提炼或新增；完整包集成、共用时间轴或Three.js不能证明源库核心地图能力已经通用化。
- 中国铁路网络演进保留为后续第二地图实例，先核验有限线路、年代、几何与许可，当前阶段归档，暂不启动。

## 发布入口

- 研究摘要：https://yydshly.github.io/1020_codex_project/projects/017-abyss-expedition/research.html#capability-summary
- 一图总览：https://yydshly.github.io/1020_codex_project/projects/017-abyss-expedition/overview.html
- 深海作品：https://yydshly.github.io/1020_codex_project/projects/017-abyss-expedition/
- 历史地图：https://yydshly.github.io/1020_codex_project/projects/016-dongpo-journey/
- 原作体验：https://yydshly.github.io/1020_codex_project/projects/015-jiangshan-atlas/

## 发布前验证

- 目录入口支持web_entry，017从站点目录进入research.html；旧项目默认入口兼容。10项目录测试通过。
- 跨项目链接支持独立本地端口、统一预览和Pages仓库子路径；历史正文链接在点击时映射，原文与代码不批量改写。
- 运行必需Three.js文件明确纳入版本控制；三项目哈希载荷保留原始字节，避免Windows/Linux换行转换造成清单失配。
- 本地研究档案、资料库、地图包和交付资源检查通过。固定上游、集成派生、语音、图片与素材来源分别保留。

公开部署结果与线上检查在工作流完成后补记；这里的发布前检查不冒充公网验收。
