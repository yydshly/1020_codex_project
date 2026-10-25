# 两航次从出发到返航的完整验收

日期：2026-10-25。两条航次均完成从0播放到返航完成页的浏览器验收，各两轮：初轮发现问题，修正后再完整播放。另完成采水机位、手动交互与窄屏补查。自动检查、浏览器实播和操作抽查的范围分别记录如下。

原始结果：[full-voyage-geometry.json](full-voyage-geometry.json)、[51条浏览器公开DOM记录](full-voyage-browser.json)。内容与交互审查：[full-story-review.md](full-story-review.md)。此前的[可见高亮](verification-visible-cues.md)、[防穿透](verification-collision.md)、[设备](verification-equipment.md)和[学习体验](verification-learning.md)保留其当时范围。

## 本轮修复

1. **旁白与原理步骤共用时间计划。** 设备、热液循环、矿物烟囱、食物关系及总结不再按整章平均分步骤。10个原理／设备／总结章节使用43个精确文本短语与122个离线停顿锚点，文字、部件和三维步骤共同查询同一旁白时刻。设备首句对应船上人员，后续灯光、声呐、推进器、耐压浮力、脐带、机械臂和采水瓶各有对应时段；热液循环章不提前展示下一章的矿物析出。
2. **站点切换与连续潜航分开。** 换到另一个观察站使用明确的时间切换，把潜器放到新站验证过的安全观察位；不再把跨越岩壁的直线插值当作真实航行。出发下潜和最终返航保留连续动作。
3. **返航真的移动潜器。** 返航章驱动潜器上浮并到达船侧回收位，镜头再呈现母船、潜器和缆线；不再只有镜头离开海床而载具留在原站。
4. **镜头方式不改变载具任务。** `motionFraming`保存作者航段，用户把观察镜头改成全景、环绕或返航景别，只改变观察方式，不触发潜器重新下潜或提前回收。
5. **位置与水深说明清楚。** 驾驶台区分“潜器所在”和“镜头看哪里”，远处观察有“返回潜器”入口。模型地形余量不是海水水深。现场章节读站点元数据并标“站点设计水深 · 非实测”；出发／返航显示进度，不把模型Y换算成米数；独立原理舞台隐藏该水深栏。
6. **操作与暂停边界统一。** 章节下拉先暂停再定位；seek释放手动原理覆盖并取消未完成的独立设备／采水动作。打开概念面板不会在背后继续提交采水演示。采样记录仍是本轮临时学习会话，不自动写个人航次报告。
7. **说明与当前短语留在眼前。** 学习卡固定显示当前步骤名和解释，仅按钮列表与附加操作区滚动；底部保留完整旁白并高亮当前短语。恢复播放后画面重新跟随旁白。
8. **播放链接跟随跨章。** 自动进入新章时更新`film`参数，不逐帧写地址；分享链接仍在指定章节起点暂停打开。
9. **自由操控保留。** 独立镜头仍可旋转、平移、缩放；主动“看清”只切换观察镜头。返回镜头与驾驶输入保留安全校验。选过章节或进度输入后，第一次方向长按可直接转移焦点并操纵；输入框键盘编辑、菜单、弹窗与后台失焦仍停止驾驶。
10. **四个采水机位改为近景。** 修正热液A／B、峡谷A／B的镜头距离和角度，让采水站进入可辨认的画幅，减少潜器和现场物件遮挡；保留原站位、载具动作和音轨。峡谷B还单独检查了章末定格，见[末镜](../assets/full-voyages/closeup-canyon-B-end.jpg)。
11. **已采水章节重访不再显示未完成。** 暂停定位到已采过的B章，采水入口显示“重新演示”，完成说明与本轮记录一致；重访不新增记录，也不把演示写入个人报告。

本轮没有改变原科学旁白、重新生成MiniMax音轨或虚构检测结果。上述短语时刻来自停顿检测、标点启发式关联与区间插值，**不是逐词强制对齐，也没有逐词误差保证**。

## 自动全航次结果

`check-full-voyages.mjs`在内存中提取实际场景函数、几何、镜头规划与学习舞台，使用实际MP3清单决定章节长度。桌面连续检查采用约24帧／秒采样；下表数字均来自已保存的JSON，不是浏览器渲染帧率或实际潜航时长。

| 检查项 | 范围与结果 |
| --- | --- |
| 完整章节 | 两航次各11章，共22章 |
| 连续采样 | 14,664帧；热液311.2秒、峡谷298.5秒的教学影片时钟 |
| 主世界安全 | 所检查帧`unsafeFrames=0`，载具与相机均满足保守碰撞约束；独立教学舞台分域处理 |
| 主体进入视锥 | `invisibleFrames=0`，每个检查帧至少有指定主体的网格包围盒进入视锥 |
| 物件与地形视线 | 95次物理主体视线抽查，`occludedSamples=0`；至少一个抽查主体点未被地形挡住 |
| 手机构图切换 | 390宽视口，22章各起点／中点／终点，共66次安全与主体视锥检查 |
| 镜头方式覆盖 | 180次临时景别检查；载具位置最大变化0，朝向保持不变，相机和载具仍安全 |
| 暂停 | 各章结束后重复零时间步查询，潜器位姿与相机不继续推进 |
| 船侧回收 | 两航次均到达各自母船回收位：结束Y为438，距回收位0模型单位 |

“进入视锥”不等于画面质感已达标；“视线抽查通过”不等于所有分枝、按钮、字幕和部件都同时清楚。连续采样也不是任意帧率、任意用户镜头和任意硬件的数学证明。这些边界须结合下方浏览器记录判断。

### 采水站大小与遮挡补查

最新JSON另保存四个采水站的包围盒投影高度与真实网格射线探针。高度按720像素参考画面归一化，最小值覆盖该章连续采样；探针只在章首、章末取设备前16个网格的顶点，先检查是否入镜，再检查从相机发出的射线首先命中的是否为该采水站。射线障碍集包含现场道具、上下文物件和潜器；地形遮挡由上面的独立视线抽查处理。

| 采水章 | 包围盒最小高度／首中末高度（参考像素） | 真实网格可见探针：章首→章末 |
| --- | --- | --- |
| 热液A `vents-investigate` | 131.9／131.9、175.1、242.5 | 15/16 → 15/16 |
| 热液B `vents-background` | 132.1／132.1、175.2、242.5 | 16/16 → 16/16 |
| 峡谷A `canyon-sediment` | 139.0／139.0、186.0、260.2 | 15/16 → 15/16 |
| 峡谷B `canyon-channel` | 139.0／139.0、185.9、260.2 | 13/16 → 16/16 |

四章均达到检查设定的120参考像素和端点至少75%探针可见阈值。包围盒高度不是实际可见轮廓像素；探针也不是全表面、全时段逐像素遮挡测量，不能仅凭此保证读数文字或全部机械细节清楚。近景实看与章末截图用于补充判断。

自动检查与学习内容命令：

```powershell
node projects/017-abyss-expedition/src/check-full-voyages.mjs
node projects/017-abyss-expedition/src/check-director-lesson-cues.mjs
node projects/017-abyss-expedition/src/check-learning-content.mjs
node projects/017-abyss-expedition/src/check-narration-player.mjs
```

首个命令会更新本目录的`full-voyage-geometry.json`。其余检查验证短语计划、真实音轨SHA、内容契约及播放器行为；不会调用新的TTS生成或改写现有音轨。

## 浏览器完整播放与22章画面证据

两片以2倍速从0开始，各完整播放两轮。修正后的完整轮为`app.js?v=66`：热液在311.2秒、峡谷在298.5秒到达完成页，均显示本轮演示水样2/2、个人航次报告0；潜器回到母船回收位，播放停止，返航进度100%。`film`分别为`vents-depart`、`canyon-depart`，没有再停留在上一章。初轮与修正轮的DOM状态均保存在上方JSON。

之后的`app67`仅调整四个采水机位，分别实播两片的A→B→对照，记录依次0→1→2，并补查峡谷B章末镜头。`app68`再修正已采样章重访文案；热液B手动采水后进入对照，再回到B章，保持暂停、记录1/2、报告0，显示“重新演示”。最终用户页已加载`app68`，以1倍速从水面开场播放，音频`readyState=4`且未暂停，见[当前运行画面](../assets/full-voyages/final-running.jpg)。这不是把最后版本的局部复验写成第三轮完整播放。

下表以实际DOM的`chapter`、`title`、`film`对应章节；表内序号从1开始，DOM的`chapter`从0开始。全部22章已连续实播；截图是抽帧及必要的暂停回看，并非逐帧录屏。文件名只是拍摄标签，例如`final-vents-01`实际为设备章，不能当作第1章证据。峡谷第9、10章采用完整播放后的补回看。

| 章 | 热液之境：实际章节与截图 | 峡谷回声：实际章节与截图 |
| --- | --- | --- |
| 01 | `vents-establish` [出发前，先带上三个问题](../assets/full-voyages/review-vents-01-launch.jpg)（补回看） | `canyon-establish` [去峡谷，要弄懂哪三件事](../assets/full-voyages/final-canyon-01.jpg) |
| 02 | `vents-equipment` [潜器带什么，船上做什么](../assets/full-voyages/final-vents-02.jpg) | `canyon-equipment` [潜器带什么，船上做什么](../assets/full-voyages/final-canyon-02.jpg) |
| 03 | `vents-approach` [下到海床，先找裂缝](../assets/full-voyages/final-vents-03.jpg) | `canyon-wall` [先看岩壁和谷底在哪里](../assets/full-voyages/final-canyon-03.jpg) |
| 04 | `vents-fluid` [地下的水怎样变成热液](../assets/full-voyages/final-vents-04.jpg) | `canyon-habitat` [生物的住处包括什么](../assets/full-voyages/final-canyon-04.jpg) |
| 05 | `vents-discover` [黑烟和烟囱是怎样形成的](../assets/full-voyages/final-vents-05.jpg) | `canyon-coral` [珊瑚怎样在黑暗里取食](../assets/full-voyages/final-canyon-05.jpg) |
| 06 | `vents-life` [食物怎样从细菌到管虫](../assets/full-voyages/final-vents-06.jpg) | `canyon-sediment` [先取靠近台面的A瓶水](../assets/full-voyages/closeup-canyon-A-start.jpg)（机位修正后） |
| 07 | `vents-investigate` [先取喷口外缘的A瓶水](../assets/full-voyages/closeup-vents-A-start.jpg)（机位修正后） | `canyon-channel` [再取深谷侧的B瓶水](../assets/full-voyages/closeup-canyon-B-live.jpg)（机位修正后） |
| 08 | `vents-background` [再取远处的B瓶水](../assets/full-voyages/closeup-vents-B-live.jpg)（机位修正后） | `canyon-compare` [比较之前先核对条件](../assets/full-voyages/final-canyon-08.jpg) |
| 09 | `vents-compare` [两瓶水要怎样比较](../assets/full-voyages/final-vents-09.jpg) | `canyon-sponges` [再看另一种住在海床的生命](../assets/full-voyages/review-canyon-09.jpg)（补回看） |
| 10 | `vents-summary` [哪些已知，哪些还没证明](../assets/full-voyages/final-vents-10.jpg) | `canyon-summary` [把照片、样本和答案分开](../assets/full-voyages/review-canyon-10-pending.jpg)（补回看） |
| 11 | `vents-depart` [带着记录返航](../assets/full-voyages/final-vents-11-complete.jpg)（完成页） | `canyon-depart` [沿标记回船，留下下一问](../assets/full-voyages/final-canyon-11-complete.jpg)（完成页） |

两轮实播用于确认叙事流程、章节切换、音轨播放、对应步骤及返航结果。没有逐字听感误差保证，也没有以2倍速播放声称标准语速下每个字与动作均已强制对齐。

## 手动交互与窄屏抽查

以下记录明确标出使用的场景。峡谷的设备、对话框、驾驶和镜头测试覆盖共享UI实现，不据此给热液另记一次独立实测。

| 范围 | 实际操作与结果 |
| --- | --- |
| 峡谷：设备独立演示 | 手动选择第6项设备运行约4秒，影片时钟保持26.4秒；手选机械臂后seek到36.3秒，画面回到声呐，对应旁白短语正确，旧手动覆盖已释放。 |
| 峡谷：采水与弹窗 | A手动采水未完成时打开基础概念，动作取消、记录保持0；关闭面板重试完成，记录1、报告0。概念面板打开时按W约700毫秒，潜器未移动。 |
| 两片：机位后的自动采水 | A→B→对照均实播，记录0→1→2；对照解锁且报告保持0。章首静态定位与章末静看不自行生成样本，见[峡谷B末镜](../assets/full-voyages/closeup-canyon-B-end.jpg)。 |
| 热液：已采章节重访 | `app68`手动完成B水样、进入对照、再重访B，时钟暂停、记录1/2、报告0，按钮与完成说明显示已采过并可“重新演示”，见[重访画面](../assets/full-voyages/review-vents-B-revisit.jpg)。 |
| 峡谷：总结与分析边界 | 手动查看“本轮记录”“待分析”，可停留阅读。恢复播放后交还旁白步骤由适配器回归覆盖，本项浏览器只记录手动阅读。样本编号与条件显示，未伪造实测成分或化验结论。 |
| 峡谷：首次长按驾驶 | 选择输入控件后首次长按R可直接驾驶，模型Y从-207.9变为-186.9。 |
| 峡谷：自由镜头 | 独立拖动改变相机，潜器位姿不变；随后R仍可驾驶。主动对准岩壁时出现远处观察说明，“返回潜器”恢复跟随且不搬动潜器。 |
| 峡谷：地形碰撞 | 长按F约2800毫秒到模型Y=-208.4、地形余量0；再按F约1400毫秒坐标保持不变，没有继续穿入海床。此处数字是模型坐标／余量，不是实测海深。 |
| 390×844视口 | 查看[设备](../assets/full-voyages/mobile-equipment.jpg)、[热液循环](../assets/full-voyages/mobile-hydrothermal.jpg)、[展开对照](../assets/full-voyages/mobile-comparison.jpg)、[总结](../assets/full-voyages/mobile-summary.jpg)。热液上涌第4步可见裂缝、热源、反应标记；当前说明、步骤操作和底部旁白仍可读取。属于桌面窄视口验证。 |

所有站位、水深、读数、流线、粒子、距离及临时样本均为教学模拟或设计数据。两瓶同类水样的对照保留深度、时间与位置差异；没有把画面或模拟记录当作真实海域的新观测、化验或因果结论。物理手机、全部显卡与异常网络路径不由桌面浏览器或纯计算检查替代。
