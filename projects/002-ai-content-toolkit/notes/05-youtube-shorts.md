# AI YouTube Shorts Generator 如何从长视频找片段

它处理已经存在的长视频。与短视频工厂重新组合素材的方式不同，它先判断原片哪些段落值得截取，再裁成适合短视频的画幅。

## 工作过程与两种模式

语音转录产生带时间的信息，LLM 根据转录选择候选片段，再进行筛选和画面裁切。当前文档提供命令行、Python 接口及 JSON 输出。

- 默认 `api` 模式使用 MuAPI，需要对应密钥。
- `local` 模式将下载、转录和裁切放到本机，但高光筛选仍使用 OpenAI 或 Gemini。Python 3.10+、FFmpeg 和本地转录依赖需要另外准备。

`local/llm.py` 确实创建云端模型客户端，因此 local 不能解释为全程离线。

## 从代码中看到的限制

`local/clipper.py` 使用 OpenCV 检测人脸，倾向跟随最大的人脸，并用 FFmpeg 处理音视频。对多人物切换、屏幕录制和无人物镜头的效果需要专门验证。

已检查的这个模块没有将字幕烧录到画面的步骤。README 提到的 SRT 缓存说明有转录文件，并不能据此确认最终视频一定带可见字幕。

## 第一次实验

用一段自有的 5 分钟讲解视频，先人工标出两个完整观点，再请求生成两个片段。比较起止时间、意思是否完整、画面是否裁掉关键信息，并单独检查字幕。片段评分是模型排序依据，不能直接视为真实传播效果。

**理解检查**：语音识别负责“说了什么”，片段筛选负责“哪段值得截取”；这两步分别可能犯什么错误？

运行状态：未安装、未调用 API、未生成视频。版本和来源见下方。

## 固定版本与来源

### 讨论补充：核心内容与二次创作

更准确的理解是：ASR 把原片语音转成带时间的文字，LLM 阅读后提出剪辑区间，程序按时间截取原画面与原声。当前提示偏向适合传播的开场、观点、冲突、故事和实用内容，不必然代表全片最重要的部分。这里的二次创作主要体现为选段与重新构图；已核对主流程不改写新文案、不重新配音、不生成新画面。效果页和原理页均加入这一讨论说明。

### 第五篇深入补充（2026-10-23）

沿用下方固定 commit，未安装运行，不声称覆盖最新版。其价值是从原来的长视频提取可以独立呈现的片段，节省通看、粗选与改画幅的工作。它的主流程串联已有识别、语言模型和媒体组件，没有训练新的全能视频模型。

**输入与效果**：本地文件可在 local 模式直接读取，也可提供 YouTube URL；再设置数量、比例等。输出包括转录、候选标题／起止时间／评分／开场句／理由，以及最终成片路径或 URL。每个候选截取一个连续原片区间，各自成片；本地保留原音轨，不要求新文案或 TTS。

**与 Short Video Factory 的区别**：前者先生成新配音，再随机抽素材凑长度；本工具先识别原片声音，再让模型读带时间的文字来选区间。它增加了文本内容判断，但选段 LLM 没有收到视频帧，不能等同于完整的视听理解。

**从识别到选段**：本地 faster-whisper 输出 start、end、text，并写 SRT 缓存；模型先根据前 25 段、最多 3000 字符样本判断类型和密度，再从带起点秒数的转录提议候选。提示侧重开场吸引力、情绪、冲突、转折和实用性，倾向 45–90 秒，允许特殊情况更短或更长。完整表达和长度都是提示目标，不是可靠性保证。

**候选规则**：格式清洗跳过无效时间，限制结束位置与 0–100 分数。按分数从高到低处理：如果与已保留片段重叠超过当前候选自身长度的 50%，则丢弃。它是时间去重，不是不同时间表达相同观点的语义去重。之后取前 N 个，数量不保证足额；单片失败返回空 clip_url 和错误，条目数不等于成功数。

**两种裁切**：时间裁切回答“保留哪几十秒”；空间裁切回答“这几十秒里保留画面哪一块”。本地先用 FFmpeg 截出连续区间，再用 OpenCV Haar 人脸检测器选最大脸，通过 0.15 平滑系数移动中心。首次无脸居中，之后无脸沿用上一中心，窗口受边界限制。最终把原音轨合回去。它没有关联声音与脸，最大脸未必是讲话者；幻灯片、手势、产品也可能被裁掉。云端模式提交视频 URL、起止时间和比例给 autocrop，无法从客户端推断服务内部实现。

**字幕与网络**：本地 SRT 是转录缓存，已读渲染没有烧录字幕；标题和开场句也是元数据，不等于文字已叠到画面。local 的媒体处理在本机，但转录会发给 OpenAI 或 Gemini 选段，权重准备和下载也可能联网。api 模式通过 MuAPI 执行主要远程步骤。

**长片静态风险**：达到 1800 秒启动分块，名义块长 1200 秒、步长 1140 秒，选入段落允许结束位置额外延伸。源码保留了块内转录的原片绝对时间，却按块时长清洗模型返回时间，合并又加偏移，存在截断、丢弃或二次偏移的风险。此为静态代码判断，未用模型或长片运行复现；单独列为实验检查项，不能直接沿用 README 的无遗漏宣传。

**网页教学**：20 分钟访谈，两组人工候选 130–185 秒（55 秒）与 650–720 秒（70 秒）。切换显示对应转录节选、时间线与推荐理由；不生成模型评分。三张图分别解释时间戳定位、ASR／LLM／人脸检测的分工，以及竖屏可能裁掉演示板。

**验收重点**：先核对转录与候选，再检查成片头尾、观点条件、嘴型同步、裁切损失、字幕、失败率和返工工时。短片通过后再检验 30 分钟以上视频的分块时间。评分不直接等于播放量，运行耗时与费用均需真实记录。

研究日期：2026-10-20。Commit：`3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c`。GitHub 元数据中的许可证标识：`MIT`。

- [官方 README](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/README.md)
- [shorts_generator/local/clipper.py](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/local/clipper.py)
- [shorts_generator/local/llm.py](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/local/llm.py)
- [转录与 SRT 缓存](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/local/transcriber.py)
- [本地文件与下载入口](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/local/downloader.py)
- [候选判断、清洗、分块与去重](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/highlights.py)
- [两种模式的流程](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/pipeline.py)
- [云端裁切调用](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/clipper.py)
- [CLI 与 JSON 输出](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/main.py)

[返回研究总览](../README.md) · [实验记录](07-experiments.md)
