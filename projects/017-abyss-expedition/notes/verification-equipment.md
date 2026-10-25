# 随潜器下潜的设备与工作分工 · 2026-10-25

在两条任务开场之后各加入一章设备讲解，旧二十章ID与旁白保持不变。当前每条11章、共22章；热液311.2秒（5:11.2），峡谷298.5秒（4:58.5）。

## 设备如何支持调查

八项依次解释：灯光与相机提供影像，声呐/导航与传感器辅助判断周边及记录条件，推进器负责移动/转向/悬停，固体浮力材料与耐压舱承托并保护设备，脐带供电/传令/回传，机械臂操作与持取，随身水瓶封存样本，船端控制组与绞车/吊架组织布放回收。

无人潜器不载人，人员留在母船。黄色外形表示固体浮力材料，不是氧气瓶；耐压舱保护电子设备。随身小瓶架与本演示预先布放的A/B大型海床采水架分开说明。声呐波纹、数据粒子与导航头是工作方式示意，不表示真实测量或定位算法的输出。

解释与资料入口依据 [NOAA ROV介绍](https://oceanexplorer.noaa.gov/technology/subs-rovs/)、[NOAA声呐](https://oceanexplorer.noaa.gov/technology/sonar/)、[NOAA CTD](https://oceanexplorer.noaa.gov/technology/ctd/) 与 [WHOI机器人耐压](https://www.whoi.edu/ocean-learning-hub/ocean-facts/how-do-ocean-robots-take-the-pressure/)。

## 实现与复用

- `web/rendering/rov-system.mjs` 提供共享ROV工厂，普通科考场景与设备教学使用同一模型定义；增加可见声呐面板、导航/传感头和缆线终端。材料实例隔离，设备高亮和耐压剖视不会污染普通潜器。
- `learning-world.mjs` 的equipment舞台提供八项高亮、专用机位和动作。船端控制台是放大的教学工作台，正常母船仍使用research-vessel模型。
- `scene.setEquipmentDemoTime(seconds|null)`只覆盖设备动画时钟。UI点击「运行设备4秒」暂停电影与语音，独立显示声波、推进水流、缆线双向粒子、夹爪或瓶盖；恢复放映、换章、退出及隐藏页面时取消独立动作。
- 「概念与设备」提供基础概念/设备清单两页。设备卡回答任务问题、用途与画面中位置，并可打开三维设备讲解。

## 配音与已验收范围

本次新增两段真实MiniMax音频，旧20段哈希缓存复用，无force或失败重试。设备音轨49.536/50.040秒，派生镜头50.6/51.1秒；22个MP3共9,423,096字节、586.584秒语音。全部通过完整ffmpeg解码、ffprobe/API时长、非静音、正文、文件哈希与清单一致性检查，私钥未进入公开文件。

桌面实际操作声呐、双向缆线、机械臂和随身瓶。四秒演示完成后电影仍为25.6秒，音轨仍为0秒且暂停，教学水样0/2、个人报告0。点击电影「继续」后，手动第8项正确回到影片当时的第1项，声音同时恢复。

两条航次的新增设备章节均实际完整播放，通过后可自动进入普通海底任务。设备运行中点击下一章会取消独立动作；从耐压剖视退出后，普通潜器的外壳与黄色浮力体恢复正常材质、灯光和导航头可见，声音暂停，个人报告仍为0。

390×844视口的clientWidth/scrollWidth均为390。设备选择、四秒机械臂演示、清单页签以及清单→三维设备讲解的跳转已实际操作。手机运行中影片保持25.6秒且旁白暂停。步骤在窄屏横向排列，换章与调整窗口后会保持当前项可见；设备面板的运行按钮在桌面与手机上均可操作。

最终运行日志没有新增error/warn。纯核心、采样会话、22章内容契约、八组设备清单/来源、MP3和静态链接检查通过。22段音轨均全解码检查通过，但本轮没有再次从头重播两个五分钟整片；此前20章完整流程检查与本轮新增设备章节检查共同界定验收范围。

桌面截图：[设备首视图](../assets/equipment/01-first.jpg)、[声呐](../assets/equipment/02-sonar.jpg)、[脐带](../assets/equipment/03-tether.jpg)、[机械臂](../assets/equipment/04-arm.jpg)、[随身水瓶](../assets/equipment/05-bottles.jpg)、[船端协作](../assets/equipment/06-ship-support.jpg)、[耐压剖视](../assets/equipment/10-pressure.jpg)、[恢复普通潜器](../assets/equipment/11-normal-rov.jpg)。手机截图：[总览](../assets/equipment/07-mobile-equipment.jpg)、[机械臂](../assets/equipment/08-mobile-arm.jpg)、[设备清单](../assets/equipment/09-equipment-list.jpg)。这是浏览器CSS视口检查，不代表物理手机设备测试。
