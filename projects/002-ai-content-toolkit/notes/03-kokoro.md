# Kokoro 如何把文稿转成语音

Kokoro 是语音合成模型及推理库，适合“文稿已经确定，需要把它读出来”的步骤。它不负责寻找资料、判断内容真假或选择视频画面。

## 工作过程

文本先经过语言相关的发音处理，再由模型结合音色生成音频。官方 Python 入口是 `KPipeline`，底层用 Misaki 做字形到音素的转换。README 示例输出采样率为 24 kHz 的 WAV。

`pipeline.py` 区分语言代码与音色，并对中文使用额外的 `misaki[zh]` 依赖。理解这一层有助于排查“有声音，但发音不对”的问题。

## 环境和成本

当前源码要求 Python `>=3.10,<3.14`。使用本地模型需要先取得权重和语言依赖；按语言与环境可能还需 eSpeak NG。模型可本地推理，不等于没有算力和部署成本。

## 第一次实验

先用短英文确认基础链路，再测试中文。中文样例分别包含普通句子、多音字、人名、数字、英文缩写和长句。记录错读、停顿、实际生成耗时及音频时长。第一次加载与后续生成分开计时。

**理解检查**：同一篇文稿读得自然，是否意味着其中的信息可靠？文案模型和配音模型各应负责什么？

## 与另外两个工具的关系

短视频工厂和 Podcastfy 都有自己的配音后端。若要换成 Kokoro，需要确认音频文件输入或实现相应接口。把两个说话人的声音轮流合成，也不等于自动得到一段自然对话；对话稿仍要另行组织。

Kokoro 运行状态：未下载模型、未用 Kokoro 合成音频。网页另有 MiniMax 生成的教学讲解，以及浏览器合成的周期短音；它们不计入 Kokoro 实测。版本和来源见下方。

## 深入到模型计算过程

网页中的第一篇深入讲解按以下顺序组织，见[交互原理页](../web/index.html#/tool/kokoro/principles)：

1. **文稿与音色**：`KPipeline` 管理语言处理与音色加载，音色来自风格张量，不是每次重新训练模型。
2. **音素化**：Misaki 将文本变为音素，`KModel` 再映射为编号。这样可以把“应该读什么音”与“怎样生成声音”分开理解。
3. **时长和韵律**：`forward_with_tokens` 编码输入，预测音素时长并建立对齐，还预测音高等声学信息。`speed` 在时长计算中参与运算。
4. **波形解码**：解码器结合对齐特征、声学预测和音色，产生音频采样值。
5. **保存和复核**：保存音频后试听，按错读、遗漏、停顿等维度评价。

这个分解依据 [`kokoro/model.py`](https://github.com/hexgrad/kokoro/blob/dfb907a02bba8152ca444717ca5d78747ccb4bec/kokoro/model.py)。它解释的是研究版本的推理过程，不是训练全过程。

### 怎样理解效果

[官方模型卡](https://huggingface.co/hexgrad/Kokoro-82M)描述模型为 82M 参数。这个数字表示模型规模，不代表音频时长或准确率。网页引入[官方英语样例](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/SAMPLES.md)，可先听停顿、音色一致性和长词发音。英语样例不能代替中文验证，也不能用来测量本机生成速度。

标准入口接受文本与音色，并没有直接提供“上传任意录音即可克隆”的完整流程。语言选择、音色选择和声音克隆应作为不同概念理解。

## 声音基础补充：波形、音色、向量与编码器

交互入口：[声音基础 · 图解试听](../web/index.html#/tool/kokoro/basics)。这是本次讨论的整理，通用编码器原理与 Kokoro 的已发布能力分开说明。

- **波形与存储**：麦克风把声压变化转换为电信号，采样按时间测量，量化用有限精度表示。PCM 音频保存采样值及格式信息。采样率不是基频，位深不是音色。
- **音高、响度、音色**：周期性与基频主要影响音高；能量及人耳感知影响响度；频谱结构、包络、噪声等共同影响音色。不同波形并不必然意味着不同音色。
- **人声的结构**：声带提供声源，声道改变不同频率成分的强弱。共振峰既与元音有关，也受说话人声道特征影响，因此无法把内容与音色按频段直接切开。
- **声音向量**：一组供特定模型使用的内部特征，不是按时间排列的音频采样值，也不是可逐维命名的物理参数。模型权重提供生成能力，声音向量提供条件，输出波形记录一次生成结果。
- **Kokoro 的实现**：官方 Kokoro-82M 配置中两部分风格维度各为 128。源码将前 128 维送入解码器，后 128 维用于韵律预测。声音包按音素序列长度选取向量；不是每个人只有一条永恒不变的向量。
- **典型编码器训练**：录音转短时声学特征，神经网络提取并汇总为向量。说话人验证目标要求同人不同句更相似、异人同句可区分，可以只用说话人标签，不依赖文字转录。损失反向传播更新参数；训练完成后的提取通常只是推理。
- **分离的局限**：向量可能携带情绪、口音、语速和录音环境。内容与说话人特征只是近似解耦；换一个编码器的输出也不能直接代入 Kokoro。
- **Kokoro 的边界**：官方模型卡说明未发布配套编码器。标准入口可以使用和混合现成声音条件，但没有任意参考录音到新音色的完整功能。这里的编码器流程不代表对未公开实现的复现。

### 配音与可复现资产

四段中文教学旁白由 MiniMax `speech-2.8-hd`、预设音色 `male-qn-qingse`、语速 0.95 生成，约 165 秒。它们不是 Kokoro 实测音频。

- 原稿：[src/narration.json](../src/narration.json)
- 音频与来源记录：[assets/audio/manifest.json](../assets/audio/manifest.json)，包含生成参数、文本、时长与文件哈希，不含密钥。
- 重建音频：`python scripts/generate_narration.py --env-file <项目外的配置文件>`。相同文本、参数和有效文件会复用已有结果。
- 网页只播放已生成的相对路径 MP3，不从浏览器请求 MiniMax。
- 波形实验按用户点击播放两秒周期音，淡入淡出，谐波变化时保持均方根能量一致。并不保证感知响度完全相等，不模拟完整人声。

依据：[ADI 采样与量化](https://wiki.analog.com/university/courses/electronics/text/chapter-20)、[OpenStax 声音感知](https://openstax.org/books/physics/pages/14-2-sound-intensity-and-sound-level)、[UNSW 人声声学](https://phys.unsw.edu.au/jw/voice.html)、[说话人编码器论文](https://arxiv.org/html/1806.04558v4)、[AutoVC](https://arxiv.org/abs/1905.05879)、[Kokoro 官方模型卡](https://huggingface.co/hexgrad/Kokoro-82M)。

## 固定版本与来源

研究日期：2026-10-20。Commit：`dfb907a02bba8152ca444717ca5d78747ccb4bec`。GitHub 元数据中的许可证标识：`Apache-2.0`。

- [官方 README](https://github.com/hexgrad/kokoro/blob/dfb907a02bba8152ca444717ca5d78747ccb4bec/README.md)
- [kokoro/pipeline.py](https://github.com/hexgrad/kokoro/blob/dfb907a02bba8152ca444717ca5d78747ccb4bec/kokoro/pipeline.py)
- [pyproject.toml](https://github.com/hexgrad/kokoro/blob/dfb907a02bba8152ca444717ca5d78747ccb4bec/pyproject.toml)

[返回研究总览](../README.md) · [实验记录](07-experiments.md)
