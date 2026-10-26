# 漓江晨航 · 独立视觉验收

日期：2026-10-25。**默认画面视觉结论：accepted。** 本结论限定为纯代码生成的漓江兴坪／黄布倒影意象 CG：孤峰、江湾、安静倒影、晨雾层次、航拍构图及已查看的主页手机布局成立，当前未见阻断这一范围交付的可见问题。

这是独立评审判断，不代表用户已确认，也不声称实地摄影还原、地理精确复刻、写实画质或与 napali 原作质量同级。目标依据与无外部景物资源规则见 [lijiang-goal-source.json](lijiang-goal-source.json)；图片本身不能代替资源规则的代码核查。

## 实际查看的画面

以下均为磁盘中的实际运行截图，未启动新的 GPU 或浏览器会话。尺寸读取 PNG 文件头确认。

| Run | 已实际查看的证据 | 实际尺寸与范围 |
| --- | --- | --- |
| `2026-10-25T04-16-32-477Z` | [0 秒](../assets/lijiang-qa/2026-10-25T04-16-32-477Z/01-flight-0-canvas.png)、[12 秒](../assets/lijiang-qa/2026-10-25T04-16-32-477Z/02-flight-12-canvas.png)、[25 秒](../assets/lijiang-qa/2026-10-25T04-16-32-477Z/03-flight-25-canvas.png)、[45 秒终景](../assets/lijiang-qa/2026-10-25T04-16-32-477Z/04-flight-45-canvas.png) | 四张 canvas 均为 1440×902；沿江推进及最终主峰／倒影构图。 |
| 正式主页 `2026-10-25T04-50-53-221Z` | [桌面 UI page](../assets/lijiang-hub-qa/2026-10-25T04-50-53-221Z/desktop-final-ui-page.png)、[桌面净画面 page](../assets/lijiang-hub-qa/2026-10-25T04-50-53-221Z/desktop-clean-page.png)、[净画面 canvas](../assets/lijiang-hub-qa/2026-10-25T04-50-53-221Z/desktop-clean-canvas.png) | page 1440×902；嵌入画布 1174×680。 |
| 同一正式主页 run | [376 UI page](../assets/lijiang-hub-qa/2026-10-25T04-50-53-221Z/phone-376-ui-page.png)、[376 净画面 page](../assets/lijiang-hub-qa/2026-10-25T04-50-53-221Z/phone-376-clean-page.png)、[376 净画面 canvas](../assets/lijiang-hub-qa/2026-10-25T04-50-53-221Z/phone-376-clean-canvas.png) | page 376×845；画布 319×620。 |
| 同一正式主页 run | [390 UI page](../assets/lijiang-hub-qa/2026-10-25T04-50-53-221Z/phone-390-ui-page.png)、[390 净画面 page](../assets/lijiang-hub-qa/2026-10-25T04-50-53-221Z/phone-390-clean-page.png)、[390 净画面 canvas](../assets/lijiang-hub-qa/2026-10-25T04-50-53-221Z/phone-390-clean-canvas.png) | page 390×845；画布 333×620。 |
| 最后 GUI 补齐后的默认恢复 `2026-10-25T04-56-11-308Z` | [atmosphere-default-restored-canvas](../assets/lijiang-qa/2026-10-25T04-56-11-308Z/atmosphere-default-restored-canvas.png) | 1440×902；补齐雾团数量、高度与色温控件后，当前默认终景仍保留已评审构图。 |

## 视觉判断

- 主峰与邻峰具有陡侧壁、圆钝而错落的轮廓；江道将岸林、峰林与远景分开。画面能读作漓江峰林的程序化意象，没有把主体做成普通连续山脉。
- 江水安静，细波纹没有抹掉主峰倒影。桌面终景与两种手机净画面均容纳完整的中央主峰及其倒影；没有以 UI 遮住反射末端来代替构图修正。
- 近岸较深、远峰逐层变淡，雾与背景形成可读深度。当前所看默认画面未见早期显眼的亮雾横线、刀切薄片峰或岸边高亮切带。
- 四个航线采样帧呈现沿江推进、江湾展开和终景收束，所见帧未穿入峰体或岸面。路径时序、连续净空和完整 45 秒运行由另行功能记录验证，不从四张静帧推定。
- 手机纵向净画面保住中央主峰与完整倒影，左右邻峰因窄幅取景而裁掉，不能宣称全部横向峰林都适配纵屏。UI 模式下控制区会覆盖下部江面；净画面隐藏该覆盖后，完整倒影可见。已看尺寸中的标题、时间轴与操作按钮未见横向裁切或互相遮挡。

## 历史与风格限制

[lijiang-iteration-log.md](lijiang-iteration-log.md) 保留 R1、R2 的拒绝、制作期样例及后续修正。本次通过不追溯覆盖它们。该记录也保留 `03-59-52-984Z` 终景倒影裁切问题：最后 9 秒的目标高度由 150 米缓降至 90 米；当前通过的是修正后实际画面，不是原裁切版本。

岩壁仍有明显的程序纵向条纹与相似的圆钝体量，岩植过渡较概括；岸林冠层仍读作连续块团和简化灌丛，近看可见局部角面、重复形状与有限的树种差异。天空和雾以柔和渐变、灰蓝层次为主，材质与照明没有达到摄影级细节。这些是当前 CG 风格与实现边界，不应在交付说明中消失；按本次纯代码意象目标，它们不构成默认构图的阻断项。

## 图像指纹与验收边界

以下 SHA-256 直接由本次查看的 PNG 文件计算，只用于固定证据版本，不证明艺术质量：

| 图像 | SHA-256 |
| --- | --- |
| `04-16-32-477Z/04-flight-45-canvas.png` | `da742ebc60964d4d0176e74f2701c5d329f992ec8d243879a278e8fff36952a9` |
| `04-50-53-221Z/desktop-clean-canvas.png` | `0d502eb76ff8d2f76463154bc91a25bea986ac73ba8a8d5685c800b9c2649480` |
| `04-50-53-221Z/phone-376-clean-canvas.png` | `153452dc54365c33e2f2f3705ef13b7c87570adfcfd47dbd91abd4222296a57b` |
| `04-50-53-221Z/phone-390-clean-canvas.png` | `cec4e5214e99b996d8cab6fd39a59764a15a1c33391a24ce4969b87f2647dd37` |
| `04-56-11-308Z/atmosphere-default-restored-canvas.png` | `fdc40b3831cc13d2c238b64dfbd9627c085e5f6fb2f04c11db911b0e68217917` |

本记录不替代 [完整功能记录](lijiang-functional.d3d11.json)、[主页生命周期与交互记录](lijiang-hub-acceptance.d3d11.json)、[最终雾参数记录](lijiang-atmosphere.d3d11.json) 或 [完整导出记录](lijiang-recording.d3d11.json)。截图中的 FPS、通过项数量及导出帧数均未作为视觉通过理由。本结论不覆盖任意 GUI 极端组合、全部自由视角或所有设备，也不改写此前冻结的老街／船坞视觉记录。
