# 自由驾驶与场景区分验收

日期：2026-10-25。本轮修改本地 017 作品，服务为 `http://127.0.0.1:8017/`。无新增外部运行依赖，未修改个人样本存储。

## 交付行为

- 热液区是开阔玄武岩低脊与斜向裂隙，烟囱和矿物场位于其中；峡谷改为弯曲深槽、层状高壁和岩质台面。两者不再共用同一种高度分布。高差为模型单位，不是实测米数。
- 场景工具栏的“接管潜器”、导演栏的“接管驾驶”均进入实际连续驾驶。W/S 前后、A/D 转向、Q/E 横移、R/F 升降、空格急停；屏幕八个方向按钮可长按。
- 1 为跟随，可拖动环绕和缩放；2 为机头前向，可拖动视线；3 为独立镜头，可平移、环绕、缩放，潜器仍由驾驶键控制。
- 接管会停止影片音频和航次回放。原航次温度、电量、时间轴和小地图在驾驶中隐藏；驾驶台显示实际模型位置、机头朝向、离底高度与模型航速。
- 附近站点介绍为只读，不修改任务时刻，不生成实测数据，不自动写个人报告。结束驾驶返回原航次；驾驶中切换航次保留手动模式并停止所有输入。
- 驾驶范围 X/Z ±580，离底保护 18，上限 Y=414，均为模型单位。陡壁前制动，须主动升高才能越过；不是任意物体编辑器或真实潜器动力学仿真。
- `pilot` 保存三种镜头模式；`pose` 保存量化的位置和朝向；非前向视角另保存 `cam`。重新打开时潜器不自动移动。

## 浏览器实际操作

在应用内浏览器测试 CSS 视口 1029×871、约681×871 与390×844。窄屏测试不是物理手机测试。

| 验证 | 实际观察 |
| --- | --- |
| 热液区键盘驾驶 | W 持续1.2秒，Z由44.6移至约3.7，减速后-2.7；R升高，D转向，原任务仍第38分钟，报告仍0条 |
| 峡谷长按 | 手机视口屏幕“前进”按住900毫秒，位置由X201.8/Z94.2移至约X184.7/Z74.0，航次仍第90分钟 |
| 独立镜头 | 切3后按E横移；分享URL中的cam完全相同，pose发生改变，证明镜头与潜器分别控制 |
| 刷新恢复 | 停止于X213.3/Y-207.9/Z47.1，刷新后坐标与朝向恢复，模型航速0，个人报告仍0 |
| 峡壁制动 | c-wall附近持续前进，停在离底18处，提示“海床阻挡 · 按R上升或转向”，不瞬移到墙顶 |
| 边界与上限 | 从有效共享位置X579/Y413按R、W，最终X580/Y414，水平速度0 |
| 导演交接 | 从峡谷岩壁导演章接管进入驾驶；从驾驶返回导演，MiniMax实际播放约9.2秒后暂停；音频paused为true |
| 返回与重新进入 | 结束驾驶后显示原航次和记录卡，焦点回到接管按钮；再次点击成功进入驾驶 |
| 航次切换 | 驾驶中从vents切到canyon，仍显示驾驶台，影片关闭，速度0，无残留按键 |
| 旧教学可见性 | 热液A采水章的采样架、潜器、字幕和演示按钮仍可见；未在本轮重放两部完整影片 |

本轮修复了驾驶布局高度归零、工具栏入口继承不可点击状态、峡谷相机被抬到壁顶导致潜器过小，以及前向视线拖拽可能误触站点的问题。相机现在遇壁缩短距离，并在开始跟随时选择无遮挡方向。

## 可复跑检查

从工作区根目录运行：

```powershell
node projects/017-abyss-expedition/src/check-pilot.mjs
node projects/017-abyss-expedition/src/check-terrain.mjs
node projects/017-abyss-expedition/src/check-core.mjs
node projects/017-abyss-expedition/src/check-camera-state.mjs
node projects/017-abyss-expedition/src/check-director.mjs
node projects/017-abyss-expedition/src/check-learning.mjs
node projects/017-abyss-expedition/src/check-learning-content.mjs
node projects/017-abyss-expedition/src/check-narration-player.mjs
node projects/017-abyss-expedition/src/check-narration.mjs
node projects/017-abyss-expedition/src/check-delivery.mjs
python scripts/projects.py check
```

以上均通过。驾驶测试覆盖30/60/120FPS与不规则小帧等时结果、加减速、斜向限速、即时制动、山脊防穿、主动越墙、边界/上限、异常输入原子性、不可变快照与非海洋复用。地形每航次135个真实网格射线点，其中38个在外环；heightAt与网格最大误差小于4e-9。热液/峡谷模型高差约55.7/336.9。

MiniMax22条现有音轨的文本、字节数和SHA-256校验通过；本轮未改旁白内容，也未重新请求语音生成。未声称长期运行、全部硬件或完整影片回归已通过。

## 画面证据

- [旧峡谷近景](../assets/piloting/00-canyon-before.jpg)
- [新峡谷岩壁](../assets/piloting/01-canyon-after.jpg)
- [窄屏驾驶](../assets/piloting/02-mobile-drive.jpg)
- [热液区驾驶](../assets/piloting/03-vents-drive.jpg)
- [峡谷驾驶](../assets/piloting/04-canyon-drive.jpg)

当前前端入口：app49 / scene36 / terrain10 / pilot-ui1 / pilot.css3。截图反映实测时刻；驾驶键释放后会有短暂减速，不用某一帧读数代表长期稳定状态。
