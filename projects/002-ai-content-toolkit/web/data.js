window.RESEARCH = {
  "date": "2026-10-20",
  "tools": [
    {
      "id": "kokoro",
      "name": "Kokoro",
      "short": "语音合成",
      "type": "单一模型",
      "level": 1,
      "repo": "hexgrad/kokoro",
      "depth": "deep",
      "note": "03-kokoro.md",
      "headline": "一段文字，怎样变成声音？",
      "summary": "语音合成模型及推理库，将文字转为音素，结合音色条件预测时长与韵律并生成语音波形。",
      "reason": "先理解一个模型只负责一项能力，再看多个组件如何组合。",
      "input": "文稿 + 语言 + 音色",
      "output": "语音波形 / WAV",
      "environment": "Python ≥3.10、<3.14；模型权重与语言依赖。",
      "network": "权重和依赖准备好后可本地推理",
      "cost": "本机算力；使用第三方托管时另计 API 费用",
      "mechanism": "发音处理 → 时长与韵律 → 波形解码",
      "example": {
        "input": "“今天我们用一个小实验，理解文字怎样变成声音。”",
        "output": "一段朗读这句话的音频，声音取决于所选音色和参数。",
        "note": "这是一组说明性输入输出；下面的试听来自作者官方样例，不是这句话的本机合成结果。"
      },
      "samples": [
        {
          "title": "官方英语介绍样例",
          "caption": "聆听句间停顿、长词发音和整段音色的一致性。此样例不能代表中文效果。",
          "url": "https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/samples/HEARME.wav",
          "source": "https://huggingface.co/hexgrad/Kokoro-82M/blob/main/SAMPLES.md"
        }
      ],
      "capabilities": [
        {
          "title": "把现成文稿读出来",
          "body": "KPipeline 接受文本、音色和语速，逐段产出音频。可以在程序中循环处理多段文本。",
          "source": "kokoro/pipeline.py"
        },
        {
          "title": "按语言处理发音",
          "body": "语言前端使用 Misaki；中文入口为 z，并需要中文依赖。语言和音色应匹配。",
          "source": "kokoro/pipeline.py"
        },
        {
          "title": "选择音色和控制语速",
          "body": "音色文件被加载为风格张量；speed 参与模型的时长计算。具体听感仍需试听。",
          "source": "kokoro/model.py"
        }
      ],
      "boundaries": [
        "它不负责写文稿或核实事实。读得流畅，不代表内容正确。",
        "标准推理入口加载音色张量；它并不是“上传任意录音即可克隆声音”的现成功能。",
        "中文多音字、人名、数字、混合英文和长句必须单独测试。",
        "推理库、模型权重、音色文件和语言依赖是不同部分；只安装一个 Python 包不代表准备全部完成。"
      ],
      "stages": [
        {
          "title": "文稿与语言",
          "tag": "准备",
          "body": "选择语言代码、音色与文本。语言决定前端如何处理发音；音色提供声音风格。两者不是同一个参数。",
          "input": "文字、语言代码、音色名称",
          "output": "待处理的文本段与音色张量",
          "code": "KPipeline · load_voice",
          "source": "kokoro/pipeline.py"
        },
        {
          "title": "文字转音素",
          "tag": "语言前端",
          "body": "Misaki 将文字转换成表示发音的音素。模型随后看到的是音素对应的编号，而不是直接朗读屏幕上的汉字或字母。",
          "input": "文本段",
          "output": "音素序列",
          "code": "KPipeline.g2p",
          "source": "kokoro/pipeline.py"
        },
        {
          "title": "预测时长与韵律",
          "tag": "神经网络",
          "body": "模型编码音素，结合风格信息预测每个音素的时长，再预测音高等信息。speed 参与时长计算，影响节奏。",
          "input": "音素编号 + 风格张量",
          "output": "对齐后的特征、音高等预测",
          "code": "KModel.forward_with_tokens",
          "source": "kokoro/model.py"
        },
        {
          "title": "解码为波形",
          "tag": "声音生成",
          "body": "解码器把文本特征、音高预测和音色风格转成音频采样值。到这里才有可以被保存和播放的声音数据。",
          "input": "对齐特征 + 声学预测 + 音色",
          "output": "音频波形",
          "code": "self.decoder(...)",
          "source": "kokoro/model.py"
        },
        {
          "title": "保存与试听",
          "tag": "交付",
          "body": "官方示例把输出保存为 24 kHz WAV。试听错读和停顿，再决定是否重写文稿或调整参数。",
          "input": "音频采样值",
          "output": "可播放的 WAV 文件",
          "code": "soundfile.write",
          "source": "README"
        }
      ],
      "insights": [
        {
          "title": "82M 说明规模，不直接说明效果",
          "body": "官方模型卡称模型拥有 8200 万参数。它不是音频时长、下载体积或“准确率”。质量仍需在目标语言与文本上验证。",
          "source": "https://huggingface.co/hexgrad/Kokoro-82M"
        },
        {
          "title": "音色不是把整套模型换掉",
          "body": "KPipeline 单独加载音色张量，并缓存已加载音色。核心 KModel 可以被多个语言 pipeline 复用，避免重复分配模型。",
          "source": "kokoro/pipeline.py"
        },
        {
          "title": "语速不只是播放器倍速",
          "body": "模型内部用 speed 调整预测时长，随后才生成音频。网页播放器的倍速则作用于已经生成的音频，两者应分别比较。",
          "source": "kokoro/model.py"
        }
      ],
      "experiment": {
        "title": "用六类句子检验“读得出来”与“读得正确”",
        "material": "准备普通句子、多音字、人名、数字、英文缩写和长句各一条；先做英文基础链路，再测中文。",
        "steps": [
          "固定模型、音色与设备，保留输入原文。",
          "分别记录首次加载和后续生成时间。",
          "逐句试听，标记错读、遗漏、重复和异常停顿。",
          "改变一个参数后重试，比较可听差别。"
        ],
        "metrics": [
          "错读与遗漏",
          "音频时长",
          "生成耗时 / 音频时长",
          "峰值内存",
          "人工修正次数"
        ],
        "next": "本机安装并合成一组可复现的中英文样本。"
      },
      "quiz": [
        {
          "question": "Kokoro 会帮我判断文稿中的事实是否正确吗？",
          "answer": "不会。文稿的内容判断属于研究和编辑环节，Kokoro 的核心任务是把文本转为声音。"
        },
        {
          "question": "把语言设成中文，就能使用任意英语音色吗？",
          "answer": "语言前端和音色是不同输入。应按官方音色与语言配置配对，不能把“能加载”当作“发音正确”。"
        },
        {
          "question": "一次生成失败，应该先调更大的模型吗？",
          "answer": "先定位失败阶段：依赖和权重、发音处理、推理，还是文件保存。只有分清环节，才能有针对性地处理。"
        }
      ],
      "extras": [
        {
          "label": "官方模型卡",
          "url": "https://huggingface.co/hexgrad/Kokoro-82M"
        },
        {
          "label": "官方音色说明",
          "url": "https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md"
        },
        {
          "label": "Kokoro-82M 风格维度配置",
          "url": "https://huggingface.co/hexgrad/Kokoro-82M/blob/main/config.json"
        },
        {
          "label": "ADI：采样与量化",
          "url": "https://wiki.analog.com/university/courses/electronics/text/chapter-20"
        },
        {
          "label": "OpenStax：音高、响度和音色",
          "url": "https://openstax.org/books/physics/pages/14-2-sound-intensity-and-sound-level"
        },
        {
          "label": "UNSW：人声声学与共振峰",
          "url": "https://phys.unsw.edu.au/jw/voice.html"
        },
        {
          "label": "说话人编码器与多说话人 TTS（2018）",
          "url": "https://arxiv.org/html/1806.04558v4"
        },
        {
          "label": "AutoVC：内容信息瓶颈（2019）",
          "url": "https://arxiv.org/abs/1905.05879"
        },
        {
          "label": "官方在线体验",
          "url": "https://huggingface.co/spaces/hexgrad/Kokoro-TTS"
        }
      ],
      "evidence": {
        "requested_repository": "hexgrad/kokoro",
        "repository": "hexgrad/kokoro",
        "url": "https://github.com/hexgrad/kokoro",
        "branch": "main",
        "commit": "dfb907a02bba8152ca444717ca5d78747ccb4bec",
        "commit_date": "2025-08-06T22:28:53Z",
        "license": "Apache-2.0",
        "readme_url": "https://github.com/hexgrad/kokoro/blob/dfb907a02bba8152ca444717ca5d78747ccb4bec/README.md",
        "inspected_files": [
          {
            "path": "kokoro/pipeline.py",
            "url": "https://github.com/hexgrad/kokoro/blob/dfb907a02bba8152ca444717ca5d78747ccb4bec/kokoro/pipeline.py"
          },
          {
            "path": "pyproject.toml",
            "url": "https://github.com/hexgrad/kokoro/blob/dfb907a02bba8152ca444717ca5d78747ccb4bec/pyproject.toml"
          },
          {
            "path": "kokoro/model.py",
            "url": "https://github.com/hexgrad/kokoro/blob/dfb907a02bba8152ca444717ca5d78747ccb4bec/kokoro/model.py"
          }
        ]
      },
      "runtime": "not-run"
    },
    {
      "id": "digup",
      "name": "DigUp",
      "short": "本地检索",
      "type": "检索系统",
      "level": 2,
      "repo": "ARahim3/DigUp",
      "depth": "deep",
      "note": "01-digup.md",
      "headline": "不知道文件名，也能找回内容。",
      "summary": "本地内容检索工具，将文件分片编码为语义向量并结合关键词索引，按描述返回文件及页码或时间位置。",
      "reason": "在单一模型之外，理解索引、存储和查询怎样配合。",
      "input": "文件夹 + 自然语言查询",
      "output": "文件 / 页码 / 时间点",
      "environment": "Apple Silicon Mac / macOS 14+；Windows 10/11 x64 与 Linux 为 beta。Windows 安装包自带运行组件，不要求用户安装 Swift。",
      "network": "官方说明索引和搜索在本机；首次模型下载、更新检查联网",
      "cost": "模型约 865 MB（研究版本）；首次索引算力、索引空间和后续更新成本",
      "mechanism": "文件拆分 → 768 维向量 + FTS5 → 校准、融合与定位",
      "example": {
        "input": "“找那张海边有一只狗的照片。”",
        "output": "可能找到名称为 IMG_0831.jpg 的图片；搜索文档或音视频时还可返回页码或时间点。",
        "note": "文件名与下方案例均为教学示意，不是本机搜索结果；实际命中率仍待实验。"
      },
      "capabilities": [
        {
          "title": "按内容描述找素材",
          "body": "图片和声音不必先变成完整文字转录。对应编码路径产生语义向量，可与文字查询进行比较；“看起来像”或“谈到某话题”属于相关性检索。",
          "source": "Sources/LlamaRuntime/LlamaEmbedder.swift"
        },
        {
          "title": "定位文件内部",
          "body": "每个片段保存所属文件、片段种类及位置。PDF 记录页码，音视频记录时间，代码记录行范围。命中位置不是模型临时猜出来的。",
          "source": "Sources/DigUpKit/IndexStore.swift"
        },
        {
          "title": "补上编号和名称",
          "body": "FTS5 检索文件名、路径及已提取的文字，向量负责语义，关键词帮助处理编号、名称等精确信息。最终还结合词覆盖率和文件类型提示排序。",
          "source": "Sources/DigUpKit/Searcher.swift"
        },
        {
          "title": "持续更新本地索引",
          "body": "索引同步比较文件大小、修改时间和类型，对新增或变化文件排队处理；重命名或移动在满足识别条件时可以复用索引。删除文件后清理索引记录，不是删除原文件。",
          "source": "Sources/DigUpKit/Indexer.swift"
        },
        {
          "title": "单独搜索代码",
          "body": "代码检索需显式启用，使用独立索引和 code: 查询入口。既可按功能描述找代码，也可查名称；打开行号仍取决于编辑器支持。",
          "source": "Sources/DigUpKit/Model.swift"
        },
        {
          "title": "本机执行模型推理",
          "body": "使用预训练嵌入模型生成向量；索引你的文件不等于训练一个新模型。模型、索引与界面是不同组件。",
          "source": "Sources/LlamaRuntime/LlamaEmbedder.swift"
        }
      ],
      "boundaries": [
        "研究版本：Windows/Linux beta 没有 Mac 的截图文字 OCR；画面语义可检索，不代表截图里的错误码能精确检索。旧 .doc、RAW、SVG 的读取支持也有平台差异。",
        "模型支持多语言不代表中文效果已经验证。官方说明评测主要覆盖英语、孟加拉语和阿拉伯语，关键词路径没有中文等无空格语言的专门分词。",
        "只处理选定范围内且被规则支持的文件；代码需单独开启。未下载到本地的云端占位文件、被排除的类型或解析失败文件可能没有索引。",
        "长文件可能仍处于部分索引状态；音视频按窗口或抽帧读取，片段级命中不能保证精确到一句话或所有瞬间。",
        "打开到页码或时间点取决于查看器/播放器支持；不支持定位参数的应用可能从文件开头打开。",
        "相关性分数不是正确概率。它不负责回答事实问题、生成新素材或核实内容真伪；可能误报、漏报，也可能没有结果。",
        "“本地处理、不上传文件”是官方说明，本研究没有进行网络行为审计。第一次模型准备和建索引的成本应与后续查询分开记录。"
      ],
      "stages": [
        {
          "title": "扫描与切片",
          "tag": "首次 / 增量索引",
          "body": "在选定目录按规则扫描。图片形成图像片段；PDF 按页；文档按文字块；音频按重叠窗口；视频分别准备画面和声轨。为每个片段保留原文件位置。",
          "input": "允许索引的本地文件",
          "output": "片段 + 文件路径 + 位置",
          "code": "Indexer.sync / prepare",
          "source": "Sources/DigUpKit/Indexer.swift"
        },
        {
          "title": "编码与保存",
          "tag": "预训练模型推理",
          "body": "EmbeddingGemma 2 经 llama.cpp 产生归一化的 768 维向量。SQLite 保存文件、片段与向量，FTS5 保存可检索文字。不是每个片段都一定有向量，例如文件名仅用于关键词。",
          "input": "文字、图像或音频片段",
          "output": "向量 + 关键词索引 + 位置元数据",
          "code": "LlamaEmbedder / IndexStore",
          "source": "Sources/DigUpKit/IndexStore.swift"
        },
        {
          "title": "编码你的查询",
          "tag": "每次搜索",
          "body": "普通查询加 search result 任务前缀；代码查询使用 code retrieval 前缀。查询与文件内容不是相同字符串，但进入兼容的向量空间后才能比较。",
          "input": "描述或编号",
          "output": "查询向量 + 查询词",
          "code": "Prompts.query / codeQuery",
          "source": "Sources/DigUpKit/Model.swift"
        },
        {
          "title": "两路检索与融合",
          "tag": "相关性排序",
          "body": "逐条计算向量相似度并校准不同模态的分数，同时用 FTS5 找关键词。再按语义显著程度、词覆盖率、查询类型等融合，保留每个文件最匹配的片段。",
          "input": "查询向量和词 + 已有索引",
          "output": "通过阈值的文件候选及排序",
          "code": "Searcher.score / meaning / search",
          "source": "Sources/DigUpKit/Searcher.swift"
        },
        {
          "title": "返回并打开位置",
          "tag": "结果",
          "body": "从片段记录读取路径、页码或时间范围、摘录。关键词摘录与返回位置要对应；代码还可寻找定义行。结果为空也是合法情况。",
          "input": "选中的片段记录",
          "output": "文件 + 位置 + 可用摘录",
          "code": "SearchHit / codePlace",
          "source": "Sources/DigUpKit/Searcher.swift"
        }
      ],
      "insights": [
        {
          "title": "向量的目的变了：从“声音条件”到“相关性比较”",
          "body": "Kokoro 使用风格向量控制生成；DigUp 的向量用来比较内容。EmbeddingGemma 2 把不同模态映射到共享空间。都是数字数组，不意味着维度、意义或用途可以互换。",
          "source": "https://huggingface.co/google/embeddinggemma-2"
        },
        {
          "title": "索引是可更新的目录，不是把文件塞进模型权重",
          "body": "文件记录保留路径、大小、修改时间和处理状态，片段记录保留位置和向量。文件更新时同步索引，不是重新训练嵌入模型。模型版本与索引也要保持兼容。",
          "source": "Sources/DigUpKit/IndexStore.swift"
        },
        {
          "title": "每段 768 个数，但不是 768 个主题标签",
          "body": "维度是学习得到的表示，不能逐项当成“狗”“海边”等标签。此版本以 float16 存储，单个向量负载为 768 × 2 = 1,536 字节；总索引还包括文字、位置及数据库开销。",
          "source": "Sources/DigUpKit/Vectors.swift"
        },
        {
          "title": "当前实现逐条比较，不必假设背后有大型向量数据库",
          "body": "Searcher 将存储的向量分块转成 float32，做矩阵与查询向量的乘法。归一化后点积对应余弦相似度；工作量随片段数增长，不能把小规模表现外推到任意数据量。",
          "source": "Sources/DigUpKit/Searcher.swift"
        },
        {
          "title": "为什么不能直接拿图片和文字的原始分数混排",
          "body": "不同模态的相似度分布可能不同。meaning 会做模态均值校准，再使用共同尺度；小模态组回退到总体均值。最终融合分数只用于排序，不是“有多少概率正确”。",
          "source": "Sources/DigUpKit/Searcher.swift"
        },
        {
          "title": "为什么分片影响能否找到细节",
          "body": "一整本书只保留一个主题表示，可能淹没局部段落。分片保留局部信息与位置，但会增加向量数量；重叠可以缓解边界切断，也会增加处理量。",
          "source": "Sources/DigUpKit/Indexer.swift"
        }
      ],
      "experiment": {
        "title": "20 个文件，12 个查询，分别验证“找到”与“定位”",
        "material": "单独准备 5 张图片、5 份 PDF/文档、4 段音频、4 段视频和 2 个截图。预先标出正确文件、页码或时间范围；不要把教学案例当作测试结果。",
        "steps": [
          "记录 Windows 版本、CPU/GPU、应用版本；只选择实验目录。分别计时模型准备、首次索引和索引完成状态。",
          "准备 5 个语义查询、5 个编号/名称查询；同义改写与中英改写分别记录，不混作一个指标。",
          "再加 2 个库中不存在答案的查询，检查是否出现误导性强结果。语义查询是否命中与编号是否完全相同分别判定。",
          "检查前五条结果及 PDF 页、音视频时间点；记录查看器是否支持打开位置。截图中的错误码作为 Windows OCR 限制的对照。",
          "新增、修改、移动并删除一个测试副本，检查索引更新及旧结果是否消失；保留耗时和失败记录。"
        ],
        "metrics": [
          "前五条命中数 / 10",
          "首位命中数 / 10",
          "正确页码 / 时间范围",
          "无答案查询误报数 / 2",
          "首次索引耗时与大小",
          "查询耗时与增量更新延迟"
        ],
        "next": "下一步在隔离实验目录安装并运行 Windows beta；本页当前仅完成文档与代码研究。"
      },
      "quiz": [
        {
          "question": "文件名不含“海边”，为什么仍有机会被找到？",
          "answer": "图片内容与文字查询经过模型进入共享语义空间。找的是内容相关性，不要求文件名包含描述；仍可能误判或漏检。"
        },
        {
          "question": "索引我的文件，是否是在训练一个私人模型？",
          "answer": "不是。这里使用现成模型做推理，把结果写入索引。模型权重与索引记录是不同的数据。"
        },
        {
          "question": "分数 0.8 或 3.2，表示 80% 或 320% 正确吗？",
          "answer": "都不是。原始余弦、校准分数和最终融合分数的含义不同，都不能直接解释成正确概率。"
        },
        {
          "question": "为什么记住文件还不够，还要记住片段位置？",
          "answer": "向量只帮助排序。实际跳到某页、某一秒，需要索引时保存路径、片段类型和位置元数据。"
        },
        {
          "question": "Windows 上能搜到截图内容，就能精确搜到图里的编号吗？",
          "answer": "不一定。图像语义检索与 OCR 后关键词检索是两条能力；此研究版本的 Windows/Linux 没有 Mac 的截图文字 OCR。"
        }
      ],
      "extras": [
        {
          "label": "EmbeddingGemma 2 官方模型卡",
          "url": "https://huggingface.co/google/embeddinggemma-2"
        },
        {
          "label": "作者演示（仓库 README）",
          "url": "https://github.com/ARahim3/DigUp#readme"
        },
        {
          "label": "研究版本 Windows / Linux beta 发布页",
          "url": "https://github.com/ARahim3/DigUp/releases/tag/v0.7.0-beta.2"
        }
      ],
      "evidence": {
        "requested_repository": "ARahim3/DigUp",
        "repository": "ARahim3/DigUp",
        "url": "https://github.com/ARahim3/DigUp",
        "branch": "main",
        "commit": "7db9537712995d14e50e0e44baa00f721b98f1c6",
        "commit_date": "2026-10-18T05:27:36Z",
        "license": "MIT",
        "readme_url": "https://github.com/ARahim3/DigUp/blob/7db9537712995d14e50e0e44baa00f721b98f1c6/README.md",
        "inspected_files": [
          {
            "path": "Sources/DigUpKit/Searcher.swift",
            "url": "https://github.com/ARahim3/DigUp/blob/7db9537712995d14e50e0e44baa00f721b98f1c6/Sources/DigUpKit/Searcher.swift"
          },
          {
            "path": "Sources/DigUpKit/Indexer.swift",
            "url": "https://github.com/ARahim3/DigUp/blob/7db9537712995d14e50e0e44baa00f721b98f1c6/Sources/DigUpKit/Indexer.swift"
          },
          {
            "path": "Sources/DigUpKit/Model.swift",
            "url": "https://github.com/ARahim3/DigUp/blob/7db9537712995d14e50e0e44baa00f721b98f1c6/Sources/DigUpKit/Model.swift"
          },
          {
            "path": "Sources/DigUpKit/IndexStore.swift",
            "url": "https://github.com/ARahim3/DigUp/blob/7db9537712995d14e50e0e44baa00f721b98f1c6/Sources/DigUpKit/IndexStore.swift"
          },
          {
            "path": "Sources/DigUpKit/Vectors.swift",
            "url": "https://github.com/ARahim3/DigUp/blob/7db9537712995d14e50e0e44baa00f721b98f1c6/Sources/DigUpKit/Vectors.swift"
          },
          {
            "path": "Sources/DigUpKit/Extractors.swift",
            "url": "https://github.com/ARahim3/DigUp/blob/7db9537712995d14e50e0e44baa00f721b98f1c6/Sources/DigUpKit/Extractors.swift"
          },
          {
            "path": "Sources/LlamaRuntime/LlamaEmbedder.swift",
            "url": "https://github.com/ARahim3/DigUp/blob/7db9537712995d14e50e0e44baa00f721b98f1c6/Sources/LlamaRuntime/LlamaEmbedder.swift"
          }
        ]
      },
      "runtime": "not-run"
    },
    {
      "id": "podcastfy",
      "name": "Podcastfy",
      "short": "对话播客",
      "type": "内容流水线",
      "level": 3,
      "repo": "souzatharsis/podcastfy",
      "depth": "deep",
      "note": "06-podcastfy.md",
      "headline": "把资料改写成一段能听的对话。",
      "summary": "播客制作工作流，先提取资料并由语言模型改写成分角色对话，再调用语音后端配音合并。",
      "reason": "在已经理解配音后，增加“先改写、再合成”的两段式工作流。",
      "input": "网页 / PDF / 文本等资料",
      "output": "对话稿 + 播客音频",
      "environment": "Python 3.11+，Python API 或命令行；音频导出需可用的 FFmpeg，网页提取还涉及 Playwright 浏览器依赖。",
      "network": "资料获取、提示模板、LLM、TTS 分别检查；is_local 只切换文稿 LLM",
      "cost": "文稿输入输出 token、TTS 文本量、长文重复上下文、本地算力及人工审稿；实际费用待测",
      "mechanism": "资料提取 → 对话生成 → 语音合成与拼接",
      "example": {
        "input": "一篇解释“关键词搜索和语义搜索区别”的文章。",
        "output": "带 Person1 / Person2 标签的对话稿，以及按角色配音、合并后的音频文件。",
        "note": "下方提供人工编写的改编示例；不是 Podcastfy 生成结果，未调用任何模型或语音 API。"
      },
      "capabilities": [
        {
          "title": "把不同来源交给不同提取器",
          "body": "网页提取正文，PDF 读取文本，YouTube 获取字幕；图片在支持的非本地文稿路径中作为图像输入。不同格式不是同一种“阅读”方式。",
          "source": "podcastfy/content_parser/content_extractor.py"
        },
        {
          "title": "控制对话的角色和表达",
          "body": "配置语言、风格、角色、结构与用户要求，作为提示条件交给 LLM。同一文稿模型可写两个角色，不要求两个 Agent 实时交流。",
          "source": "podcastfy/content_generator.py"
        },
        {
          "title": "先审稿，再单独配音",
          "body": "transcript_only=True 返回生成的文稿路径；之后用 transcript_file 直接进入音频阶段，避免审稿前就付出全部配音成本。",
          "source": "podcastfy/client.py"
        },
        {
          "title": "选择语音后端与两种合成路径",
          "body": "普通路径逐段配音并按顺序拼接，多说话人路径则把对话交给支持的后端再合并返回音频块。并非所有后端具备相同能力。",
          "source": "podcastfy/text_to_speech.py"
        },
        {
          "title": "长文本分段，携带前文继续写",
          "body": "longform 按字符量和句子边界切分，逐段调用模型，把已生成对话放入后续上下文，再拼接并清理角色标签。",
          "source": "podcastfy/content_generator.py"
        },
        {
          "title": "从主题补充资料",
          "body": "topic 路径调用带 Google Search grounding 的 Gemini，再将返回文本交给文稿生成。这是另一条联网输入路径，不等于已核实全部事实。",
          "source": "podcastfy/content_parser/content_extractor.py"
        }
      ],
      "boundaries": [
        "语言流畅、两人互相赞同，都不能证明内容真实。改写、举例与幽默可能带入无依据断言；源码清理标签不等于事实核查。",
        "YouTube 路径依赖可取得的字幕，并非下载视频后识别全部画面和声音；没有字幕、链接形式或接口变化可能导致失败。",
        "PDF 提取器调用 get_text，未见自动 OCR；扫描件可能读不到正文。它按本地文件路径打开，不能把所有 PDF URL 都当作已验证入口。",
        "研究版本 longform 不接受图片；本地 LLM 路径不传入图片。中文生成也需要文稿语言和 TTS 音色同时支持。",
        "长文切分使用英文句号加空格作为句子边界；中文或缺少该分隔符的文本可能形成过大块。目标块数和最小字符量不是时长或上下文安全保证。",
        "is_local 切换到本地 Llamafile 文稿后端；提示模板仍有 hub.pull 调用，Edge TTS 和主题搜索仍联网，不能直接宣称全离线。",
        "普通音频路径主要是顺序拼接，不自动保证自然抢话、统一响度或专业混音。当前多说话人分支还硬编码英语模型及声音，需核对实际服务可用性。",
        "本次检查的语音模块未将 Kokoro 列为现成后端。替换需要适配分角色输入、音色选择、返回音频格式与错误处理。"
      ],
      "stages": [
        {
          "title": "准备来源",
          "tag": "提取",
          "body": "网页由浏览器获取 HTML 并清理，PDF 提取文本，YouTube 拉取字幕；来源文本在客户端合并。图片通过支持图像的文稿路径处理。先检查有没有漏正文。",
          "input": "资料或主题",
          "output": "正文 / 字幕 / 图像输入",
          "code": "process_content / ContentExtractor",
          "source": "podcastfy/client.py"
        },
        {
          "title": "组织提示",
          "tag": "条件",
          "body": "拉取指定版本提示模板，加入语言、角色、对话结构、风格及用户指令。角色描述控制“怎么讲”，不是训练两个人格模型。",
          "input": "资料 + 节目设置",
          "output": "模型消息与提示参数",
          "code": "__compose_prompt / compose_prompt_params",
          "source": "podcastfy/content_generator.py"
        },
        {
          "title": "生成对话",
          "tag": "LLM 推理",
          "body": "标准路径调用一次文稿链；长文路径分段调用并携带已有对话。返回字符串后清理标记，长文合并连续同角色块，保存文稿。",
          "input": "提示 + 资料",
          "output": "Person1 / Person2 文稿",
          "code": "StandardContentStrategy / LongFormContentStrategy",
          "source": "podcastfy/content_generator.py"
        },
        {
          "title": "分角色配音",
          "tag": "TTS 推理",
          "body": "普通路径解析角色文本，给两类片段选声音，逐段调用 TTS。多说话人路径将整段对话交给对应服务。事实错误应在此之前人工修正。",
          "input": "核对后的稿件 + 声音设置",
          "output": "语音片段或多说话人音频块",
          "code": "convert_to_speech / _generate_audio_segments",
          "source": "podcastfy/text_to_speech.py"
        },
        {
          "title": "合并与导出",
          "tag": "音频处理",
          "body": "普通路径按轮次和角色排序后用 Pydub 顺序相加，导出音频；多说话人路径合并服务返回的块。之后检查漏句、错读、接缝和响度。",
          "input": "有序音频片段",
          "output": "音频文件路径",
          "code": "_merge_audio_files",
          "source": "podcastfy/text_to_speech.py"
        }
      ],
      "insights": [
        {
          "title": "三个工具，三个不同的核心动作",
          "body": "Kokoro 生成声音，DigUp 编码内容以供检索，Podcastfy 用 LLM 改写资料后再调用 TTS。这里主要是生成式工作流，没有在已检查主路径中为用户资料建立向量检索库。",
          "source": "podcastfy/client.py"
        },
        {
          "title": "两位主持人不等于两个独立推理的 Agent",
          "body": "Person1 / Person2 是输出稿件的角色标记，普通模式由同一文稿生成链写出双方台词。相互追问与赞同可以只是文稿结构。",
          "source": "podcastfy/content_generator.py"
        },
        {
          "title": "角色与音色是两个层面的设置",
          "body": "roles_person1 / roles_person2 描述谁总结、谁追问；default_voices 决定声音。改角色需要改稿，换音色通常只需对已有稿件重新配音。",
          "source": "podcastfy/conversation_config.yaml"
        },
        {
          "title": "默认配置是一份研究版本快照",
          "body": "配置文件给出的文稿模型是 gemini-2.5-flash，TTS 默认 openai / tts-1-hd。不是固定唯一选择，也不是对当前端点可用性和价格的验证。",
          "source": "podcastfy/config.yaml"
        },
        {
          "title": "分段可以延长输出，也会增加上下文成本",
          "body": "长文路径把已有对话带入后续调用，帮助衔接，也会增加重复输入和上下文压力。分段不是事实检索或记忆无损压缩，长节目仍可能重复、遗漏、偏题。",
          "source": "podcastfy/content_generator.py"
        },
        {
          "title": "审稿是可插入的人工步骤",
          "body": "transcript_only 与 transcript_file 支持拆开执行；程序没有保证自动停下来让人批准，也没有自动事实核查。需要主动采用先审稿、再合成的使用方式。",
          "source": "podcastfy/client.py"
        }
      ],
      "experiment": {
        "title": "固定资料和稿件，分开验证改写与配音",
        "material": "准备 800 字自写中文说明文、五个事实、两个易错术语，以及一份人工审阅稿。",
        "steps": [
          "记录 commit、提示模板版本、文稿模型、语言、TTS 与声音设置。只生成标准模式对话稿。",
          "逐条对照五个事实，标出遗漏、无依据的数字或故事、重复；人工修订并保留原稿和修订稿。",
          "通过 transcript_file 为同一修订稿配音，目标约两分钟，实际时长单独记录。检查每句是否保留、角色是否正确及术语发音。",
          "固定稿件后再换声音，区分音色差异和文稿差异；需要长文时另测中文切分与上下文衔接。"
        ],
        "metrics": [
          "事实保留数 / 5",
          "无依据断言数",
          "漏句与错角色数",
          "两个术语的发音",
          "文稿 / TTS 分阶段耗时和用量",
          "实际音频时长与人工修订时间"
        ],
        "next": "尚未安装或调用服务。先验证中文稿件，再验证音频，不将官方样例当作本机结果。"
      },
      "quiz": [
        {
          "question": "两个人听起来在讨论，就说明用了两个 Agent 吗？",
          "answer": "不是。主路径由文稿生成链写出两个角色的台词，再分配声音。对话形式不能证明独立推理或实时交流。"
        },
        {
          "question": "换音色会自动修正稿件里的错误吗？",
          "answer": "不会。音色影响怎么说，错误事实需要先改稿，再重新合成受影响的内容。"
        },
        {
          "question": "is_local 是否表示整个播客流程离线？",
          "answer": "不是。资料获取、Hub 提示模板、主题搜索和 TTS 都要分别检查。本地 LLM 只改变文稿推理后端。"
        },
        {
          "question": "YouTube 没有字幕，它就会自动看视频吗？",
          "answer": "已检查提取器通过字幕 API 读取文本，没有看到自动转录或逐帧分析的回退路径。"
        },
        {
          "question": "先设定两个中文角色，就必定得到自然中文音频吗？",
          "answer": "还需要支持中文的文稿与语音模型、合适音色、正确稿件和衔接。配置意图不等于生成效果已验证。"
        }
      ],
      "extras": [
        {
          "label": "作者提供的音频案例与原始资料",
          "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/README.md#audio-examples-"
        }
      ],
      "evidence": {
        "requested_repository": "souzatharsis/podcastfy",
        "repository": "souzatharsis/podcastfy",
        "url": "https://github.com/souzatharsis/podcastfy",
        "branch": "main",
        "commit": "053b54a0917e35edb2808049499292361ccaae7b",
        "commit_date": "2026-05-04T14:49:10Z",
        "license": "Apache-2.0",
        "readme_url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/README.md",
        "inspected_files": [
          {
            "path": "usage/config.md",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/usage/config.md"
          },
          {
            "path": "usage/local_llm.md",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/usage/local_llm.md"
          },
          {
            "path": "podcastfy/text_to_speech.py",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/text_to_speech.py"
          },
          {
            "path": "pyproject.toml",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/pyproject.toml"
          },
          {
            "path": "podcastfy/content_generator.py",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/content_generator.py"
          },
          {
            "path": "podcastfy/content_parser/content_extractor.py",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/content_parser/content_extractor.py"
          },
          {
            "path": "podcastfy/client.py",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/client.py"
          },
          {
            "path": "podcastfy/config.yaml",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/config.yaml"
          },
          {
            "path": "podcastfy/conversation_config.yaml",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/conversation_config.yaml"
          },
          {
            "path": "podcastfy/content_parser/website_extractor.py",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/content_parser/website_extractor.py"
          },
          {
            "path": "podcastfy/content_parser/youtube_transcriber.py",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/content_parser/youtube_transcriber.py"
          },
          {
            "path": "podcastfy/content_parser/pdf_extractor.py",
            "url": "https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/content_parser/pdf_extractor.py"
          }
        ]
      },
      "runtime": "not-run"
    },
    {
      "id": "video-factory",
      "name": "Short Video Factory",
      "short": "素材混剪",
      "type": "多媒体工作流",
      "level": 4,
      "repo": "YILS-LIN/short-video-factory",
      "depth": "deep",
      "note": "04-short-video-factory.md",
      "headline": "文案、声音和画面，怎样合成一条视频？",
      "summary": "自动混剪工具，以配音时长为目标随机截取已有素材，再叠字幕、合成音乐并导出视频。",
      "reason": "在文字和声音之外加入画面、字幕、渲染和时间同步。",
      "input": "提示词 + 视频素材",
      "output": "混剪短视频",
      "environment": "Windows、macOS、Linux 桌面应用；源码使用 Electron。",
      "network": "文案模型端点与 Edge TTS 可产生网络请求",
      "cost": "模型调用、素材准备、渲染与人工调整时间",
      "mechanism": "文稿 → 配音与字幕 → 素材组织 → 视频渲染",
      "example": {
        "input": "五段自有水杯视频 + 一段已经核对的产品介绍。",
        "output": "以配音时长为基准，组合素材画面、字幕与可选背景音乐的短视频。",
        "note": "下面的时间轴为人工教学示例，不运行上游工具、不生成视频。主路径需要已有素材。"
      },
      "capabilities": [
        {
          "title": "调用现成模型写口播文案",
          "body": "配置模型端点和协议，流式生成正文，处理取消、超时和截断状态。内置提示要求不要编造参数，但提示不能代替事实核查。",
          "source": "src/lib/llm/generate.ts"
        },
        {
          "title": "同时取得配音和字幕时间信息",
          "body": "Edge TTS 返回音频与词边界数据；代码将边界时间转换为 SRT 字幕，并对连续的中日韩文字作连接处理。不是先录音再运行语音识别。",
          "source": "electron/lib/edge-tts.ts"
        },
        {
          "title": "按配音长度自动抽取素材",
          "body": "随机选取文件、随机起点和片段长度，累计达到配音时长。候选用完后可重新取用；不可读素材会跳过。它解决时长覆盖，不保证语义匹配。",
          "source": "src/views/Home/components/VideoManage.vue"
        },
        {
          "title": "调整画幅并输出成片",
          "body": "FFmpeg 裁取时间段，缩放并补边到目标尺寸，统一 30 fps，再拼接、叠字幕、混音和编码。这里主要是视频工程处理。",
          "source": "electron/ffmpeg/index.ts"
        },
        {
          "title": "绘制字幕并可另存 SRT",
          "body": "当前主路径把字幕绘制成透明 PNG 帧并叠加；支持关闭可见字幕及独立字幕导出。没有字幕资产时还有 FFmpeg 字幕滤镜回退。",
          "source": "electron/ffmpeg/index.ts"
        },
        {
          "title": "把流程纳入任务与批处理",
          "body": "主界面按文案、TTS、素材、导出阶段推进任务，处理状态和取消，并按批处理设置继续执行。批量产出仍需要逐项检查。",
          "source": "src/views/Home/index.vue"
        }
      ],
      "boundaries": [
        "需要预先准备视频素材；已检查选片函数没有把文案或语义向量作为输入，不能假设模型在自动挑选最相关镜头。",
        "候选素材耗尽后可以再用，批量生成也可能重复镜头；更多版本不自动意味着更好。",
        "桌面应用与 FFmpeg 在本机运行，文案按配置访问模型端点，Edge TTS 访问网络服务；不是默认全离线。",
        "当前渲染是等比缩放加补边，不是自动人脸跟踪裁切；横屏放进竖屏可能出现明显留边。",
        "主路径拼接视频流时不保留素材原声，最终音频来自配音及可选 BGM；不要假定现场对白会自动保留。",
        "TTS 字幕边界、长句断行、字体和画面遮挡均需实测。当前代码已有字幕帧渲染与导出，但不表示 README 中所有规划特效已实现。",
        "响度归一化与音轨相加不等于智能闪避或专业混音。素材、模型、服务、字体和 FFmpeg 的错误都会影响成片。",
        "本研究在 2026-10-23 深入核对既定 commit，未安装或渲染，也未验证最新版性能、服务可用性和收费。"
      ],
      "stages": [
        {
          "title": "准备文稿",
          "tag": "LLM / 人工",
          "body": "取得可用于配音的正文。模型按主题与提示写作；主路径不会把所有视频逐帧交给视觉模型分析。核对参数、名称和效果承诺后再配音。",
          "input": "创作要求 + 可信资料",
          "output": "口播正文",
          "code": "getTextForSynthesis / generateCopywriting",
          "source": "src/views/Home/index.vue"
        },
        {
          "title": "配音与时间",
          "tag": "TTS",
          "body": "使用网络 TTS 生成音频，接收 WordBoundary 的偏移与时长。字幕由这些元数据组织；主任务读取实际配音时长作为后续目标。",
          "input": "正文 + 声音与语速",
          "output": "语音 + SRT + 音频时长",
          "code": "getCaptionSrtString",
          "source": "electron/lib/edge-tts.ts"
        },
        {
          "title": "抽取片段",
          "tag": "随机规则",
          "body": "随机取素材和起点，通常在 2–15 秒范围取长度；短素材或末尾剩余时长可小于 2 秒。累计覆盖目标后停止，用完可重新取用。",
          "input": "素材库 + 配音时长",
          "output": "文件路径 + 起止时间列表",
          "code": "getVideoSegments",
          "source": "src/views/Home/components/VideoManage.vue"
        },
        {
          "title": "绘制字幕",
          "tag": "图形渲染",
          "body": "按 SRT 时间找到当前字幕，布局后逐帧绘制透明图像；隐藏渲染窗口导出 PNG 序列，供视频叠加。字幕关闭时跳过叠字。",
          "input": "字幕时间 + 样式 + 画幅",
          "output": "透明字幕帧",
          "code": "renderSubtitleFramesToPngSequence",
          "source": "electron/effect-engine/subtitle-render-service.ts"
        },
        {
          "title": "合成导出",
          "tag": "FFmpeg",
          "body": "裁取片段、重置时间、等比缩放补边、统一帧率、拼接画面、叠字幕，再处理配音与 BGM。研究版本默认编码使用 H.264 与 AAC。",
          "input": "片段 + 字幕 + 语音 / BGM",
          "output": "成片及可选 SRT",
          "code": "renderVideo / filter_complex",
          "source": "electron/ffmpeg/index.ts"
        }
      ],
      "insights": [
        {
          "title": "从 Podcastfy 再增加一条画面时间线",
          "body": "Podcastfy 先写稿再配音；这里还要让素材画面和字幕覆盖音频时间。模型能力重要，但同步、字体、比例和编码也决定是否能交付。",
          "source": "src/views/Home/index.vue"
        },
        {
          "title": "剪辑自动化不等于理解画面",
          "body": "getVideoSegments 的参数是目标时长，选取基于随机规则；未见对文稿与镜头作语义打分。素材库越混杂，越需要人工挑选和复核。",
          "source": "src/views/Home/components/VideoManage.vue"
        },
        {
          "title": "配音时长是这条主路径的时间基准",
          "body": "先合成语音，再用它的实际时长决定素材覆盖和导出长度。改稿或改变语速后，画面与字幕应重新对齐；不是先固定画面再保证声音自动适配。",
          "source": "src/views/Home/index.vue"
        },
        {
          "title": "字幕有文字、时间、像素三个层次",
          "body": "TTS 词边界组织成 SRT，字幕渲染器决定断行与样式，FFmpeg 再把像素叠进成片。单独 SRT 是可用的时间文本，烧录字幕则成为视频画面的一部分。",
          "source": "electron/ffmpeg/index.ts"
        },
        {
          "title": "渲染主要执行规则，不是在训练新模型",
          "body": "trim、scale、pad、concat、overlay、amix 等操作按配置处理已有信号。H.264/AAC 编码将处理后的画面与声音保存为可播放文件。",
          "source": "electron/ffmpeg/index.ts"
        },
        {
          "title": "修正旧概览：字幕实现应看代码，不只看路线图",
          "body": "此前概览仅指出 README 仍规划更多字幕特效。本次在相同 commit 核实了透明 PNG 字幕序列、叠加、开关与 SRT 导出；这不等于所有规划样式已完成。",
          "source": "electron/effect-engine/subtitle-render-service.ts"
        }
      ],
      "experiment": {
        "title": "固定文稿和素材，检查三条轨道是否一致",
        "material": "五段自有水杯视频、一段约 30 秒的审阅稿；记录每段画面可表达的内容。",
        "steps": [
          "记录 commit、系统、模型端点、声音与语速、输出尺寸和字幕设置；先核对文稿，再取得实际配音时长。",
          "使用同一素材库生成一版，逐段记录抽取起止点、重复镜头和文案对应关系。不要把 30 秒目标当作实际时长。",
          "核对字幕起止、术语、断行、画面留边、背景音乐是否盖住人声；检查原声是否符合预期。",
          "固定其他条件，只调整语速再生成，比较时长、字幕和选片变化。分别记录模型等待、配音、字幕帧生成、FFmpeg 耗时及返工。"
        ],
        "metrics": [
          "成功播放与实际时长",
          "画面内容匹配 / 总片段数",
          "字幕错字与错时",
          "重复镜头数",
          "人声清晰度与留边",
          "分阶段耗时及人工返工"
        ],
        "next": "未运行桌面工具。先验证一条完整视频，再讨论批量效果和性能。"
      },
      "quiz": [
        {
          "question": "它会自动像 DigUp 一样找到最符合每句话的镜头吗？",
          "answer": "已检查主路径不会。当前选片按时长随机抽取，不接受文稿或语义向量作为匹配输入。"
        },
        {
          "question": "字幕是另跑一次语音识别得到的吗？",
          "answer": "当前主路径使用 TTS 返回的词边界时间组织字幕，不是先配音再运行 ASR。"
        },
        {
          "question": "把横屏素材放入竖屏，就会自动追踪人物裁切吗？",
          "answer": "当前渲染使用等比缩放和补边，保留画面比例，未在此路径看到人物跟踪裁切。"
        },
        {
          "question": "更换更强的文案模型，能解决所有成片问题吗？",
          "answer": "不能。缺素材、选片不相关、字幕遮挡、时长不齐、声音混合或编码失败，都属于其他环节。"
        },
        {
          "question": "这是不是自己训练的视频生成模型？",
          "answer": "主路径是现成文案与语音模型加规则剪辑和渲染，没有从零生成镜头或训练新视频模型。"
        }
      ],
      "extras": [
        {
          "label": "作者视频示例与项目说明",
          "url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/README.md"
        }
      ],
      "evidence": {
        "requested_repository": "YILS-LIN/short-video-factory",
        "repository": "YILS-LIN/short-video-factory",
        "url": "https://github.com/YILS-LIN/short-video-factory",
        "branch": "main",
        "commit": "bc32e3515b38df548ff0608f7325b7806e8cfa20",
        "commit_date": "2026-10-16T09:12:19Z",
        "license": "AGPL-3.0",
        "readme_url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/README.md",
        "inspected_files": [
          {
            "path": "electron/lib/edge-tts.ts",
            "url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/electron/lib/edge-tts.ts"
          },
          {
            "path": "src/lib/llm/providers.ts",
            "url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/lib/llm/providers.ts"
          },
          {
            "path": "package.json",
            "url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/package.json"
          },
          {
            "path": "electron/ffmpeg/index.ts",
            "url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/electron/ffmpeg/index.ts"
          },
          {
            "path": "src/views/Home/index.vue",
            "url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/views/Home/index.vue"
          },
          {
            "path": "src/views/Home/components/VideoManage.vue",
            "url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/views/Home/components/VideoManage.vue"
          },
          {
            "path": "src/lib/llm/generate.ts",
            "url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/lib/llm/generate.ts"
          },
          {
            "path": "src/lib/llm/prompts.ts",
            "url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/lib/llm/prompts.ts"
          },
          {
            "path": "electron/effect-engine/subtitle-render-service.ts",
            "url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/electron/effect-engine/subtitle-render-service.ts"
          },
          {
            "path": "src/effect-engine/renderer/subtitle-render-runtime.ts",
            "url": "https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/src/effect-engine/renderer/subtitle-render-runtime.ts"
          }
        ],
        "deep_reviewed_on": "2026-10-23"
      },
      "runtime": "not-run"
    },
    {
      "id": "shorts",
      "name": "AI YouTube Shorts Generator",
      "short": "长视频切片",
      "type": "多模型协作",
      "level": 5,
      "repo": "Anil-matcha/AI-Youtube-Shorts-Generator",
      "depth": "deep",
      "note": "05-youtube-shorts.md",
      "headline": "机器怎样决定长视频里哪一段值得保留？",
      "summary": "长视频切片工具，让大模型读取带时间的语音转录来选段，再截取原画面与原声并按需裁切画幅。",
      "reason": "进一步理解转录、模型判断、时间定位与视觉裁切之间的依赖。",
      "input": "YouTube 链接 / 本地长视频",
      "output": "候选片段 + 竖屏视频",
      "environment": "Python 3.10+；local 模式还需 FFmpeg 和转录依赖。",
      "network": "默认 MuAPI；local 模式仍调用 OpenAI 或 Gemini",
      "cost": "API 调用、本地转录与编码算力、人工选片",
      "mechanism": "转录 → 高光筛选 → 去重 → 画面裁切",
      "example": {
        "input": "一段 20 分钟的自有访谈，指定生成 2 条、画幅 9:16；local 模式可直接读取本地文件。",
        "output": "从原片截取的候选短片，附起止时间、标题、评分和推荐理由；本地成片保留原音轨。",
        "note": "下方是人工教学材料，不运行识别或剪辑。实际生成数量可能不足，单条导出也可能失败；评分不等于传播效果。"
      },
      "capabilities": [
        {
          "title": "读取长视频，不必先切好素材",
          "body": "local 模式可直接使用本地文件或通过 yt-dlp 获取视频，YouTube 下载有缓存。它从原片选段，不要求另备口播文案或 TTS 配音。",
          "source": "shorts_generator/local/downloader.py"
        },
        {
          "title": "把讲话转成带时间的文字",
          "body": "本地使用 faster-whisper，得到 start、end、text，缓存为 SRT；API 路径使用网络 Whisper 服务。它识别原来的声音，不生成新配音。",
          "source": "shorts_generator/local/transcriber.py"
        },
        {
          "title": "由 LLM 提议值得单独呈现的段落",
          "body": "先估计内容类型和信息密度，再根据开场吸引力、冲突、观点和实用性等提示提出起止时间、标题、评分与理由。模型输入是转录文本。",
          "source": "shorts_generator/highlights.py"
        },
        {
          "title": "清理候选并减少时间重叠",
          "body": "校验时间、限制评分范围，按分数排序；候选与已保留片段的重叠超过候选自身时长的一半时剔除。它检查时间重叠，不识别不同时间的重复观点。",
          "source": "shorts_generator/highlights.py"
        },
        {
          "title": "截取原片并调整画幅",
          "body": "本地 FFmpeg 截取连续区间，OpenCV 检测最大人脸并平滑移动裁切框，再合回原音轨。检测不到人脸时用画面中心或保留上次位置。",
          "source": "shorts_generator/local/clipper.py"
        },
        {
          "title": "返回可继续处理的结构化结果",
          "body": "提供 CLI 和 Python 入口，可导出转录、全部候选与成片地址的 JSON。单片失败会记录错误，不能把返回的条目数直接当成功成片数。",
          "source": "main.py"
        }
      ],
      "boundaries": [
        "已核对的选段主路径只把转录文本送给 LLM，没有将视频帧送入视觉模型。无讲话的动作、风景或无声反应可能无法被挑中；无有效转录时流程报错。",
        "local 模式在本机转录与剪辑，但仍把转录内容发给 OpenAI 或 Gemini；首次准备模型与远程下载也可能联网。",
        "模型提示要求观点完整、不要半句切断，但代码不会因此自动保证每个切点正确。应回看上下文与实际片头片尾。",
        "本地最大人脸检测不等于说话人识别；多人、背影、幻灯片和屏幕录制可能裁掉关键信息。云端 autocrop 内部算法不在这些源码中。",
        "SRT 是转录缓存；已核对本地渲染没有烧录字幕，也没有重新 TTS 配音或添加背景音乐的步骤。",
        "长视频有分块设计，但固定版本存在时间坐标混用风险：块内保留原片时间，清洗时使用块时长，随后又加块偏移。属于静态阅读发现，需用长片专门复核。",
        "分数是按提示生成的主观排序依据，不是播放量预测或事实核查。生成数量、完整性和传播效果均不能保证。",
        "沿用固定 commit，于 2026-10-23 深入核对；未安装、下载模型或生成实际短片，也未核实当前服务价格与可用性。"
      ],
      "stages": [
        {
          "title": "准备原视频",
          "tag": "输入",
          "body": "local 接受文件路径或下载视频。输入是已有完整内容，输出数量和画幅是控制参数；不要求预先生成新文案。",
          "input": "视频路径 / YouTube URL",
          "output": "可读取的原片",
          "code": "download_youtube_local",
          "source": "shorts_generator/local/downloader.py"
        },
        {
          "title": "识别讲话",
          "tag": "ASR",
          "body": "语音模型输出带起止时间的文字段，供后续阅读和定位。识别错的人名、否定词与数字会传递到选段判断。",
          "input": "原片声音",
          "output": "start / end / text",
          "code": "transcribe_local",
          "source": "shorts_generator/local/transcriber.py"
        },
        {
          "title": "阅读并选段",
          "tag": "LLM",
          "body": "模型先根据样本判断内容类型，再阅读带起点秒数的转录，提出值得独立呈现的区间、标题、开场句和理由；不直接读取画面。",
          "input": "时间标记 + 转录文字",
          "output": "候选时间区间与分数",
          "code": "get_highlights / call_highlight_api",
          "source": "shorts_generator/highlights.py"
        },
        {
          "title": "检查与排序",
          "tag": "规则",
          "body": "清理格式和越界时间，按分数消除过度重叠，再取请求数量以内的候选。规则只验证部分结构，不保证语义完整或切点精确。",
          "input": "模型候选",
          "output": "待渲染片段列表",
          "code": "_sanitize_highlights / dedupe_highlights",
          "source": "shorts_generator/highlights.py"
        },
        {
          "title": "截取与裁画幅",
          "tag": "媒体",
          "body": "本地先截取原片连续区间，再检测人脸、平滑裁切，最后合回原音轨。各候选独立成片，不是把所有候选拼成一个新故事。",
          "input": "原片 + 起止时间 + 比例",
          "output": "短片文件 / 单片错误",
          "code": "crop_clip_local / crop_highlights_local",
          "source": "shorts_generator/local/clipper.py"
        }
      ],
      "insights": [
        {
          "title": "比随机混剪多了一步内容判断",
          "body": "Short Video Factory 用配音总长度组织素材；这里让模型读原片转录后选时间段，保留原来的讲话与画面。但这仍不是完整的视频语义理解。",
          "source": "shorts_generator/pipeline.py"
        },
        {
          "title": "时间戳连接文字判断与真实画面",
          "body": "文字帮助模型判断内容；秒数让程序回到原片截取对应区间。若时间错了，文案判断合理也可能切错位置。",
          "source": "shorts_generator/highlights.py"
        },
        {
          "title": "“精彩”由提示定义",
          "body": "提示侧重吸引力、情绪、冲突与实用性，评分不是客观测量。知识学习、新闻摘录与娱乐传播可能需要不同标准。",
          "source": "shorts_generator/highlights.py"
        },
        {
          "title": "选时段与选画面位置是两种判断",
          "body": "LLM 决定保留原片哪几十秒；本地人脸检测决定这几十秒内裁切框的位置。最大脸未必正在讲话，也未必包含演示内容。",
          "source": "shorts_generator/local/clipper.py"
        },
        {
          "title": "框架串联已有模型，不在主流程训练新模型",
          "body": "Whisper 负责语音识别，OpenAI/Gemini 或 MuAPI 模型负责选段，OpenCV 检测人脸，FFmpeg 处理音视频。组件各有不同失败方式。",
          "source": "shorts_generator/pipeline.py"
        }
      ],
      "experiment": {
        "title": "先检查选段，再检查成片",
        "material": "五分钟自有讲解视频，人工标出两个完整观点；另备一段多人对谈或带幻灯片的视频检验裁切。",
        "steps": [
          "先核对转录的人名、数字、否定句与时间戳，记录是否使用缓存。",
          "请求两个片段，逐个阅读标题、起止时间和理由，回看原片前后语境。",
          "对照原片检查是否切断句子、遗漏限定条件，确认原声和嘴型同步。",
          "检查最大人脸裁切是否跟错人或遮掉幻灯片；单独检查可见字幕，不以 SRT 文件存在为依据。",
          "统计成功文件、失败条目、返工时间和实际费用。短片验证后再用 30 分钟以上素材检查分块边界与时间偏移。"
        ],
        "metrics": [
          "转录准确性",
          "内容与上下文完整性",
          "起止时间误差",
          "裁切信息损失",
          "成功成片与返工比例",
          "处理耗时与费用"
        ],
        "next": "以上是实验方案，当前没有模型输出或本机成片结果。"
      },
      "quiz": [
        {
          "question": "它根据 TTS 配音时长随机截取吗？",
          "answer": "不是。它识别原视频讲话，让模型阅读转录后给出起止时间；本地成片保留原声，主流程不重新 TTS 配音。"
        },
        {
          "question": "选段模型看到了视频中的动作吗？",
          "answer": "已核对主路径传入的是带时间的转录文本。人脸检测服务于裁切位置，不能替代对动作或场景的语义理解。"
        },
        {
          "question": "检测到最大人脸，就知道谁在说话了吗？",
          "answer": "不知道。最大人脸来自几何检测，没有把音频与人物对应起来；多人时需要检查跟随是否正确。"
        },
        {
          "question": "片段得到 95 分，是否表示会成为热门视频？",
          "answer": "不是。分数来自模型按提示词作出的排序判断，未建立与真实传播数据的对应验证。"
        },
        {
          "question": "local 模式与 SRT 文件分别保证离线和可见字幕吗？",
          "answer": "都不保证。local 的选段仍调用云端模型；SRT 是转录缓存，已读本地渲染没有把它烧录进成片。"
        }
      ],
      "extras": [],
      "evidence": {
        "requested_repository": "Anil-matcha/AI-Youtube-Shorts-Generator",
        "repository": "Anil-matcha/AI-Youtube-Shorts-Generator",
        "url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator",
        "branch": "main",
        "commit": "3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c",
        "commit_date": "2026-10-11T11:19:33Z",
        "license": "MIT",
        "readme_url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/README.md",
        "inspected_files": [
          {
            "path": "shorts_generator/local/clipper.py",
            "url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/local/clipper.py"
          },
          {
            "path": "shorts_generator/local/llm.py",
            "url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/local/llm.py"
          },
          {
            "path": "shorts_generator/highlights.py",
            "url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/highlights.py"
          },
          {
            "path": "shorts_generator/pipeline.py",
            "url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/pipeline.py"
          },
          {
            "path": "shorts_generator/local/transcriber.py",
            "url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/local/transcriber.py"
          },
          {
            "path": "shorts_generator/local/downloader.py",
            "url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/local/downloader.py"
          },
          {
            "path": "shorts_generator/clipper.py",
            "url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/clipper.py"
          },
          {
            "path": "shorts_generator/transcriber.py",
            "url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/transcriber.py"
          },
          {
            "path": "shorts_generator/config.py",
            "url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/shorts_generator/config.py"
          },
          {
            "path": "main.py",
            "url": "https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/main.py"
          }
        ],
        "deep_reviewed_on": "2026-10-23"
      },
      "runtime": "not-run"
    },
    {
      "id": "ldr",
      "name": "Local Deep Research",
      "short": "深度研究",
      "type": "研究 Agent",
      "level": 6,
      "repo": "LearningCircuit/local-deep-research",
      "depth": "deep",
      "note": "02-local-deep-research.md",
      "headline": "模型怎样带着问题反复查资料，再写出有依据的报告？",
      "summary": "深度研究编排工具，通过固定轮次或模型工具调用循环搜索和读取资料，最后综合为带引用的研究报告。",
      "reason": "最后理解从固定制作流程到根据证据调整动作的研究系统。",
      "input": "研究问题 + 范围 + 模型与来源设置",
      "output": "研究报告、引用与过程记录",
      "environment": "Docker 或 Python Web 应用；固定源码要求 Python ≥3.12、<3.15。",
      "network": "模型推理、网页搜索与本地资料检索分别配置",
      "cost": "模型调用、搜索与阅读次数、上下文处理、人工核验时间",
      "mechanism": "问题 → 搜索 / 阅读 → 判断缺口 → 补查 → 带引用综合",
      "example": {
        "input": "为 10 万份中英混合文档比较关键词、语义和混合检索，关注精确编号、隐私和维护成本。",
        "output": "按场景比较的报告、来源链接，以及证据不足或需要实测的部分。",
        "note": "这是教学研究任务，不是已执行的真实研究。下方示意资料与报告句子为人工编写。"
      },
      "capabilities": [
        {
          "title": "把问题交给可配置的研究流程",
          "body": "语言模型和搜索引擎分别接入，策略决定如何提出查询、收集结果和综合。工具能否使用取决于实际配置，不是安装界面就拥有全部来源。",
          "source": "src/local_deep_research/search_system.py"
        },
        {
          "title": "按轮次扩展查询",
          "body": "source-based 在第一轮使用原问题和模型生成的问题，后续根据已有结果继续提问，批量搜索后汇总。这是受配置控制的迭代流程。",
          "source": "src/local_deep_research/advanced_search_system/strategies/source_based_strategy.py"
        },
        {
          "title": "让模型动态选择下一步",
          "body": "langgraph-agent 将可用搜索、抓取和可选子主题研究工具交给模型；工具返回结果后再次调用模型，决定补查或给出答案。",
          "source": "src/local_deep_research/advanced_search_system/strategies/langgraph_agent_strategy.py"
        },
        {
          "title": "读取来源并提取相关信息",
          "body": "fetch_content 可返回提取后的页面文本，或按焦点问题用模型提取相关段落。受读取长度、可访问性和工具配置限制，不能假定每条来源都读了全文。",
          "source": "src/local_deep_research/advanced_search_system/tools/fetch/__init__.py"
        },
        {
          "title": "维护来源与编号引用",
          "body": "收集器记录来源证据和编号；引用处理器将标题、URL、内容提供给模型，要求按编号综合。编号便于追溯，不等于结论已被验证。",
          "source": "src/local_deep_research/citation_handlers/standard_citation_handler.py"
        },
        {
          "title": "按章节继续研究并组织报告",
          "body": "详细报告先拟结构，再针对各小节调用研究流程并组织正文与来源。它可能增加查询和模型调用，不只是把初稿机械拉长。",
          "source": "src/local_deep_research/report_generator.py"
        }
      ],
      "boundaries": [
        "本文分开讲 source-based 与 langgraph-agent；后者需支持工具调用的模型，不代表所有模式都由模型自由决定步骤。",
        "Local 描述可部署与配置方式：云端 LLM 会收到提示和资料；公开网页搜索要联网，自建 SearXNG 仍可能把查询转发给上游搜索引擎。",
        "引用链接能打开、编号存在、来源数量多，都不能证明原文支持结论。日期、适用条件、相互转载和反例需要核对。",
        "搜索摘要、页面截断与提取摘要会丢失信息；摘要也可能引入模型错误。找不到证据不等于证据不存在。",
        "达到步数上限、工具不可用或失败时，系统可能基于已收集资料生成部分结果；完成输出不意味着问题已经查清。",
        "模型可能偏题、反复搜索或过早结束。增加轮次会增加成本与上下文负担，不自动提高正确率。",
        "研究与资料入库不是训练模型。资料检索在推理时提供上下文，主流程没有因此修改模型权重。",
        "沿用固定 commit，于 2026-10-23 深入核对。未部署、调用模型、跑真实研究或验证作者基准成绩与当前价格。"
      ],
      "stages": [
        {
          "title": "限定问题",
          "tag": "输入",
          "body": "明确研究对象、时间范围、输出标准，选择模型、来源和策略。问题越宽，研究越容易发散。",
          "input": "问题与约束",
          "output": "配置后的研究任务",
          "code": "AdvancedSearchSystem",
          "source": "src/local_deep_research/search_system.py"
        },
        {
          "title": "搜索候选",
          "tag": "检索",
          "body": "模型提出查询，搜索后端执行并返回标题、链接、摘要等。模型不是搜索索引本身。",
          "input": "查询词与来源设置",
          "output": "可供查看的来源",
          "code": "_build_tools / web_search",
          "source": "src/local_deep_research/advanced_search_system/strategies/langgraph_agent_strategy.py"
        },
        {
          "title": "阅读与存证",
          "tag": "工具",
          "body": "按需读取网页或资料内容，把相关证据与来源编号一起记录。具体读取量随模式和限制变化。",
          "input": "候选链接与关注点",
          "output": "文本或摘取段落 + 来源编号",
          "code": "build_fetch_tool",
          "source": "src/local_deep_research/advanced_search_system/tools/fetch/__init__.py"
        },
        {
          "title": "判断与补查",
          "tag": "循环",
          "body": "Agent 根据观察选择新的工具调用或结束；source-based 则在配置的轮次中生成下一批问题。程序负责执行、限额与取消。",
          "input": "已有材料与尚缺信息",
          "output": "继续查询 / 阅读 / 综合",
          "code": "analyze_topic",
          "source": "src/local_deep_research/advanced_search_system/strategies/langgraph_agent_strategy.py"
        },
        {
          "title": "综合与复核",
          "tag": "输出",
          "body": "模型根据来源写答案并标注引用；详细报告还会分章节研究。用户核查结论是否被原文支持，保留未知。",
          "input": "证据与研究发现",
          "output": "报告、来源与过程信息",
          "code": "generate_report / analyze_followup",
          "source": "src/local_deep_research/report_generator.py"
        }
      ],
      "insights": [
        {
          "title": "模型负责决定，程序负责执行",
          "body": "模型给出工具名称与参数，程序运行搜索或抓取，将结果送回上下文。一次调用后再决定下一步，构成 Agent 循环。",
          "source": "src/local_deep_research/advanced_search_system/strategies/langgraph_agent_strategy.py"
        },
        {
          "title": "“深入”来自补足证据，不来自篇幅",
          "body": "详细报告可以针对各小节继续查找，但是否改善质量取决于问题、来源和核验。不能只用字数或引用数评估研究。",
          "source": "src/local_deep_research/report_generator.py"
        },
        {
          "title": "引用是可核查的连接，不是正确性证书",
          "body": "来源标题、URL、内容与编号被送入综合提示；即便启用来源一致性检查，也是模型判断，仍可能错引或漏掉条件。",
          "source": "src/local_deep_research/citation_handlers/standard_citation_handler.py"
        },
        {
          "title": "结束条件与知识充分程度不同",
          "body": "模型可停止工具调用并回答，程序也会因轮次限制或工具不可用结束；已有资料可能被用于兜底综合。报告必须结合过程状态解读。",
          "source": "src/local_deep_research/advanced_search_system/strategies/langgraph_agent_strategy.py"
        }
      ],
      "experiment": {
        "title": "同一个问题，对比两种策略与证据质量",
        "material": "一个可以找到原始材料、范围明确的问题。预先写出 5 项需要回答的事实或条件。",
        "steps": [
          "记录问题、日期、模型、来源、策略、轮次和读取设置。先跑小范围研究。",
          "观察实际搜索词、打开的来源和失败记录，分辨摘要阅读与正文阅读。",
          "抽查 5 条可验证结论，打开编号来源，检查原文是否支持其范围、时间和限定条件。",
          "记录没有找到依据的结论、互相转载和矛盾来源，不以引用数量替代证据质量。",
          "在相同设置下对比 source-based 与 langgraph-agent 的调用量、覆盖与返工时间；条件变化应单独记录。"
        ],
        "metrics": [
          "支持结论数 / 抽查数",
          "关键条件覆盖",
          "原始来源比例",
          "未解决矛盾",
          "工具与模型调用量",
          "总耗时及费用"
        ],
        "next": "尚未部署或产生真实研究结果；先验证配置与小范围任务，再扩大研究。"
      },
      "quiz": [
        {
          "question": "它自己训练了一个更懂知识的大模型吗？",
          "answer": "不是。研究流程调用已有模型、搜索和阅读工具，用找到的材料辅助回答。入库或检索不等于训练。"
        },
        {
          "question": "Agent 与搜索一次再总结有什么区别？",
          "answer": "Agent 会根据工具返回的结果再决定下一步，例如换查询、读原文或继续查反例。具体策略也可以使用固定轮次。"
        },
        {
          "question": "带 [1] 的句子就可靠吗？",
          "answer": "还要核对编号是否对应正确原文，以及原文是否支持该句的全部含义与条件。"
        },
        {
          "question": "输出报告意味着研究充分吗？",
          "answer": "不一定。可能是模型自行结束，也可能达到限制或工具失败后只综合已有资料。"
        },
        {
          "question": "本地运行就不会联网吗？",
          "answer": "不一定。要分别检查模型端点、搜索来源、抓取和其他依赖。公开网页研究本来就要访问网络。"
        }
      ],
      "extras": [],
      "evidence": {
        "requested_repository": "LearningCircuit/local-deep-research",
        "repository": "LearningCircuit/local-deep-research",
        "url": "https://github.com/LearningCircuit/local-deep-research",
        "branch": "main",
        "commit": "683a967df20fe98ec0ddc99668041e22b95ff78b",
        "commit_date": "2026-10-19T20:42:02Z",
        "license": "MIT",
        "readme_url": "https://github.com/LearningCircuit/local-deep-research/blob/683a967df20fe98ec0ddc99668041e22b95ff78b/README.md",
        "inspected_files": [
          {
            "path": "pyproject.toml",
            "url": "https://github.com/LearningCircuit/local-deep-research/blob/683a967df20fe98ec0ddc99668041e22b95ff78b/pyproject.toml"
          },
          {
            "path": "src/local_deep_research/search_system.py",
            "url": "https://github.com/LearningCircuit/local-deep-research/blob/683a967df20fe98ec0ddc99668041e22b95ff78b/src/local_deep_research/search_system.py"
          },
          {
            "path": "src/local_deep_research/advanced_search_system/strategies/langgraph_agent_strategy.py",
            "url": "https://github.com/LearningCircuit/local-deep-research/blob/683a967df20fe98ec0ddc99668041e22b95ff78b/src/local_deep_research/advanced_search_system/strategies/langgraph_agent_strategy.py"
          },
          {
            "path": "src/local_deep_research/advanced_search_system/strategies/source_based_strategy.py",
            "url": "https://github.com/LearningCircuit/local-deep-research/blob/683a967df20fe98ec0ddc99668041e22b95ff78b/src/local_deep_research/advanced_search_system/strategies/source_based_strategy.py"
          },
          {
            "path": "src/local_deep_research/advanced_search_system/tools/fetch/__init__.py",
            "url": "https://github.com/LearningCircuit/local-deep-research/blob/683a967df20fe98ec0ddc99668041e22b95ff78b/src/local_deep_research/advanced_search_system/tools/fetch/__init__.py"
          },
          {
            "path": "src/local_deep_research/report_generator.py",
            "url": "https://github.com/LearningCircuit/local-deep-research/blob/683a967df20fe98ec0ddc99668041e22b95ff78b/src/local_deep_research/report_generator.py"
          },
          {
            "path": "src/local_deep_research/citation_handler.py",
            "url": "https://github.com/LearningCircuit/local-deep-research/blob/683a967df20fe98ec0ddc99668041e22b95ff78b/src/local_deep_research/citation_handler.py"
          },
          {
            "path": "src/local_deep_research/citation_handlers/standard_citation_handler.py",
            "url": "https://github.com/LearningCircuit/local-deep-research/blob/683a967df20fe98ec0ddc99668041e22b95ff78b/src/local_deep_research/citation_handlers/standard_citation_handler.py"
          }
        ],
        "deep_reviewed_on": "2026-10-23"
      },
      "runtime": "not-run"
    }
  ],
  "glossary": [
    [
      "TTS",
      "Text to Speech，把文字转成语音。"
    ],
    [
      "音素",
      "表示发音的基本单位；文字通常先转换成音素再进入语音模型。"
    ],
    [
      "Embedding",
      "把内容变成可比较的数值向量，常用于按含义检索。"
    ],
    [
      "ASR",
      "Automatic Speech Recognition，把语音识别成文字。"
    ],
    [
      "LLM",
      "大语言模型；在这里用于写稿、选择片段或组织研究。"
    ],
    [
      "Agent",
      "能根据已有结果选择下一步工具或动作的系统。"
    ],
    [
      "FFmpeg",
      "处理音视频的工具集，常用于剪切、编码、混音与合成。"
    ],
    [
      "本地推理",
      "模型计算发生在本机；仍需检查下载、搜索等其他步骤是否联网。"
    ]
  ],
  "lessonTracks": [
    {
      "id": "waveform",
      "title": "一条波形里，藏着什么？",
      "text": "录音保存的，是随时间变化的一串波形数值。麦克风把空气振动变成电信号，采样和量化再把电信号变成数字。音高主要和周期重复的快慢有关，响度与振幅和能量有关，音色则与不同频率成分的比例，以及声音起落的过程有关。波形不同，不一定就是音色不同。例如，同一个人说话更响了，波形也会变。下面可以调节参数，边看波形，边听声音。这里的短音只是原理演示，不是人声。"
    },
    {
      "id": "vector",
      "title": "音色向量，不是一小段录音",
      "text": "波形中的数字按时间排列，可以还原声音。音色向量中的数字，则是模型学会使用的特征，需要配合文字和生成模型，才能产生新的声音。你可以把它理解成声音配方。每一个数字通常没有单独的中文含义，不能直接说某一维就是温柔度。模型权重保存生成规律，音色向量提供声音和风格条件，最终波形才是这一次说话的结果。同一个人的不同录音，提取出来的向量也不一定完全相同。"
    },
    {
      "id": "encoder",
      "title": "怎么分开内容和说话人？",
      "text": "一种典型的说话人编码器，通过认人的任务学习声音特征。你说今天下雨了，再说我想喝水，虽然内容不同，模型应该给出接近的向量。另一个人也说今天下雨了，虽然内容相同，向量却应该能够区分。反复训练后，模型逐渐保留跨句子仍有辨识度的声音特征。这不是删除某个频段，也不是把文字从声音里减掉。内容和音色的分离并不完美，情绪、口音和录音条件，都可能影响结果。"
    },
    {
      "id": "kokoro",
      "title": "回到 Kokoro：哪些能力已经具备？",
      "text": "回到我们研究的这个语音模型。它已经能把文字转换成音素，结合已有的声音风格，预测时长和音高等信息，再生成波形。标准版本能够加载预设音色，也支持混合已有音色。但是，官方没有发布配套的参考音频编码器，所以不能直接把你的录音传进去，就自动得到你的音色。支持参考录音的声音克隆模型，需要额外学会从录音提取声音条件，并让生成模型理解这些条件。"
    }
  ],
  "summary": {
    "title": "六个工具，从模型能力到可用产品",
    "intro": "六个独立的开源项目，覆盖资料检索、问题研究、对话改编、语音合成与视频制作。既有直接提供模型能力的工具，也有把现成模型与程序组织起来的产品。",
    "map": [
      {
        "title": "查找与研究",
        "tools": "DigUp · Local Deep Research",
        "input": "本地资料 / 一个研究问题",
        "output": "文件与位置 / 报告与引用",
        "note": "让资料可找，让问题有依据"
      },
      {
        "title": "改编与表达",
        "tools": "Podcastfy · Kokoro",
        "input": "来源资料 / 已确定的文稿",
        "output": "对话播客 / 合成语音",
        "note": "让内容变成可以听的表达"
      },
      {
        "title": "剪辑与成片",
        "tools": "Short Video Factory · Shorts",
        "input": "素材与文稿 / 已有长视频",
        "output": "素材混剪 / 原片精选片段",
        "note": "把制作步骤交给程序执行"
      }
    ],
    "cards": [
      {
        "id": "kokoro",
        "name": "Kokoro",
        "type": "语音合成模型与推理库",
        "purpose": "把确定的文稿，变成带指定音色的语音。",
        "flow": [
          "文本与音素",
          "时长与韵律",
          "音频波形"
        ],
        "capability": "按语言、音色和语速合成语音，可在本地加载权重推理。",
        "principle": "模型结合音素与风格条件，预测时长、音高等，再解码出采样值。",
        "understanding": "权重提供发声能力，音色向量提供风格条件；音色与频谱、包络等有关。输出波形是采样值，不是转录文字。",
        "value": "把“怎么发声”变成可复用的模型能力。",
        "scenes": "文章朗读、固定文稿配音、语音功能原型。",
        "boundary": "标准入口没有任意录音克隆的完整流程；配套编码器未公开。中文发音仍需试听。"
      },
      {
        "id": "digup",
        "name": "DigUp",
        "type": "模型编码 + 本地混合检索",
        "purpose": "用内容描述，找回本地文件及相关位置。",
        "flow": [
          "文件解析分片",
          "向量 + 关键词",
          "候选与位置"
        ],
        "capability": "检索文字、图片和音视频内容，返回文件、页码或时间窗口。",
        "principle": "跨模态编码产生可比较的向量，与关键词结果校准融合；位置来自索引元数据。",
        "understanding": "共享语义空间来自训练时的对齐。图片可直接编码，不必先生成文字描述；索引不是训练。",
        "value": "把“我记得内容”变成可执行的搜索。",
        "scenes": "个人资料库、素材查找、文档与录音定位。",
        "boundary": "向量相近只代表相关性；采样、索引覆盖和中文精确词匹配都会影响结果。"
      },
      {
        "id": "podcastfy",
        "name": "Podcastfy",
        "type": "资料 → 文稿 → 语音的工作流",
        "purpose": "把资料改编成分角色讲解的对话播客。",
        "flow": [
          "提取来源",
          "LLM 写对话",
          "TTS 与合并"
        ],
        "capability": "整合支持的资料入口，设置语言、角色与风格，再生成播客音频。",
        "principle": "提取正文或字幕，提示现成语言模型写对话，再按角色调用语音后端并拼接。",
        "understanding": "理解、改写靠 LLM，发声靠 TTS；产品负责连接流程。类似资料转音频解读这一类能力。",
        "value": "减少从资料到“能听懂的讲解”的制作步骤。",
        "scenes": "学习资料听读、文章解读、播客内容原型。",
        "boundary": "主流程不训练新模型。说得自然不等于事实可靠，来源提取与改写都需核对。"
      },
      {
        "id": "video-factory",
        "name": "Short Video Factory",
        "type": "按时长组织的素材制作流程",
        "purpose": "用文稿和已有素材，批量合成配音短视频。",
        "flow": [
          "文稿 → 配音",
          "按时长抽片",
          "字幕 + 合成"
        ],
        "capability": "组织文案、TTS、素材截取、字幕和背景音乐，通过 FFmpeg 导出。",
        "principle": "配音总时长作为目标，随机取素材与起点，累计覆盖；TTS 边界用于字幕时间。",
        "understanding": "它擅长自动执行剪辑。已查主路径没有按文稿语义选画面；素材相关性需先把关。",
        "value": "把重复的素材拼装、叠字和音轨合成自动化。",
        "scenes": "已有合适素材的讲解、产品介绍、批量视频草稿。",
        "boundary": "不等于理解整条长视频、提炼精彩瞬间。片段能填满配音，不代表画面讲对内容。"
      },
      {
        "id": "shorts",
        "name": "AI YouTube Shorts Generator",
        "type": "基于转录选段的剪辑流程",
        "purpose": "从已有长视频，挑出适合独立呈现的短片。",
        "flow": [
          "语音 → 带时转录",
          "LLM 选区间",
          "原片截取裁切"
        ],
        "capability": "分析讲话内容、给出候选区间和标题，截取原画面、保留原声；本地可裁竖屏。",
        "principle": "语音识别提供时间文本，LLM 选段，程序检查时间和重叠，再剪辑；人脸检测另管裁切。",
        "understanding": "像读带时间的访谈稿后提出剪辑建议。二次创作主要是选段与构图，不是重新配音拍摄。",
        "value": "减少翻找长片和逐段裁切的时间。",
        "scenes": "访谈、播客录像、讲话主导的课程或分享。",
        "boundary": "选段 LLM 不直接看画面。无声精彩场面可能漏掉；长片切点和裁切效果需要回看。"
      },
      {
        "id": "ldr",
        "name": "Local Deep Research",
        "type": "研究策略 + 模型工具循环",
        "purpose": "围绕问题反复找资料，形成带来源的报告。",
        "flow": [
          "问题与范围",
          "搜索 / 阅读循环",
          "综合与引用"
        ],
        "capability": "配置模型与来源，多轮搜索、按需读取；详细报告可继续分章节研究。",
        "principle": "source-based 按轮次搜集；Agent 由模型选择工具，程序执行并返回结果，直到回答或触及边界。",
        "understanding": "用户定目标，模型做语义判断，程序管工具、上下文和来源。循环更新任务资料，不训练权重。",
        "value": "把研究步骤组织成可配置、可追溯的过程。",
        "scenes": "专题学习、技术方案梳理、资料调查与报告草稿。",
        "boundary": "不是每次都先全面规划，也不保证越查越对。结束或带引用，都不等于证据充分。"
      }
    ],
    "distinctions": [
      [
        "向量的用途不同",
        "音色向量控制声音风格；语义向量衡量内容相关性。都由数字构成，也不能直接互换。"
      ],
      [
        "制作视频有两条路",
        "Video Factory 按时长拼已有素材；Shorts 读长片转录来选段。输入不同，自动化目标不同。"
      ],
      [
        "使用模型不等于训练",
        "推理、建索引、反复搜索主要使用已有权重。训练是调整模型参数，不能混为一谈。"
      ]
    ],
    "personal": [
      [
        "看懂产品的能力来源",
        "区分模型判断、数据处理和规则执行；理解“效果好”到底依赖哪一层，知道该检查哪里。"
      ],
      [
        "知道类似产品如何落地",
        "先定义输入与输出，再组合模型、工具、数据格式和控制逻辑；不必默认从训练基础模型开始。"
      ],
      [
        "把学习转化为可验证的原型",
        "选一个具体任务，跑通最小流程，记录正确性、耗时和人工返工，再决定是否值得继续投入。"
      ]
    ],
    "takeaway": "对你的核心价值：从“知道工具能做什么”，走到“能解释它为什么有效、知道哪里会失效，并能设计自己的实现”。",
    "example": "例如：研究问题 → LDR 报告 → 人工核查 → Podcastfy 对话播客。若更换配音后端为 Kokoro，还需适配接口、格式与音色。",
    "caveat": "这里是能力关系与可组合思路，不是已经打通的流水线。六项均基于固定版本文档与代码整理；上游工具本机实测仍为 0。"
  }
};
