# V3 构建 B

仅编辑 `src/v3/scenes-b.mjs`，导出 `scene02(local_frame)` 与 `scene04(local_frame)`。未读取或修改 V1/V2。

已完整阅读 `.cache/v3-source/original-prompt.txt`、brief、brief-input、facts、storyboard、style-guide、timing 与 shared API。依照负责人确认，声音已完成且先行4秒样片已生成后开展组件工作。

目录依据真实 `projects/002-ai-content-toolkit/web/index.html` 的导航及 `web/app.js` 中 card()、tool-grid 重建。六张工具卡、主要导航、实际“阅读研究”入口分别为矢量对象。225帧（本地75帧）Kokoro卡变绿；随后展开 README 的“文稿 + 音色 → 语音”关系预览。鼠标最终点位(558,359)，位于Kokoro卡(310,244,278,144)内的阅读入口行。

声音画面依据真实 `web/kokoro-learning.js` 第40行 `wave-amplitude` 滑块，以及 wave-plot 重建为特写。475帧（本地25帧）在滑轨(960,230)按下，之后以 timing 的 slow_reveal_frames 插值，波形半幅由22增至64像素；不把像素显示为参数数值，不添加分贝、百分比或虚假实测数据。“教学示意”自场景第一帧出现。

两场的时序仅取 `TIMING.events`、`TIMING.scenes` 和 `M`，没有写死帧常数。场景02保留(210,245)品牌接力区，场景04保留(1120,115)品牌接力区，均不另造品牌图标。

负责人已确认统一补充 facts：“阅读研究”（web/app.js 的 card-bottom）及“相对振幅”（web/kokoro-learning.js 的 wave-amplitude label）。现有 claims 已覆盖其余可见文字。

完成基本执行检查：两个组件各生成150帧SVG字符串，没有 NaN 或 undefined。未自评视觉“通过”，待全新评审代理实际抽帧测量。
