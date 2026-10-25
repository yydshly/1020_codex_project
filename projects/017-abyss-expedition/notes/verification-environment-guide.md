# 海洋环境语音导览验收

日期：2026-10-25。服务：`http://127.0.0.1:8017/`。

## 本轮补全

此前自由驾驶会停止导演影片；驾驶层只有操作、位置和最近站介绍，缺少独立的环境主线。新增环境导览把“身处哪里→深海条件→地形水流→食物→栖息环境→调查目的”接起来，使用独立 MiniMax 音轨，不选择事件、不移动镜头、不写个人报告。

- 峡谷六段：虚构深海峡谷与热液裂隙区的区别；黑暗、通常寒冷和高压；谷壁、台面与泥沙搬运；水流、海洋雪与食物；附着表面及灯光观察；拍照和同类水样比较。
- 热液六段：虚构热液岩脊；冷海水与局部热流；裂隙循环；矿物颗粒与烟囱；微生物及部分管虫；配对采水与待检验问题。
- 每段附一句重点、三个观察点、完整旁白、NOAA／WHOI资料直链。自由镜头下不使用“你身后一定有某物”等依赖固定机位的说法。
- 默认收起保留主题、播放、上一段/下一段与状态；展开可选主题、倍速、定位和查看资料。连续播放默认开启，首次需点击开始；非连续模式播完可“重听这一段”。
- 当前用户位置约X170.6/Y-205.4/Z204.6属于模型东侧谷道回弯，位置提示为“东侧谷道回弯 · 近底坡脚上方”。Y、离底与区域名称仅说明模型关系，不是真实测深。

## 运行与验证

新增12条音轨，378.432秒、6,075,504字节；热液180.396秒、峡谷198.036秒。新目录为 `web/assets/environment-narration/`，原导演22条和原JSON/MJS清单保持不变。第二次缓存运行12条全部复用，零网络请求。

| 实际操作 | 观察结果 |
| --- | --- |
| 从用户原驾驶链接刷新 | 保留X/Z、朝向与镜头；Y因18单位离底保护和0.1量化安全校正约0.1，不重置到预设站位 |
| 点击峡谷环境总览 | 新音频paused=false，导演音频paused=true；驾驶位置不动 |
| 峡谷六段连续播放 | 前三段先1×，第三段后段改2×；自然依次到第六段并结束，显示“六段环境导览已完成”，未跳章；航次仍第90分钟，个人报告仍0 |
| 手选海洋雪主题 | 标题、重点、选章与对应音轨匹配；与热液供食说明分开 |
| 播放中把本段进度移到尾部 | 音频currentTime=31.2、滑块=31.2、paused=true；避免暂停render覆盖用户定位值 |
| 关闭连续播放再重听 | 片尾按钮显示“重听这一段”；点击从本段开头实际播放 |
| 听讲时按R升高 | 音频继续播放；模型Y从约-205.3升到-192.7，航次仍90分钟，报告仍0；仅驾驶输入改变潜器 |
| 手机布局 | 390×844 CSS视口，无页面水平溢出；展开环境面板下缘约433，驾驶台上缘约489，无控制区域重叠；不是物理手机测试 |
| 驾驶中换热液航次 | 替换为热液六段、停止旧环境音轨，默认暂停；点击后热液实际播放，导演仍暂停 |
| 从环境讲解进入导演 | 环境音轨从paused=false变为true，环境面板隐藏，导演显示；没有两条旁白同时播放 |

环境层复用 `director-core.mjs`、`narration-player.mjs` 与音频缓存；不导入场景渲染或调用相机动作。`environment-location.mjs` 是两张教学地形的粗位置说明适配器，不计为新增跨主题核心。

## 可复跑检查

```powershell
node projects/017-abyss-expedition/src/check-environment-narration.mjs --decode
node projects/017-abyss-expedition/src/check-environment-location.mjs
node projects/017-abyss-expedition/src/check-narration.mjs
node projects/017-abyss-expedition/src/check-narration-player.mjs
node projects/017-abyss-expedition/src/check-director.mjs
node projects/017-abyss-expedition/src/check-pilot.mjs
node projects/017-abyss-expedition/src/check-delivery.mjs
python scripts/projects.py check
```

新音轨全部经过ffprobe与ffmpeg完整解码，API/解码时长一致，文本、配置指纹、字节数、SHA-256和双清单一致，音量非静音，无私密字段。生成器dry-run不联网，不自动重试；缓存复跑也零请求。本轮没有重放旧的两部完整导演影片，不把音轨解码校验称为全部浏览器流程覆盖。

截图：[桌面环境导览](../assets/environment/01-canyon-environment.jpg)、[窄屏边听边驾驶](../assets/environment/02-mobile-listening.jpg)。
