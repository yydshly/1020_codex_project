# Short Video Factory 如何把素材组合成短视频

它是一款桌面应用，将文案生成、配音、视频拼接和字幕组合在同一流程中。官方描述的输入包含提示词和视频分镜素材，因此适合已有素材、需要重复制作视频的情况。

## 效果：已有素材变成带口播和字幕的成片

例如五段自有水杯素材，配上一份已核对的介绍稿，输出包含画面、口播、字幕和可选背景音乐的视频。网页提供 12 秒教学时间轴，可切换人工匹配与可能错配的镜头组合。画面使用文字卡片表示，未调用模型、播放音频或实际渲染。

它适合素材风格较一致、需要重复制作口播混剪的场景。实际价值要看可用率与返工时间，不能只看批量产量。官方 README 有作者视频示例，未将其当作本机结果。

## 工作过程

可以按“确定内容 → 生成文稿 → 合成语音 → 组织画面 → 渲染成片”理解。与从零生成画面的模型不同，混剪的关键问题是素材选择、顺序和时长匹配。

源码显示文案模块可以调用 OpenAI 兼容等模型端点；Edge TTS 模块连接微软语音服务的网络地址。桌面界面在本机运行，不代表文案和配音都在本机计算。

## 能力边界

2026-10-23 深入核对同一固定 commit 后，补充修正：README 仍列有更多字幕样式／特效计划，但当前代码已有透明 PNG 字幕帧生成、视频叠加、字幕开关与可选 SRT 导出。不能据路线图推断当前没有字幕能力，也不能因此认定所有规划特效已完成。

### 选片是随机规则，不是语义检索

`Home/index.vue` 先取得正文、合成语音，然后将实际 TTS 时长传给 `VideoManage.getVideoSegments`。这个函数随机选择视频、起点和片段长度，通常取 2–15 秒；短素材和最后剩余部分允许小于 2 秒。候选用完仍不够长，就重新选取可用素材；不可读素材会被跳过。

已检查函数没有接收文稿、图像向量或语义匹配评分。因此它解决“画面够不够长”，并没有像 DigUp 一样按意思检索镜头。预先筛选相关素材尤其重要。

### 模型、字幕与渲染各自负责什么

1. 文案模块通过配置端点调用已有 LLM，内置提示输出可朗读正文，提醒不编造参数、价格与效果，但并不自动核实事实。
2. Edge TTS 使用网络服务生成音频与 WordBoundary 数据。字幕将偏移和时长换算成毫秒，并按停顿等规则组织为 SRT；不是先合成再运行 ASR。
3. 字幕渲染服务在隐藏窗口中按时刻布局和绘制，将字幕输出为透明 PNG 序列，供 FFmpeg 叠加。12 秒、30 fps 对应 360 个帧位置，仅为数量计算，不是存储或性能实测。
4. FFmpeg 用 `trim → setpts → scale/pad → fps → concat → overlay` 等操作处理画面，按配置导出。当前路径等比缩放并补边，不是自动跟踪人物裁切。
5. 画面拼接不包含素材原声；声音来自配音与可选 BGM，分别响度处理后以 `amix` 混合。响度归一化不等于动态音乐闪避。研究版本编码使用 H.264 / AAC。

字幕资产不存在时仍有 FFmpeg 字幕滤镜回退。烧录字幕成为视频像素，另存 SRT 则保留时间文本，二者不是相同产物。字体、换行、遮挡与边界时间仍需检查。

### 和 Podcastfy 相比，新增难点是时间线

两个工具都可使用现成模型写稿、配音，主路径不需要训练新的模型。短视频工厂还必须处理画面时长、画幅、字幕布局和编码。更强的 LLM 无法直接修复缺失镜头、随机错配、字幕遮挡或渲染失败。

改稿或改变语速可能改变实际音频长度，后续画面覆盖和字幕应重新对齐。主界面还管理批处理、取消和阶段状态，但“流水线自动运行”不代表“每条成片都可用”。

当前仓库许可证标识为 AGPL-3.0，见证据清单中的许可信息；不要把它与另外几个项目的 MIT 或 Apache-2.0 混在一起。

## 第一次实验

给出同一段自写文案和五段自有视频，尝试制作一条 30 秒视频。逐项查看配音是否完整、画面是否对应语义、字幕是否同步、成片是否可播放。记录为了达到可用质量，手工修改了多少次。

先标注每个素材可表达的含义；记录实际配音时长和抽取片段，再统计内容匹配、重复镜头、字幕错字／错时和画面留边。固定其他条件仅改变语速进行第二次对照。分开记录模型等待、TTS、字幕帧与 FFmpeg 耗时；30 秒是实验目标，不是时长保证。

**理解检查**：如果素材与文稿不相关，自动剪辑能否仅靠更多生成次数弥补？

## 值得学习的设计

它最适合研究“如何把多个组件包装成一项可重复任务”。流程中的每个阶段都应该有明确产物，失败后才能重做某一步，而不是重新生成全部内容。

运行状态：未安装、未渲染视频。版本和来源见下方。

## 固定版本与来源

初步研究：2026-10-20；深入核对：2026-10-23。沿用 Commit：`bc32e3515b38df548ff0608f7325b7806e8cfa20`，不是对最新版本的声明。GitHub 元数据中的许可证标识：`AGPL-3.0`。

- [官方 README](https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/README.md)
- [electron/lib/edge-tts.ts](https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/electron/lib/edge-tts.ts)
- [src/lib/llm/providers.ts](https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/lib/llm/providers.ts)
- [package.json](https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/package.json)
- [Home/index.vue：任务主流程](https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/views/Home/index.vue)
- [VideoManage.vue：随机选片规则](https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/views/Home/components/VideoManage.vue)
- [generate.ts：流式文案生成](https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/lib/llm/generate.ts)
- [prompts.ts：文案提示](https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/lib/llm/prompts.ts)
- [字幕帧导出服务](https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/electron/effect-engine/subtitle-render-service.ts)
- [字幕单帧绘制](https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/effect-engine/renderer/subtitle-render-runtime.ts)
- [FFmpeg 合成与编码](https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/electron/ffmpeg/index.ts)

## 讨论补充：输入、TTS 与剪辑的关系

- 视频素材可以是完整视频或预剪短片；文案／写作资料是另一项输入。不能把“导入视频”理解成自动识别并总结视频。
- TTS 生成配音后，程序测得总时长，再按规则抽取足够的画面；TTS 本身不执行剪辑。字幕使用 TTS 的词语时间信息，和选片使用总时长是两回事。
- 网页用 20 秒配音搭配 6＋9＋5 秒片段说明流程，明确这些位置与时长是人工教学例子。
- 当前流程无需先做视频语义标注；人提前筛选同主题、可互换的素材，是为了提高可用率。逐句匹配镜头需要额外人工安排或视觉理解与匹配模块。
- 核心价值是批量自动混剪与流程自动化，评价应包括可用成片比例和返工时间。单段长视频也只是素材，不自动意味着能找到精彩片段。

[返回研究总览](../README.md) · [实验记录](07-experiments.md)
