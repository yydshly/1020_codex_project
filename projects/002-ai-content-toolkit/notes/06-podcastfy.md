# Podcastfy 如何把资料改编成对话播客

它把文章、网页、PDF 等资料转成适合听的对话内容。这里有两个独立问题：先写出适合交流的稿子，再让不同声音把稿子说出来。

## 效果与价值

输入一篇“关键词与语义检索区别”的说明文，预期输出不只是全文朗读，而是由总结者和追问者组织的对话稿，再生成两种声音的音频。网页提供“直接朗读／对话改编”切换，示例均为人工编写，没有调用 Podcastfy。

价值在于复用制作流程、角色设置和后端接口，适合批量知识改编。是否划算，要比较节省的制作时间与新增审稿、修音时间。可先查看官方 README 的作者音频案例，但不能据此保证自己的中文效果。

## 工作过程

资料提取后，由语言模型组织对话稿，再交给语音后端生成音频并合成节目。官方提供 Python 和命令行入口，也支持单独生成文稿，方便先审阅内容。

`text_to_speech.py` 按后端处理多人语音，或者将说话人的片段分别合成后拼接。这说明自然程度同时受文稿结构、音色、停顿和合成方式影响。

源码主路径是 `client.process_content → ContentExtractor → ContentGenerator → TextToSpeech`。与前两篇的区别是：Kokoro 负责生成声音，DigUp 编码内容以供检索，Podcastfy 组织“资料改写＋声音生成”。已检查的主路径没有给资料建立向量检索库，也没有训练新的播客模型。

### 提取与改写是不同步骤

网页通过 Playwright 获取 HTML，BeautifulSoup 清理非正文元素；PDF 用 PyMuPDF `get_text()` 提取文字，未见自动 OCR，且直接打开文件路径，不能将所有远程 PDF 链接视为可用入口。YouTube 使用字幕 API，不是逐帧看视频，也未见缺字幕时自动转录的回退流程。

非本地文稿路径可将图像作为多模态消息传递，但需要选用支持图像的模型。`is_local` 路径不传图片；`longform` 直接拒绝图像输入。`topic` 路径调用 Gemini 和 Google Search grounding，返回文本后进入改写，不等于形成完整可审计的引用链。

### 一个模型也可以写两个人的台词

`roles_person1`、`roles_person2`、`conversation_style`、`dialogue_structure`、`output_language` 等配置进入提示。标准路径调用文稿链，写出 `<Person1>…</Person1>` 和 `<Person2>…</Person2>`。

这两个标记是交接格式，不是声音向量或两个独立 Agent。同一个模型可以同时写双方台词，双方互相赞同也不是事实核实。默认内容角色是总结者和追问／澄清者，角色行为与 TTS 音色是两个层面的设置。

### 长文分段不是检索记忆

长文生成按输入字符量计算块大小，再用英文 `. ` 切句。第一个调用携带原始输入作为上下文，后续携带累计生成的对话；输出直接拼接，再清理标记、合并相邻同角色段落。

默认配置为 `max_num_chunks: 8`、`min_chunk_size: 600`，但实际句子边界影响分块，不能当作严格 token 上限或固定节目时长。中文、单个长句、重复与遗漏需要单独测试。累积上下文增加输入成本，也可能传播早期错误。当前实际清理函数主要修正标签；源码中保留的旧清理／重写函数不应被当成正在执行的流程。

### 两种声音路径

普通路径解析角色对，按配置选择两种声音，逐段调用 TTS，按轮次与角色顺序用 Pydub 相加并导出。这里没有保证自动混音、统一响度或自然重叠抢话。

多说话人路径把对话交给对应服务，然后合并返回音频块。研究版本该分支硬编码 `en-US-Studio-MultiSpeaker` 和 `R` / `S` 声音，不能泛化为任意中文声音可组合；端点当前可用性未调用验证。

推荐把事实核对放在两个阶段之间：先 `transcript_only=True` 保存稿件，人工修订，再以 `transcript_file` 配音。程序支持这种分步用法，但默认全流程调用并不会自动等待人工审批。

## 配置和成本

README 要求 Python 3.11+。固定版本配置的文稿模型是 `gemini-2.5-flash`，语音默认是 OpenAI / `tts-1-hd`；这是配置快照，不是端点与价格验证。音频导出需可用 FFmpeg，网页提取还需浏览器依赖。文档也列出本地 LLM 加 Edge 的无 API 密钥组合。**无 API 密钥并不等于无需联网**，Edge 仍是网络语音服务。

本地 LLM 文档中的 `is_local` 针对对话稿生成，不能据此认为音频阶段也使用本地模型。模型与 TTS 的费用、网络需求需要分别记录。

源码本地后端使用 Llamafile，提示模板仍通过 `hub.pull` 获取；输入网页、YouTube 字幕与主题搜索也是独立网络环节。“输出文件在本地”不能证明整条流程离线。

## 第一次实验

用一篇自写的 800 字说明文，先只生成对话稿。逐项检查是否保留核心事实、有没有添加没有依据的数字或故事、两人是否在机械重复。稿件通过后再合成两分钟音频，检查名字、术语和轮流说话的停顿。

提前列出五个事实、两个易错术语；记录原始与修订文稿、模型和提示版本、TTS 声音、分阶段耗时与用量。目标约两分钟不等于承诺输出时长。换音色时固定稿件，长文另测中文分块，避免把文稿差异和声音差异混在一起。

**理解检查**：把文章全文读出来，与把文章改写为对话，分别在哪一步发生？

## 与 Kokoro 的区别

Kokoro 主要负责声音，Podcastfy 负责资料到节目的组织过程。此次检查的语音模块没有把 Kokoro 列为现成后端；如果未来希望替换，需要另做接口适配并验证。

运行状态：未部署、未调用 API、未生成播客。版本和来源见下方。

## 固定版本与来源

研究日期：2026-10-20。Commit：`053b54a0917e35edb2808049499292361ccaae7b`。GitHub 元数据中的许可证标识：`Apache-2.0`。

- [官方 README](https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/README.md)
- [usage/config.md](https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/usage/config.md)
- [usage/local_llm.md](https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/usage/local_llm.md)
- [podcastfy/text_to_speech.py](https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/text_to_speech.py)
- [pyproject.toml](https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/pyproject.toml)
- [client.py：主流程与分步入口](https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/client.py)
- [content_generator.py：文稿、长文与本地后端](https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/content_generator.py)
- [conversation_config.yaml：角色与声音](https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/conversation_config.yaml)
- [config.yaml：模型与模板版本](https://github.com/souzatharsis/podcastfy/blob/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/config.yaml)
- [content_parser：提取器源码](https://github.com/souzatharsis/podcastfy/tree/053b54a0917e35edb2808049499292361ccaae7b/podcastfy/content_parser)

[返回研究总览](../README.md) · [实验记录](07-experiments.md)
