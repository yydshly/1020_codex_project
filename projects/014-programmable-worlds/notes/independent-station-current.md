# 独立第二场景 · 旧船坞与运河车站

记录日期：2026-10-25，Asia/Shanghai。run 标识保留原 UTC 时间。

**当前事实：独立新作的完整功能已通过，正式首页与手机嵌入已通过；视觉判断单独记录。** 最终引导图已绑定正式报告并经 CPU 七区排版复核；整体交付状态以[交付记录](delivery-acceptance.json)为准，功能、视觉和布局证据保留各自范围。

用户此前指出旧 `window/story` 实际共用一套运河老街，这一指出成立；原先将两种模式扩大为两件独立作品的交付范围错误不撤回，见[范围纠正](scope-correction-20261024.md)。原作实时展示也不计入我们制作的两件作品。

## 实际空间与可操作的事件

老街窗景为 `sceneId=canal-street`，位于 `web/canal-real/`；新作 `sceneId=shipyard-station` 位于 `web/shipyard-station/`。新空间另建滑道、上岸修理船、门吊、绞盘、拱顶候船厅、机械票机、临水站台、约 40 米宽航道、工业桥、仓棚、烟囱和水塔。基础 CC0 材质、Three.js 和部分水/反射算法可以复用；旧老街模型、R5 光照图、机位路线及漂信剧情没有充作本站场景。

发出信号后，新的 6 米钢木客船在约 22 秒内真实驶近、转向并靠泊，栈桥展开。可以用约 7 秒经过栈桥，站上开放艉甲板随船离开；也可以留在岸上目送约 32 秒的离站过程。暂停会保持实际船位与经过时间，上船后的相机随实际客船移动并保留观看方向。作品只在自己的 `shipyard-station:journey-v1` 键中记录已完成次数和上次选择，不读写其他站点数据。

## 当前模型与光照绑定

| 数据 | 当前实值 | 边界 |
| --- | --- | --- |
| 精确新源 | SHA-256 `1438d3aee0e5a99edcda3426340d4e814313136049055094aaaf14d35d640690` | 新船坞车站源，不是老街源 |
| 新运行模型 | 4,389,940 字节；SHA-256 `1655d4c60ba1c3c1b41d3e71e5ff4d66e081ac92e1e52642b9bad93b7f03b265` | 与老街 `819b849b252ff22970c66e6349cf9eb4f470ad1ec775260e355ab2480c7da227` 不同 |
| 新 lighting fingerprint | `62d64e53da7ccf5775e19ee4c704a2c3c105a7dafa9bae52fbc8cce8d889610c` | 独立光向、灯具布局与积分数据 |
| 当前 manifest | [manifest-oak2048.json](../web/shipyard-station/baked-r1/manifest-oak2048.json)；SHA-256 `97eb5a39b308d200f0011f9732725a812b7794cca48553178a11e4841b0f882e` | 23 组完整漫反射数据：22 组各 128 样本，oak 单组 2048 真实样本 |
| 运行修订 | `shipyard-oak2048-aftdeck-2`；输入修订 `station-manual-input-2` | 样本数和哈希用于追溯版本，不作为画质判断 |

oak 局部重积分保留了同一源、UV、灯具、材质、随机种子和反弹设置，未覆盖原 128 样本记录；它针对实际候船厅 diffuse 暖色离群亮点。动态客船、栈桥与水不进入静态 GI 包：船的主要舱壁、屋顶和甲板使用限定范围的几何接触遮蔽，仅作用于间接漫反射，直接阴影及镜面反射继续实时计算。薄玻璃、漆面、锌栏杆与木面各有不同响应。

## 实际验收与先后顺序

| 时点 / 原始记录 | 结果 | 证明范围 |
| --- | --- | --- |
| [全流程 `18-17-51-965Z`](station-functional.d3d11.json) | 功能 `passed`，15 项；记录内 `lighting.accepted=false` 原样保留 | 四机位、真实驾驶、暂停、22 秒靠泊、7 秒上船、32 秒离站、上船/留岸两结局、390×845 与 640×521 独立页、释放 |
| [独立页视觉原始复核](visual-acceptance-independent.standalone.md) | 后续视觉判断通过 | 实际 pilot、两结局和独立页窄屏；不扩大为首页嵌入已通过 |
| [当前视觉记录](visual-acceptance-independent.md)与[版本绑定](../web/shipyard-station/visual-review.json) | 与功能分开记录 | 通过来自实际看图；模型、manifest、运行修订只绑定所看版本 |
| [正式首页完整 `18-38-15-177Z`](hub-two-worlds-acceptance.d3d11.json) | `passed`，18 项；`candidateOverride=false`，活动文档/重场景峰值 `1/1` | 原作→老街→新车站→老街，真实项目内 native pointer 与按键、呼船/暂停/重置；请求 375/390 宽的实际 376/390×845 嵌入 idle 和 docked 四组，控件互不遮挡 |

后续正式首页报告捕获到新场景 `lighting.accepted=true`，来源是后来独立视觉记录与模型、光照、manifest 和运行修订绑定一致。它不能反向把早先功能记录的 false 改成 true，也不把生产 manifest 内保留的制作阶段 `artworkQualityAccepted=false` 改写。功能报告、制作数据、后续视觉判断和正式入口记录按各自时点解释。

## 两次正式入口失败及修复

原始失败没有改成通过；最终 18 项来自一次新的完整正式入口运行。

1. [原始 `18-29-33-944Z`](../assets/hub-qa/d3d11/2026-10-24T18-29-33-944Z/acceptance.json) 为 `failed`：合成 pointer 触发 `setPointerCapture` 时没有浏览器活动 pointer，抛出 `NotFoundError`。生产监听对捕获失败作兼容处理，最终检查改用本任务隐藏 webContents 的实际 native mouse 输入，再验证固定相机转向和持续按键移动；没有发送系统键鼠或操作用户桌面。
2. [focused mobile 原始 `18-35-03-197Z`](../assets/hub-qa/d3d11/2026-10-24T18-35-03-197Z/acceptance.json) 为 `failed`，同一失败副本保留在 [notes 报告](hub-two-worlds-mobile-acceptance.d3d11.json)：请求 375 宽、实际 376 宽时，父页面“独立打开”浮层覆盖 reset，父 badge 又与子页面 hint 重叠。只在作品 B 的 `concept-station` 范围隐藏父浮层，保留下方入口与子场景自己的操作；样式版本为 `20261025-station-preview-controls-1`。原作和作品 A 不受此调整影响。

最终 [完整正式报告](../assets/hub-qa/d3d11/2026-10-24T18-38-15-177Z/acceptance.json) 同时重走桌面切换与手机 idle/docked，重叠面积为零，控件可点、没有横向溢出。旧 focused 失败不单独“转绿”，也不拿 standalone idle 代替嵌入 docked。

## 保留的制作期和未通过画面

`assets/shipyard-station-qa/2026-10-24T16-30-39-097Z/` 为 `gi=0` 源导出预览，离线 Cycles proof 也只用于制作判断，不是网页背景或最终实时验收。首轮完整 GI pilot `2026-10-24T17-43-41-413Z` 确认新空间独立，但视觉未通过：船顶遮挡登船视线、木面暖色亮斑、客船材质和接触遮蔽不足。之后修复开放艉甲板眼位、船主边倒角和局部遮蔽，并对 oak 重积分；实际通过与修正依据见视觉记录，不由 CPU probe 数量推断。

大制作中间文件原路径 `D:/codex/tmp/014-shipyard-20261024/` 继续保留；正式模型与压缩光照在 F 盘项目内。本轮没有磁盘清理，没有读取或修改 ReflectFlow，没有操作用户桌面。最终引导图已在固定真实报告后生成，并用 CPU 栅格化逐区核对排版；[七区布局记录](../../../.cache/014-guide-qa/guide-independent-20261025-layout-review.json)只判断图文排版，不代替运行或画质验收。全项目最终状态见[交付记录](delivery-acceptance.json)。
