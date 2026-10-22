# 模型与工具清单

资料日期：2026-10-23。官方指标，不是本项目实测。

## MuseTalk v1.5

- 类型：口型模型
- 输入：视频帧＋音频
- 输出：重绘后的人脸 / 视频
- 硬件：官方：V100 30+ FPS；LiveTalking 集成另有 3090 / 4090 数据。非本项目实测。
- 表现：保留底片的主要外观与动作；脸部细节和融合决定最终质感。
- 限制：不生成身体动作；侧脸、遮挡、口部边界需要实测。
- 许可：代码 MIT；官方允许模型商用，依赖模型与素材另查。
- 来源：[MuseTalk 官方仓库](https://github.com/TMElyralab/MuseTalk)

## Wav2Lip

- 类型：口型模型
- 输入：视频＋新语音
- 输出：对齐新语音的口型视频
- 硬件：旧模型可作为轻量基线；无本项目统一硬件结果。
- 表现：经典音画同步基线，适合帮助理解口型替换。
- 限制：旧开源版画质有限；第三方高清分支不等同于原版。
- 许可：原仓库明确限制研究 / 个人 / 非商用；商业版另算。
- 来源：[Wav2Lip 官方仓库](https://github.com/Rudrabha/Wav2Lip)

## LatentSync 1.6

- 类型：扩散口型模型
- 输入：视频＋语音
- 输出：口型重绘视频
- 硬件：官方最低推理显存：1.5 为 8GB，1.6 为 18GB。
- 表现：扩散式口型处理；1.6 面向更高分辨率面部细节。
- 限制：能在显卡上运行不等于可流式实时；先作离线画质参照。
- 许可：部署前检查固定版本 LICENSE 与权重依赖；不据公开代码直接推断全链路商用。
- 来源：[LatentSync 官方仓库](https://github.com/bytedance/LatentSync)

## Ditto

- 类型：运动空间生成模型
- 输入：角色图＋音频
- 输出：动态人像视频
- 硬件：官方环境含 TensorRT 8.6.1；引擎兼容性需匹配 GPU。
- 表现：生成头部运动与表情，不仅仅在已有视频上换嘴。
- 限制：头部能力不等于自由身体动作；八种情绪效果只有用户测试描述，缺测量记录。
- 许可：仓库 Apache-2.0；附属检测器 / 音频权重许可需分别核查。
- 来源：[Ditto 官方仓库](https://github.com/antgroup/ditto-talkinghead)

## LivePortrait

- 类型：运动迁移模型
- 输入：源图＋驱动视频 / 运动控制
- 输出：被驱动的人像视频
- 硬件：官方有加速和部署说明；不同封装性能不可混用。
- 表现：适合复用表演中的头姿和表情。
- 限制：原版核心不是音频→自主聊天；需另加音频运动预测。
- 许可：代码和权重、依赖分开核查，尤其人脸分析相关模型。
- 来源：[LivePortrait 官方仓库](https://github.com/KlingAIResearch/LivePortrait)

## SadTalker

- 类型：单图说话模型
- 输入：单图＋音频
- 输出：头部说话视频
- 硬件：先按离线基线测试，不承诺直播帧率。
- 表现：从音频预测运动系数并生成说话人像。
- 限制：内部 3D 运动系数不等于可交互的完整三维人物。
- 许可：官方说明已更新为 Apache-2.0；依赖许可单独检查。
- 来源：[SadTalker 官方仓库](https://github.com/OpenTalker/SadTalker)

## SoulX-FlashHead Lite

- 类型：流式人像模型
- 输入：参考图＋音频
- 输出：生成式人像视频流
- 硬件：官方：单 RTX 4090 96 FPS，或 3 路 25+ FPS；需按原配置复现。
- 表现：值得验证是否比素材循环更自然、较少重复。
- 限制：主要是 talking head；不能把推理速度当端到端延迟。
- 许可：代码 Apache-2.0；Lite 的 VAE_LTX 保留 Open-RAIL-M 条款。
- 来源：[SoulX-FlashHead 官方仓库](https://github.com/Soul-AILab/SoulX-FlashHead) · [FlashHead 权重与组件许可](https://huggingface.co/Soul-AILab/SoulX-FlashHead-1_3B)

## SoulX-FlashHead Pro

- 类型：流式人像模型
- 输入：参考图＋音频
- 输出：较高细节的人像视频
- 硬件：官方：4090 约 10.8 FPS；双 5090 配指定加速可达 25+ FPS。
- 表现：和 Lite 做同图同音频的质量 / 成本对照。
- 限制：单卡能生成不代表单卡实时；没有与 Vidu 的受控效果结论。
- 许可：代码与权重组件分别确认；沿用官方模型卡。
- 来源：[SoulX-FlashHead 官方仓库](https://github.com/Soul-AILab/SoulX-FlashHead) · [FlashHead 权重与组件许可](https://huggingface.co/Soul-AILab/SoulX-FlashHead-1_3B)

## SoulX-FlashTalk

- 类型：14B 流式生成模型
- 输入：参考图＋音频
- 输出：持续生成的数字人视频
- 硬件：官方仓库实时脚本说明为 8×H800 或更高配置。
- 表现：研究高容量生成模型的自然表现和长时流式能力。
- 限制：开源不意味着低租金；不作为低成本首轮配置。
- 许可：仓库 Apache-2.0；具体权重及依赖条件另核。
- 来源：[SoulX-FlashTalk 官方仓库](https://github.com/Soul-AILab/SoulX-FlashTalk)

## LiveAvatar

- 类型：14B 流式扩散模型
- 输入：参考图＋音频＋可选文本
- 输出：持续数字人视频
- 硬件：官方多 H800 实时；FP8 可降至 48GB 级显卡推理，单卡路径为离线。
- 表现：支持长时生成研究，具有更广的角色表现。
- 限制：48GB 能装下与单卡实时是两回事；GPU 数量、步数要写清。
- 许可：项目与 Wan 底座主要为 Apache-2.0，按固定版本核查。
- 来源：[LiveAvatar 官方仓库](https://github.com/Alibaba-Quark/LiveAvatar)

## Vidu S2-Avatar

- 类型：商业实时模型 / 服务
- 输入：角色参考图＋音频 / 对话与动作条件
- 输出：生成式音视频流
- 硬件：调用云服务；本页面没有可核实的当前报价或私有部署配置。
- 表现：官方支持动作指令和动态参考图交互；作为目标效果参照。
- 限制：可能发生画面漂移或动作失控；官方演示与原帖体验不是独立测评。
- 许可：商业服务；不将论文公开当成权重开源。
- 来源：[Vidu S2 技术论文 · 2026-09](https://arxiv.org/html/2609.11638v1) · [Vidu S2 官方产品介绍](https://go.vidu.com/zh/vidu-stream) · [Gary 曹淦原帖 · 应用案例](https://x.com/GaryAIytb/status/2112422551150620733)

## EchoMimicV2

- 类型：半身动画生成
- 输入：参考图＋音频＋手部姿态条件
- 输出：半身说话视频
- 硬件：官方测试过 A100 80G、4090D 24G、V100 16G；不是实时承诺。
- 表现：比只动嘴的方案更关注半身表达。
- 限制：需要姿态等条件，生成速度和素材可用率需实测。
- 许可：代码 / 权重 / 姿态及检测依赖逐项核查。
- 来源：[EchoMimicV2 官方仓库](https://github.com/antgroup/echomimic_v2)

## Hallo

- 类型：音频驱动扩散人像
- 输入：参考图＋音频
- 输出：说话人像视频
- 硬件：按离线视频生成评估，未记录统一 GPU 指标。
- 表现：用于头部动画与表情生成对照。
- 限制：不能仅因能生成连续视频就宣称实时交互。
- 许可：以官方仓库 LICENSE 和模型卡为准。
- 来源：[Hallo 官方仓库](https://github.com/fudan-generative-vision/hallo)

## RAD-NeRF

- 类型：逐角色神经渲染
- 输入：人物训练视频；运行时音频 / 姿态
- 输出：训练人物的视频
- 硬件：实现仓库报告 V100 约 40 FPS、推理约 2GB；不含训练及完整服务。
- 表现：用于固定人物语音驱动与神经渲染基线。
- 限制：训练视角之外与换装能力有限；需角色预处理和训练。
- 许可：代码、数据、依赖与人物授权分开核查。
- 来源：[RAD-NeRF 实现仓库](https://github.com/ashawkey/RAD-NeRF)

## ER-NeRF

- 类型：区域感知 NeRF
- 输入：人物训练视频＋音频
- 输出：人物神经渲染画面
- 硬件：项目研究实时渲染；具体配置按论文 / 实验记录复现。
- 表现：面向固定身份的局部区域音频驱动。
- 限制：不是通用 3D 全身角色；新的身份需重新准备。
- 许可：研究仓库；使用前核查许可证与资产依赖。
- 来源：[ER-NeRF 官方仓库](https://github.com/Fictionarry/ER-NeRF)

## GeneFace++

- 类型：音频运动＋神经渲染
- 输入：人物训练数据＋新音频
- 输出：特定身份说话视频
- 硬件：官方定位实时；本项目未记录可比配置。
- 表现：关注音频泛化、稳定性和人像渲染。
- 限制：有 3D 中间表示，不等于直接拥有可换装的骨骼人物。
- 许可：代码、权重、依赖分别核查。
- 来源：[GeneFace++ 官方仓库](https://github.com/yerfor/GeneFacePlusPlus)

## TalkingGaussian

- 类型：3D Gaussian Splatting
- 输入：训练人物视频＋音频
- 输出：可驱动的高斯人像渲染
- 硬件：需要逐角色训练；本项目无实测帧率。
- 表现：研究基于高斯表示的动态说话人像。
- 限制：高斯表示不是常规带骨骼网格；任意身体交互不能直接套用。
- 许可：核查仓库与底层 3DGS 组件许可。
- 来源：[TalkingGaussian 官方仓库](https://github.com/Fictionarry/TalkingGaussian)

## Audio2Face-3D SDK

- 类型：三维面部驱动 SDK
- 输入：音频＋兼容面部资产
- 输出：面部动画数据，需再渲染
- 硬件：官方推荐 CUDA 12.8+ 兼容 GPU、4GB+ 显存；不含高质量场景渲染预算。
- 表现：面部细节和情绪驱动可以与三维角色结合。
- 限制：不生成完整视频，也不自动生成身体动作；需重定向、眼神与身体层。
- 许可：SDK MIT；模型另有条款，Audio2Emotion 权重存在访问许可流程。
- 来源：[Audio2Face-3D SDK](https://github.com/NVIDIA/Audio2Face-3D-SDK)

## Audio2Face-3D Training

- 类型：训练框架
- 输入：同步面部动画＋音频数据
- 输出：可部署的面部驱动模型
- 硬件：需训练数据与训练资源；不能用推理硬件预算代替。
- 表现：适合特定角色、语言或风格的定制。
- 限制：不是现成完整主播；自训练前先验证预训练模型。
- 许可：训练框架 Apache-2.0；数据与模型独立核查。
- 来源：[Audio2Face-3D Training Framework](https://github.com/NVIDIA/Audio2Face-3D-Training-Framework)

## MetaHuman Animator

- 类型：角色与动画工具链
- 输入：MetaHuman＋音频 / 摄像头 / 深度表演
- 输出：面部动画＋引擎渲染
- 硬件：UE 与插件版本、编辑器 / 运行时能力需匹配；无统一云 GPU 报价。
- 表现：写实 3D 路线，面部与场景制作空间大。
- 限制：离线音频解算和实时 Live Link 不同；完整身体自然度仍依赖动画。
- 许可：商业引擎 / 工具与角色资产条款，不能归类为纯开源模型。
- 来源：[MetaHuman 音频驱动动画](https://dev.epicgames.com/documentation/en-us/metahuman/audio-driven-animation) · [MetaHuman 实时动画](https://dev.epicgames.com/documentation/en-us/metahuman/realtime-animation-for-metahumans-in-unreal-engine)

## TalkingHead

- 类型：浏览器 3D 框架
- 输入：兼容 GLB 人物＋语音 / 时间戳 / viseme
- 输出：Three.js/WebGL 三维角色
- 硬件：角色在客户端渲染；语音和对话费用另算。
- 表现：适合低服务器渲染成本的风格化网页角色。
- 限制：中文口型需核对语言模块或 TTS viseme；角色质量不是框架自动提供。
- 许可：框架 MIT；人物、动作、TTS 各自的许可独立。
- 来源：[TalkingHead / Three.js](https://github.com/met4citizen/TalkingHead)

## three-vrm

- 类型：VRM 渲染 / 控制库
- 输入：VRM 角色＋动画 / 表情参数
- 输出：浏览器内三维角色
- 硬件：依客户端 WebGL 和模型复杂度。
- 表现：适合已有 VRM 资产的风格化角色。
- 限制：不是语音识别、TTS 或口型 AI；需自己接表情和口型映射。
- 许可：库 MIT；VRM 资产作者设置的使用条件另外检查。
- 来源：[three-vrm](https://github.com/pixiv/three-vrm)

## Live2D Cubism

- 类型：2D 角色工具链
- 输入：分层立绘＋参数 / 音频
- 输出：二维角色动画
- 硬件：依客户端及模型复杂度，通常无需视频扩散 GPU。
- 表现：风格化角色的表情控制明确。
- 限制：大幅转身受美术制作限制；音量驱动开合≠音素级嘴型。
- 许可：工具和 SDK 有各自授权，不属于完全开源替代品。
- 来源：[Live2D Cubism 口型说明](https://docs.live2d.com/en/cubism-sdk-manual/lipsync/)

## Rhubarb Lip Sync

- 类型：嘴型时间轴工具
- 输入：现成语音文件
- 输出：嘴型标签与时间点
- 硬件：桌面命令行处理录音，不是默认在线流式服务。
- 表现：适合立绘嘴型切换与离线动画制作。
- 限制：输出嘴型标记，不输出逼真人脸视频。
- 许可：MIT；使用的角色素材需另有授权。
- 来源：[Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync)

## Vidu S2-Editing

- 类型：商业实时视频编辑
- 输入：源视频流＋参考图 / 编辑条件
- 输出：编辑后视频流
- 硬件：云服务；需持续提供输入视频。
- 表现：可以利用真人表演的自然动作。
- 限制：动作来源仍是输入表演，不是无人自主动作系统。
- 许可：商业服务；本页不声称可下载模型。
- 来源：[Vidu S2 技术论文 · 2026-09](https://arxiv.org/html/2609.11638v1) · [Vidu S2 官方产品介绍](https://go.vidu.com/zh/vidu-stream)

## LiveTalking

- 类型：整合与推流框架
- 输入：文本 / 音频＋数字人后端
- 输出：WebRTC / RTMP / 虚拟摄像头
- 硬件：公布 MuseTalk：3090 45 FPS、4090 72 FPS；需同时看 inferfps 与 finalfps。
- 表现：提供服务编排与推流能力，减少接线工作。
- 限制：它不是一个新的人像生成模型；不同后端能力和许可不同。
- 许可：框架 Apache-2.0；README 另有水印声明，后端许可需独立核对。
- 来源：[LiveTalking 官方仓库](https://github.com/lipku/LiveTalking)

## OpenSpline

- 类型：流式角色接入框架
- 输入：参考图＋外部语音流
- 输出：角色视频与播放接口
- 硬件：本地 NVIDIA GPU；依底层 FlashHead 与部署配置。
- 表现：可参考音视频同步、打断、待机状态的工程接口。
- 限制：不等于比 FlashHead 更强的新模型；服务商连接不等于全离线。
- 许可：框架 MIT；内嵌代码和权重另有条款。
- 来源：[OpenSpline](https://github.com/openspline/openspline)

## RIFE

- 类型：视频插帧模型
- 输入：两帧图像
- 输出：中间帧
- 硬件：官方示例：2080Ti，720p 2× 插帧 30+ FPS；不等于本系统总帧率。
- 表现：可平滑合理的连续运动。
- 限制：跨姿势 / 遮挡跳变可能形变；不能创造合理的完整过渡动作。
- 许可：按固定仓库版本 LICENSE 与模型文件核对。
- 来源：[RIFE 插帧](https://github.com/hzwer/ECCV2022-RIFE)

## CosyVoice

- 类型：语音生成
- 输入：文本＋音色条件
- 输出：语音 / 流式语音
- 硬件：需要单独测首音延迟、吞吐和显存竞争。
- 表现：本地中文语音候选，为头像驱动提供声音。
- 限制：声音情绪不会自动变成画面情绪。
- 许可：核对具体代际的代码、权重及声音素材条款。
- 来源：[CosyVoice](https://github.com/FunAudioLLM/CosyVoice)

## GPT-SoVITS

- 类型：语音合成与克隆
- 输入：文本＋参考语音 / 训练数据
- 输出：语音
- 硬件：各版本性能差异大，不混用不同代际的 RTF。
- 表现：适合做音色与中文语音对照。
- 限制：实时会话仍需分句、取消与流式接线。
- 许可：代码 MIT；模型和参考音色另查。
- 来源：[GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS)

## SenseVoice

- 类型：语音理解模型
- 输入：用户语音
- 输出：转写、语言 / 情绪 / 事件标签
- 硬件：服务延迟需包含 VAD、分段、网络和排队。
- 表现：为你的对话层提供识别入口。
- 限制：它不是 TTS 或数字人模型；识别情绪也不等于可靠的角色表演指令。
- 许可：按代码与所用 checkpoint 的模型卡核查。
- 来源：[SenseVoice](https://github.com/FunAudioLLM/SenseVoice)
