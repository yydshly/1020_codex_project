# 碰撞保护验收记录

日期：2026-10-25。本轮记录自动几何检查及681×871桌面浏览器CSS视口中的实际操作；坐标与高度均为模型单位。

## 自动检查

以下命令已通过：

```powershell
node projects/017-abyss-expedition/src/check-pilot.mjs
node projects/017-abyss-expedition/src/check-collision-world.mjs
node projects/017-abyss-expedition/src/check-collision-assets.mjs
node projects/017-abyss-expedition/src/check-collision-integration.mjs
node projects/017-abyss-expedition/src/check-terrain.mjs
node projects/017-abyss-expedition/src/check-camera-state.mjs
node projects/017-abyss-expedition/src/check-director.mjs
node projects/017-abyss-expedition/src/check-delivery.mjs
node projects/017-abyss-expedition/src/check-environment-cues.mjs
```

- 碰撞世界检查包含72个精确足迹包络，最大包络误差约 `2.42e-13`。
- 真实资产检查包含404个机械臂、瓶盖和横滚组合姿态，约248万次实际变换顶点检查；同时检查实例矩阵、实体快照及机体包络。
- 集成检查读取实际站点生成器、`stagedVehicleLocation`、`protectScriptedVehicle` 和最终相机保护函数：两航次共检查114372个实际ROV顶点、14个环境及自机相机案例、404个采水器动作状态和202个雷达角度。各航次1200帧开场均安全抵达海床，最终Y分别为−41.8、−197.6；没有停在船尾或一直上升。
- 管虫硬管按90个独立盒与90个嘴缘检测，排除8100个软冠实例。实际热液场实体项为718个，峡谷763个；合并渲染不再把整片管虫群封成大盒。

这些结果覆盖各脚本的夹具与实际资产检查，不代替下列浏览器操作或尚未执行的完整影片重放。

## 浏览器实际操作

| 场景与操作 | 实际结果 |
| --- | --- |
| 峡谷原分享链接恢复，heading 2.779 | 原中心 `(170.6,-205.3,204.6)` 调整为 `(147.8,-205.3,204.6)`，安全恢复改变水平位置 |
| 峡谷按住W 2.2秒，再按W 1.5秒 | 停在约 `(149.5,-205.3,209)`；继续按W位置不变，状态显示“岩壁阻挡” |
| 峡谷贴壁按A，再按R 1.2秒后按D | 贴壁转向被阻止；上升到Y约−173.4后可以转向，能够主动脱离受阻位置 |
| 3独立镜头拖向岩壁，随后切2前向视角 | 独立镜头距离缩短，该操作中未见相机进入壁内；前向视角同段亦未见壁内画面 |
| 热液航次第38分钟接近烟囱，按W 1.6秒，再按W 1.2秒 | 停在约 `(-30.5,-24.7,41.2)`；继续前进位置不变，状态显示“实体阻挡” |
| 水面导演初章接管 | 可以进入驾驶，模型Y为414 |
| 导演开场播放后暂停 | 音轨停在8.692508秒、进度8.7；间隔复读时，音轨时间、潜器可见标记位置均未变化 |
| 修正布放与镜头路线后重播开场 | 11.8秒时清楚看到水下潜器，跟拍不再卡在船体边缘；两航次完整开场另由真实轨迹逐帧几何检查覆盖 |
| 390×844窄视口 | 页面宽度390、无水平溢出，可见驾驶按钮均在视口内；随后恢复681×871 |

上述操作期间未出现控制台error／warn，个人报告记录数保持0，没有写入采样记录。

## 截图

- [修复前位置](../assets/collision/00-before.jpg)
- [恢复后位置](../assets/collision/01-after.jpg)
- [峡谷岩壁阻挡](../assets/collision/02-wall-stop.jpg)
- [相机靠墙检查](../assets/collision/03-camera.jpg)
- [热液场实体阻挡](../assets/collision/04-solid.jpg)
- [导演暂停时钟复查](../assets/collision/05-director-pause.jpg)
- [修正后的水下跟拍](../assets/collision/06-dive-route.jpg)
- [390宽窄屏](../assets/collision/07-mobile.jpg)
- [最终运行画面](../assets/collision/08-final.jpg)

## 覆盖限制

- 未完整重放两条航次共22个导演章节。`check-director.mjs`通过属于时钟逻辑检查，不能扩称全片画面均已验证。
- 未进行手机实机测试。681×871与390×844是浏览器CSS视口，不代表物理手机设备。
- 一次峡谷冷加载超过导航等待时间，随后正常进入驾驶且控制台无错误；本轮没有进行启动性能专项优化。
- 采用保守定向包络与部件AABB，复杂实体内部小空隙可能被封住；软冠、羽流、缆线和光束不作为硬质刚体。不是任意洞穴或可变形刚体引擎。
- 相机“未见壁内”是上表操作的观察结果，几何保证范围应结合自动检查及后续集成测试结果判断。
