# 阿橘的雨后散步

本地漫游入口：`http://127.0.0.1:8062/roam.html`。点击“进入老街”后，可以控制橘白小猫阿橘沿两岸、石拱桥、木桥和店后巷行走。

在仓库根目录启动：

```powershell
python -m http.server 8062 --bind 127.0.0.1 --directory projects/007-canal-blender-test/web
```

操作：WASD／方向键移动，Shift 小跑，拖动画面环顾，滚轮调整距离；手机使用方向盘。顶部可切换街区全景、跟随视角、自动导览和暂停；R 或“回到起点”重置角色。

## 本轮内容

- 以 `rainy-canal-extension-03.blend` 为来源，另存 `artifacts/rainy-canal-roam-01.blend`；完成远景树视觉清理后另存 `artifacts/rainy-canal-roam-02.blend`，旧版本保持原样。
- 在新副本中整理旧超长地形、铺地和河道，重建有限的弯河及连续两岸，保留核心店铺、桥梁、后巷和对岸建筑。
- 当前入口载入约 9.09 MiB 的 `web/models/roam-02.glb`。静态程序顶点色配合实时材质、街灯、湿区和水面反射；网页效果与 Cycles 渲染仍有差别。
- 小猫为独立 Three.js 几何角色，包含交替四足步态、摆尾、呼吸和眨眼。角色控制与外观分离，后续可替换外观。
- 导航采用有限街区的地面／桥高和障碍代理，限制进入水面、建筑和外围背景。店内暂不开放；没有跳跃、重力模拟或全网格物理系统。
- 原研究首页及其 V3/V4 查看器保持不变；只新增独立漫游入口，没有发布或提交。

## 验证

```powershell
node --test projects/007-canal-blender-test/tests/test_canal_navigation.mjs projects/007-canal-blender-test/tests/test_roam_controls.mjs
python projects/007-canal-blender-test/scripts/check_roam_preview.py
```

23 项 Node 检查覆盖两环行走、完整导览、桥高、障碍、防穿越及暂停重置。真实 Chromium 检查覆盖 WebGL 加载、键盘／触屏方向盘、视角切换和导览起步，保存桌面与手机截图。完整路径逻辑测试、场景射线采样和浏览器实测各自验证不同部分，不能替代所有位置的人工体验。

证据：`assets/roam-01-browser-check.json`、`assets/roam-01-preservation-check.json`、`web/models/roam-02-manifest.json`。漫游应用第一版使用场景修正版 `roam-02`；旧场景 `roam-01` 及其记录仍保留。
