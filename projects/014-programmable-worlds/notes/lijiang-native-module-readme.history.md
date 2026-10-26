# 漓江原生派生版本

> 当前以作品自身的实际效果和使用体验验收，源库提供思路和技术参考。整体作品尚未通过；技术记录继续保留。准则见项目 `notes/lijiang-effect-acceptance.md`，具体问题见 `notes/lijiang-native-quality-gap.md`。

当前入口为 `index.html`，通过8798专用隐藏OpenGL进程运行 `engine.html`；原作8797进程与原样文件独立保留。山、水、树木和天空全部用程序生成。该版本沿用并改写 Leonxlnx/napali 完整GLSL渲染体系，核心并非旧版Three.js网格方案。来源和许可见 `credits.html`。

在工作区根目录生成场景：

```powershell
python projects/014-programmable-worlds/src/build_lijiang_native.py
node projects/014-programmable-worlds/src/runtime-shell/launch-lijiang-native-bridge.cjs
```

同时需要既有8796静态服务。首页已接入这一入口；开始航拍、暂停、机位、C/R/H、自由驾驶与实时光线/水雾参数通过 `window.lijiangWorld` 操作。初始化后停在0秒，避免等待连接时错过开场。最终镜头16米，其余航线高度16–76米，不宣传全程30–80米。

生成器与模块职责：

- `src/build_lijiang_native.py`：固定上游哈希、76峰布局、双突脊/沟槽、侵蚀约束、岸林、航线与生成清单。
- `src/lijiang_native_river.py`：平静淡水波面、真实场景反射、独立淡水河床和折射。
- `src/lijiang_native_march.py`：独立峰包围盒与带符号精化，消除陡峰假命中和漏步破洞。
- `src/lijiang_native_accel.py`：保守max-height空域实验。实际同机位未提速，默认不启用；`--air-accel`仅供复测，不作为性能改善。
- `offline-export.js`：固定时间步长的1080p60帧输出，导出期间锁定输入，完成/取消后还原原画布、累积缓冲与视角。
- `live-settings.js`：太阳、雾、曝光、饱和度、波幅、波速与冷暖。
- `live-viewport.js`：按约130万像素预算真正重建竖向画布，保留世界、时间和自由机位；导出时禁止同时调整画幅。

旧版完整45秒影片不属于当前版本。原生引擎已有六帧真实解码与标准任务取消检查，新航线完整2700帧影片尚未生成。当前画质、无损显示、完整实播及核心交互的证据见 `notes/lijiang-native-current.json`。实时仍约7.5秒/帧，项目保留“研究中”，没有把离线60fps当成实时60fps。

专属QA产物位于 `C:\Users\yun68\CodexTaskArtifacts` 下的 `014-lijiang-native-qa` 和 `014-lijiang-native-client-qa`，不写入用户日常库。QA使用隐藏、不获取焦点的任务窗口，不发送系统键鼠。

竖屏验收使用桌面Chromium的手机尺寸视口；这不等于实体手机或公网部署验收。本地完整渲染仍由桌面OpenGL服务完成。
