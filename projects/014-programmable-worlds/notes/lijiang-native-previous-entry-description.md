# 原生实验旧入口说明（历史）

以下为本轮实时网格版本发布前的说明，不代表当前正式入口。

## 新增实践 · 漓江晨航

[在主页直接体验](web/index.html#lijiang) · [独立实时入口](web/lijiang-native/index.html?revision=5) · [模块与复现说明](web/lijiang-native/README.md)

当前入口是另建的原生 WebGL/GLSL 派生版，复用 Na Pali 的树木、岩石、阴影和天空，生成76座独立孤峰、江道与淡水河床，并使用全场景反射。没有外部模型、图片、材质贴图或 HDR。旧 Three.js 实现保留为历史。后续实现方案服从实际画面和性能目标，依据[作品效果标准](notes/lijiang-effect-acceptance.md)选择。

新的45秒航线先沿江升至76米，再降至16米的低机位终景；当前已实拍主峰与倒影。开场等用户点击开始，不在编译和连接期间跳过航线。可暂停、选机位、自由驾驶，调整太阳、薄雾、曝光、冷暖和波纹；`C/R/H` 与按钮操作并存。峰数、种子、江宽等地形再生成参数，以及可选竹筏/飞鸟尚未迁移到新引擎，不沿用旧版已完成标记。

原生导出按固定时间步长制作1920×1080、60fps、2700帧。已实际生成并解码六帧QA短片，标准2700帧任务的启动、真实提交与取消恢复也已通过网页测试；**尚未生成新航线的完整45秒样片**。旧版的[完整影片](assets/lijiang-qa/2026-10-25T04-20-57-291Z/actual-flight.webm)和[解码记录](assets/lijiang-qa/2026-10-25T04-20-57-291Z/ffprobe.json)只属于旧场景。

最终网页画布与后台当前帧逐像素相同。完整实播、快速机位/播放操作、同文档竖屏切换和切到独立车站前的释放已实际通过；作品的整体画面和使用体验仍未通过，上一轮视觉结论已撤回。当前约7.5秒/帧，不能宣传实时60fps。证据与范围见[当前原生记录](notes/lijiang-native-current.json)及[问题复核](notes/lijiang-native-quality-gap.md)；旧[功能记录](notes/lijiang-functional.d3d11.json)、[导出记录](notes/lijiang-recording.d3d11.json)与[迭代记录](notes/lijiang-iteration-log.md)继续保留。
