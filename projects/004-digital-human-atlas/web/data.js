window.ATLAS = {
  "date": "2026-10-23",
  "sources": [
    {
      "id": "muse",
      "title": "MuseTalk 官方仓库",
      "url": "https://github.com/TMElyralab/MuseTalk"
    },
    {
      "id": "wav",
      "title": "Wav2Lip 官方仓库",
      "url": "https://github.com/Rudrabha/Wav2Lip"
    },
    {
      "id": "latent",
      "title": "LatentSync 官方仓库",
      "url": "https://github.com/bytedance/LatentSync"
    },
    {
      "id": "ditto",
      "title": "Ditto 官方仓库",
      "url": "https://github.com/antgroup/ditto-talkinghead"
    },
    {
      "id": "portrait",
      "title": "LivePortrait 官方仓库",
      "url": "https://github.com/KlingAIResearch/LivePortrait"
    },
    {
      "id": "sad",
      "title": "SadTalker 官方仓库",
      "url": "https://github.com/OpenTalker/SadTalker"
    },
    {
      "id": "flash",
      "title": "SoulX-FlashHead 官方仓库",
      "url": "https://github.com/Soul-AILab/SoulX-FlashHead"
    },
    {
      "id": "flashweights",
      "title": "FlashHead 权重与组件许可",
      "url": "https://huggingface.co/Soul-AILab/SoulX-FlashHead-1_3B"
    },
    {
      "id": "flashtalk",
      "title": "SoulX-FlashTalk 官方仓库",
      "url": "https://github.com/Soul-AILab/SoulX-FlashTalk"
    },
    {
      "id": "liveavatar",
      "title": "LiveAvatar 官方仓库",
      "url": "https://github.com/Alibaba-Quark/LiveAvatar"
    },
    {
      "id": "livetalking",
      "title": "LiveTalking 官方仓库",
      "url": "https://github.com/lipku/LiveTalking"
    },
    {
      "id": "echo",
      "title": "EchoMimicV2 官方仓库",
      "url": "https://github.com/antgroup/echomimic_v2"
    },
    {
      "id": "hallo",
      "title": "Hallo 官方仓库",
      "url": "https://github.com/fudan-generative-vision/hallo"
    },
    {
      "id": "ernerf",
      "title": "ER-NeRF 官方仓库",
      "url": "https://github.com/Fictionarry/ER-NeRF"
    },
    {
      "id": "rad",
      "title": "RAD-NeRF 实现仓库",
      "url": "https://github.com/ashawkey/RAD-NeRF"
    },
    {
      "id": "gene",
      "title": "GeneFace++ 官方仓库",
      "url": "https://github.com/yerfor/GeneFacePlusPlus"
    },
    {
      "id": "gaussian",
      "title": "TalkingGaussian 官方仓库",
      "url": "https://github.com/Fictionarry/TalkingGaussian"
    },
    {
      "id": "a2f",
      "title": "Audio2Face-3D SDK",
      "url": "https://github.com/NVIDIA/Audio2Face-3D-SDK"
    },
    {
      "id": "a2ftrain",
      "title": "Audio2Face-3D Training Framework",
      "url": "https://github.com/NVIDIA/Audio2Face-3D-Training-Framework"
    },
    {
      "id": "meta",
      "title": "MetaHuman 音频驱动动画",
      "url": "https://dev.epicgames.com/documentation/en-us/metahuman/audio-driven-animation"
    },
    {
      "id": "metart",
      "title": "MetaHuman 实时动画",
      "url": "https://dev.epicgames.com/documentation/en-us/metahuman/realtime-animation-for-metahumans-in-unreal-engine"
    },
    {
      "id": "talkinghead",
      "title": "TalkingHead / Three.js",
      "url": "https://github.com/met4citizen/TalkingHead"
    },
    {
      "id": "vrm",
      "title": "three-vrm",
      "url": "https://github.com/pixiv/three-vrm"
    },
    {
      "id": "live2d",
      "title": "Live2D Cubism 口型说明",
      "url": "https://docs.live2d.com/en/cubism-sdk-manual/lipsync/"
    },
    {
      "id": "rhubarb",
      "title": "Rhubarb Lip Sync",
      "url": "https://github.com/DanielSWolf/rhubarb-lip-sync"
    },
    {
      "id": "rife",
      "title": "RIFE 插帧",
      "url": "https://github.com/hzwer/ECCV2022-RIFE"
    },
    {
      "id": "cosy",
      "title": "CosyVoice",
      "url": "https://github.com/FunAudioLLM/CosyVoice"
    },
    {
      "id": "sense",
      "title": "SenseVoice",
      "url": "https://github.com/FunAudioLLM/SenseVoice"
    },
    {
      "id": "sovits",
      "title": "GPT-SoVITS",
      "url": "https://github.com/RVC-Boss/GPT-SoVITS"
    },
    {
      "id": "spline",
      "title": "OpenSpline",
      "url": "https://github.com/openspline/openspline"
    },
    {
      "id": "vidupaper",
      "title": "Vidu S2 技术论文 · 2026-09",
      "url": "https://arxiv.org/html/2609.11638v1"
    },
    {
      "id": "vidu",
      "title": "Vidu S2 官方产品介绍",
      "url": "https://go.vidu.com/zh/vidu-stream"
    },
    {
      "id": "post",
      "title": "Gary 曹淦原帖 · 应用案例",
      "url": "https://x.com/GaryAIytb/status/2112422551150620733"
    }
  ],
  "routes": [
    {
      "id": "clips",
      "n": "01",
      "name": "素材视频＋实时口型",
      "tag": "我们当前的主线",
      "color": "green",
      "formula": [
        "角色设定 / 图片",
        "录制或生成动作素材",
        "状态调度＋口型重绘",
        "音画同步输出"
      ],
      "principle": "身体运动已经存在于视频里。运行时选择合适片段，再根据新语音重绘嘴部附近的人脸区域。角色图片主要在制作素材时使用，不必每帧重新输入。",
      "input": "清晰视频底片＋实时语音；表情标签与片段起止姿势可辅助调度。",
      "output": "二维视频帧。没有可任意旋转的三维角色。",
      "motion": "来自预制视频；MuseTalk 本身不负责临时生成拿杯子、挥手等身体动作。",
      "strength": "底片经过挑选后，皮肤、衣服、手势可以保持稳定；单路系统相对容易做成本控制。",
      "limit": "动作会重复；声音与眉眼表情可能不一致；侧脸、遮嘴、大张嘴与片段跳切容易暴露合成痕迹。",
      "fit": "固定机位聊天、陪伴、客服与讲解。",
      "cost": "制作素材的前期成本＋口型 GPU＋语音与对话成本。",
      "models": [
        "MuseTalk",
        "Wav2Lip",
        "LatentSync（偏离线）"
      ],
      "refs": [
        "muse",
        "wav",
        "latent"
      ],
      "test": "同一段语音分别配真实录制、AI 生成的底片，观察牙齿、下巴边界与动作重复。"
    },
    {
      "id": "portrait",
      "n": "02",
      "name": "单图驱动与运动迁移",
      "tag": "轻量人像动画",
      "color": "blue",
      "formula": [
        "一张角色图",
        "音频 / 驱动视频",
        "预测或提取运动",
        "变形＋神经渲染"
      ],
      "principle": "用紧凑的运动表示控制人像，再生成变形后的画面。音频驱动与视频驱动是不同入口：不能把 LivePortrait 原版直接当成完整语音聊天系统。",
      "input": "参考图＋音频，或参考图＋驱动视频 / 摄像头。",
      "output": "主要是人像视频；内部有 3D 关键点或运动系数，不代表交付一个完整 3D 人物。",
      "motion": "Ditto 根据音频生成运动；LivePortrait 主要迁移驱动视频中的表情和姿态。",
      "strength": "角色准备较轻，单图起步快，适合验证头部表情与互动。",
      "limit": "大幅转头、新露出的区域、手与脸遮挡、复杂身体动作需谨慎；运动自由度因模型而异。",
      "fit": "头像聊天、头肩像、替代固定照片的动态角色。",
      "cost": "主要是推理成本与环境适配；通常不用逐个角色训练完整模型。",
      "models": [
        "Ditto",
        "LivePortrait",
        "SadTalker"
      ],
      "refs": [
        "ditto",
        "portrait",
        "sad"
      ],
      "test": "固定音频和裁切，测视线、头部摆动、牙齿及长时身份一致性；保留你的 Ditto 回退。"
    },
    {
      "id": "offline",
      "n": "03",
      "name": "离线生成说话 / 动作视频",
      "tag": "用于制作素材",
      "color": "ochre",
      "formula": [
        "角色图＋音频 / 姿态",
        "视频生成模型",
        "等待完整片段",
        "筛选后进入素材库"
      ],
      "principle": "一次生成一段视频，允许花更长时间换取画面表现。可以给当前系统制作素材，但生成快于以前不代表支持低延迟流式互动。",
      "input": "参考图、音频，有些方法还接收姿态序列。",
      "output": "完整视频文件或批量片段。",
      "motion": "从生成模型产生，或受到外部姿态约束。",
      "strength": "可探索丰富表情和半身动作，适合预制、审核与挑片。",
      "limit": "等待时间、跨片身份变化、手部和遮挡瑕疵；长片往往还需分段与质量控制。",
      "fit": "高质量动作底片、短视频、固定台词讲解。",
      "cost": "按生成耗时计费，再加筛选和废片成本。",
      "models": [
        "EchoMimicV2",
        "Hallo",
        "LatentSync（视频改口型）"
      ],
      "refs": [
        "echo",
        "hallo",
        "latent"
      ],
      "test": "统计每个可用片段所需生成次数，避免只计算一次成功样片的费用。"
    },
    {
      "id": "stream",
      "n": "04",
      "name": "流式生成式数字人",
      "tag": "实时产生新画面",
      "color": "green",
      "formula": [
        "参考图＋音频 / 指令",
        "历史画面状态",
        "分块持续生成",
        "流式解码与播放"
      ],
      "principle": "在历史画面的条件下不断生成下一段。能创造新变化，但头部模型、半身模型和可执行复杂指令的模型不是同一能力级别。",
      "input": "参考图、音频；部分模型支持动作文本或动态参考图。",
      "output": "新生成的视频流，而非从固定动作库抽片。",
      "motion": "来自模型训练学到的运动分布；是否可精确执行动作必须逐项测试。",
      "strength": "有机会减少重复感，使表情与说话更协调。",
      "limit": "算力压力、累计漂移、动作失控、首包等待；公开演示不等于稳定的整小时会话。",
      "fit": "自然互动人像、动态陪伴，或更高预算的动作交互。",
      "cost": "推理 GPU 常驻；高质量大模型可能需要多卡。",
      "models": [
        "SoulX-FlashHead",
        "SoulX-FlashTalk",
        "LiveAvatar",
        "Vidu S2-Avatar"
      ],
      "refs": [
        "flash",
        "flashtalk",
        "liveavatar",
        "vidupaper"
      ],
      "test": "同图同音频比较 Lite 与 Pro；再做打断、沉默、30 分钟长跑和动作指令测试。"
    },
    {
      "id": "mesh",
      "n": "05",
      "name": "显式 3D 模型＋面部 / 身体驱动",
      "tag": "真正可操控的角色",
      "color": "blue",
      "formula": [
        "网格＋材质＋骨骼",
        "音频→面部曲线",
        "身体动画 / 动捕 / IK",
        "游戏引擎渲染"
      ],
      "principle": "用明确的三维人物资产，分别驱动脸和身体。Audio2Face 输出动画数据，渲染还要靠角色和引擎；MuseTalk 不是骨骼驱动器。",
      "input": "绑定好的 3D 模型、面部形变目标、语音和动作控制。",
      "output": "可控三维角色，再渲染到屏幕或视频流。",
      "motion": "面部来自语音 / 表演捕捉；身体来自动画库、动捕、程序 IK 或独立动作模型。",
      "strength": "相机、姿势、换装与物体位置可结构化控制；风格化角色也适合本地客户端渲染。",
      "limit": "写实资产、眼神、牙齿、舌头、头发和动画协调工作量大；面部驱动不自动解决自然肢体动作。",
      "fit": "游戏 NPC、VR、可走动和拿物的角色、长期可控角色产品。",
      "cost": "前期资产和动画制作成本高；运行成本取决于场景、画质和客户端 / 云渲染。",
      "models": [
        "MetaHuman Animator",
        "Audio2Face-3D",
        "TalkingHead＋Three.js",
        "three-vrm"
      ],
      "refs": [
        "meta",
        "metart",
        "a2f",
        "talkinghead",
        "vrm"
      ],
      "test": "先用现成合规角色跑面部与身体分层，不要一开始同时自建角色、绑定、动作和云渲染。"
    },
    {
      "id": "neural",
      "n": "06",
      "name": "NeRF / 3DGS 神经人像",
      "tag": "特定人物重建",
      "color": "ochre",
      "formula": [
        "某个人的训练视频",
        "逐角色训练 / 拟合",
        "音频与姿态条件",
        "神经渲染"
      ],
      "principle": "从人物视频学习可渲染的人像表示。它含有空间结构，但和可编辑网格、完整骨骼人物的资产流程不同。",
      "input": "训练用人物视频＋音频；部署时输入新语音与支持的姿态条件。",
      "output": "训练人物的合成视频。",
      "motion": "学习到的音频驱动变形与姿态控制，受训练视角和动作范围影响。",
      "strength": "适合固定身份、较固定视角的数字分身研究。",
      "limit": "每个人物的准备成本；换脸、换装、自由视角与全身交互通常不是直接附送的能力。",
      "fit": "固定人物数字分身、神经渲染实验。",
      "cost": "训练成本＋推理成本；需要把多角色重新训练算进去。",
      "models": [
        "RAD-NeRF",
        "ER-NeRF",
        "GeneFace++",
        "TalkingGaussian"
      ],
      "refs": [
        "rad",
        "ernerf",
        "gene",
        "gaussian"
      ],
      "test": "将训练数据外的新语音、新头部姿态单列评估，不能只看训练序列重建效果。"
    },
    {
      "id": "puppet",
      "n": "07",
      "name": "2D 立绘 / Live2D＋嘴型参数",
      "tag": "低算力风格化",
      "color": "blue",
      "formula": [
        "分层立绘 / 嘴型图集",
        "音量 / 音素检测",
        "表情与动作参数",
        "2D 实时渲染"
      ],
      "principle": "驱动嘴部开合、嘴型切换、头部角度与眨眼参数。它是角色动画技术，不以照片级真实为目标。",
      "input": "拆分制作的立绘、形变参数、语音及状态事件。",
      "output": "二维动画角色。",
      "motion": "作者制作的形变、动作曲线和状态调度。",
      "strength": "风格统一、运行轻、容易明确控制表情。",
      "limit": "转身和新视角受素材限制；只用音量张嘴不等于精准音素口型。",
      "fit": "桌宠、二次元陪伴、网页轻量角色。",
      "cost": "美术拆分和绑定成本；通常可降低服务器视频推理需求。",
      "models": [
        "Live2D Cubism",
        "Rhubarb Lip Sync"
      ],
      "refs": [
        "live2d",
        "rhubarb"
      ],
      "test": "分别测试音量驱动和音素驱动，检查中文、静音、爆破音与快速语句。"
    },
    {
      "id": "editing",
      "n": "08",
      "name": "真人 / 视频驱动的实时编辑",
      "tag": "动作已有来源",
      "color": "ochre",
      "formula": [
        "真人摄像头 / 视频",
        "外观参考与编辑指令",
        "实时视频编辑",
        "保留表演的输出流"
      ],
      "principle": "保持输入表演的运动和时间关系，实时编辑人物、服装或背景。需要源视频或真人，不能称为自主生成所有动作。",
      "input": "持续的视频流＋参考图 / 编辑条件。",
      "output": "编辑后的视频流。",
      "motion": "主要来自输入视频 / 真人表演。",
      "strength": "真人表演可提供复杂、自然的动作节奏。",
      "limit": "仍有表演来源成本，遮挡与身份一致性可能出错；不能把换脸和完整自主主播混为一谈。",
      "fit": "有人驱动的虚拟直播、实时风格转换。",
      "cost": "表演人员 / 视频来源＋编辑模型或 API。",
      "models": [
        "Vidu S2-Editing",
        "LivePortrait（仅人像运动迁移）"
      ],
      "refs": [
        "vidupaper",
        "vidu",
        "portrait"
      ],
      "test": "测试快速动作、手遮脸、出画与回画，单独记录原始输入和编辑结果。"
    }
  ],
  "models": [
    {
      "id": "muse",
      "name": "MuseTalk v1.5",
      "route": "clips",
      "type": "口型模型",
      "input": "视频帧＋音频",
      "output": "重绘后的人脸 / 视频",
      "hardware": "官方：V100 30+ FPS；LiveTalking 集成另有 3090 / 4090 数据。非本项目实测。",
      "quality": "保留底片的主要外观与动作；脸部细节和融合决定最终质感。",
      "limit": "不生成身体动作；侧脸、遮挡、口部边界需要实测。",
      "license": "代码 MIT；官方允许模型商用，依赖模型与素材另查。",
      "refs": [
        "muse"
      ],
      "priority": "当前主力",
      "local": true
    },
    {
      "id": "wav",
      "name": "Wav2Lip",
      "route": "clips",
      "type": "口型模型",
      "input": "视频＋新语音",
      "output": "对齐新语音的口型视频",
      "hardware": "旧模型可作为轻量基线；无本项目统一硬件结果。",
      "quality": "经典音画同步基线，适合帮助理解口型替换。",
      "limit": "旧开源版画质有限；第三方高清分支不等同于原版。",
      "license": "原仓库明确限制研究 / 个人 / 非商用；商业版另算。",
      "refs": [
        "wav"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "latent",
      "name": "LatentSync 1.6",
      "route": "clips",
      "type": "扩散口型模型",
      "input": "视频＋语音",
      "output": "口型重绘视频",
      "hardware": "官方最低推理显存：1.5 为 8GB，1.6 为 18GB。",
      "quality": "扩散式口型处理；1.6 面向更高分辨率面部细节。",
      "limit": "能在显卡上运行不等于可流式实时；先作离线画质参照。",
      "license": "部署前检查固定版本 LICENSE 与权重依赖；不据公开代码直接推断全链路商用。",
      "refs": [
        "latent"
      ],
      "priority": "画质参照",
      "local": true
    },
    {
      "id": "ditto",
      "name": "Ditto",
      "route": "portrait",
      "type": "运动空间生成模型",
      "input": "角色图＋音频",
      "output": "动态人像视频",
      "hardware": "官方环境含 TensorRT 8.6.1；引擎兼容性需匹配 GPU。",
      "quality": "生成头部运动与表情，不仅仅在已有视频上换嘴。",
      "limit": "头部能力不等于自由身体动作；八种情绪效果只有用户测试描述，缺测量记录。",
      "license": "仓库 Apache-2.0；附属检测器 / 音频权重许可需分别核查。",
      "refs": [
        "ditto"
      ],
      "priority": "已有回退",
      "local": true
    },
    {
      "id": "portrait",
      "name": "LivePortrait",
      "route": "portrait",
      "type": "运动迁移模型",
      "input": "源图＋驱动视频 / 运动控制",
      "output": "被驱动的人像视频",
      "hardware": "官方有加速和部署说明；不同封装性能不可混用。",
      "quality": "适合复用表演中的头姿和表情。",
      "limit": "原版核心不是音频→自主聊天；需另加音频运动预测。",
      "license": "代码和权重、依赖分开核查，尤其人脸分析相关模型。",
      "refs": [
        "portrait"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "sad",
      "name": "SadTalker",
      "route": "portrait",
      "type": "单图说话模型",
      "input": "单图＋音频",
      "output": "头部说话视频",
      "hardware": "先按离线基线测试，不承诺直播帧率。",
      "quality": "从音频预测运动系数并生成说话人像。",
      "limit": "内部 3D 运动系数不等于可交互的完整三维人物。",
      "license": "官方说明已更新为 Apache-2.0；依赖许可单独检查。",
      "refs": [
        "sad"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "flashlite",
      "name": "SoulX-FlashHead Lite",
      "route": "stream",
      "type": "流式人像模型",
      "input": "参考图＋音频",
      "output": "生成式人像视频流",
      "hardware": "官方：单 RTX 4090 96 FPS，或 3 路 25+ FPS；需按原配置复现。",
      "quality": "值得验证是否比素材循环更自然、较少重复。",
      "limit": "主要是 talking head；不能把推理速度当端到端延迟。",
      "license": "代码 Apache-2.0；Lite 的 VAE_LTX 保留 Open-RAIL-M 条款。",
      "refs": [
        "flash",
        "flashweights"
      ],
      "priority": "优先试验",
      "local": true
    },
    {
      "id": "flashpro",
      "name": "SoulX-FlashHead Pro",
      "route": "stream",
      "type": "流式人像模型",
      "input": "参考图＋音频",
      "output": "较高细节的人像视频",
      "hardware": "官方：4090 约 10.8 FPS；双 5090 配指定加速可达 25+ FPS。",
      "quality": "和 Lite 做同图同音频的质量 / 成本对照。",
      "limit": "单卡能生成不代表单卡实时；没有与 Vidu 的受控效果结论。",
      "license": "代码与权重组件分别确认；沿用官方模型卡。",
      "refs": [
        "flash",
        "flashweights"
      ],
      "priority": "画质参照",
      "local": true
    },
    {
      "id": "flashtalk",
      "name": "SoulX-FlashTalk",
      "route": "stream",
      "type": "14B 流式生成模型",
      "input": "参考图＋音频",
      "output": "持续生成的数字人视频",
      "hardware": "官方仓库实时脚本说明为 8×H800 或更高配置。",
      "quality": "研究高容量生成模型的自然表现和长时流式能力。",
      "limit": "开源不意味着低租金；不作为低成本首轮配置。",
      "license": "仓库 Apache-2.0；具体权重及依赖条件另核。",
      "refs": [
        "flashtalk"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "liveavatar",
      "name": "LiveAvatar",
      "route": "stream",
      "type": "14B 流式扩散模型",
      "input": "参考图＋音频＋可选文本",
      "output": "持续数字人视频",
      "hardware": "官方多 H800 实时；FP8 可降至 48GB 级显卡推理，单卡路径为离线。",
      "quality": "支持长时生成研究，具有更广的角色表现。",
      "limit": "48GB 能装下与单卡实时是两回事；GPU 数量、步数要写清。",
      "license": "项目与 Wan 底座主要为 Apache-2.0，按固定版本核查。",
      "refs": [
        "liveavatar"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "viduavatar",
      "name": "Vidu S2-Avatar",
      "route": "stream",
      "type": "商业实时模型 / 服务",
      "input": "角色参考图＋音频 / 对话与动作条件",
      "output": "生成式音视频流",
      "hardware": "调用云服务；本页面没有可核实的当前报价或私有部署配置。",
      "quality": "官方支持动作指令和动态参考图交互；作为目标效果参照。",
      "limit": "可能发生画面漂移或动作失控；官方演示与原帖体验不是独立测评。",
      "license": "商业服务；不将论文公开当成权重开源。",
      "refs": [
        "vidupaper",
        "vidu",
        "post"
      ],
      "priority": "效果参照",
      "local": false
    },
    {
      "id": "echo",
      "name": "EchoMimicV2",
      "route": "offline",
      "type": "半身动画生成",
      "input": "参考图＋音频＋手部姿态条件",
      "output": "半身说话视频",
      "hardware": "官方测试过 A100 80G、4090D 24G、V100 16G；不是实时承诺。",
      "quality": "比只动嘴的方案更关注半身表达。",
      "limit": "需要姿态等条件，生成速度和素材可用率需实测。",
      "license": "代码 / 权重 / 姿态及检测依赖逐项核查。",
      "refs": [
        "echo"
      ],
      "priority": "素材生产",
      "local": true
    },
    {
      "id": "hallo",
      "name": "Hallo",
      "route": "offline",
      "type": "音频驱动扩散人像",
      "input": "参考图＋音频",
      "output": "说话人像视频",
      "hardware": "按离线视频生成评估，未记录统一 GPU 指标。",
      "quality": "用于头部动画与表情生成对照。",
      "limit": "不能仅因能生成连续视频就宣称实时交互。",
      "license": "以官方仓库 LICENSE 和模型卡为准。",
      "refs": [
        "hallo"
      ],
      "priority": "素材生产",
      "local": true
    },
    {
      "id": "rad",
      "name": "RAD-NeRF",
      "route": "neural",
      "type": "逐角色神经渲染",
      "input": "人物训练视频；运行时音频 / 姿态",
      "output": "训练人物的视频",
      "hardware": "实现仓库报告 V100 约 40 FPS、推理约 2GB；不含训练及完整服务。",
      "quality": "用于固定人物语音驱动与神经渲染基线。",
      "limit": "训练视角之外与换装能力有限；需角色预处理和训练。",
      "license": "代码、数据、依赖与人物授权分开核查。",
      "refs": [
        "rad"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "er",
      "name": "ER-NeRF",
      "route": "neural",
      "type": "区域感知 NeRF",
      "input": "人物训练视频＋音频",
      "output": "人物神经渲染画面",
      "hardware": "项目研究实时渲染；具体配置按论文 / 实验记录复现。",
      "quality": "面向固定身份的局部区域音频驱动。",
      "limit": "不是通用 3D 全身角色；新的身份需重新准备。",
      "license": "研究仓库；使用前核查许可证与资产依赖。",
      "refs": [
        "ernerf"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "gene",
      "name": "GeneFace++",
      "route": "neural",
      "type": "音频运动＋神经渲染",
      "input": "人物训练数据＋新音频",
      "output": "特定身份说话视频",
      "hardware": "官方定位实时；本项目未记录可比配置。",
      "quality": "关注音频泛化、稳定性和人像渲染。",
      "limit": "有 3D 中间表示，不等于直接拥有可换装的骨骼人物。",
      "license": "代码、权重、依赖分别核查。",
      "refs": [
        "gene"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "gaussian",
      "name": "TalkingGaussian",
      "route": "neural",
      "type": "3D Gaussian Splatting",
      "input": "训练人物视频＋音频",
      "output": "可驱动的高斯人像渲染",
      "hardware": "需要逐角色训练；本项目无实测帧率。",
      "quality": "研究基于高斯表示的动态说话人像。",
      "limit": "高斯表示不是常规带骨骼网格；任意身体交互不能直接套用。",
      "license": "核查仓库与底层 3DGS 组件许可。",
      "refs": [
        "gaussian"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "a2f",
      "name": "Audio2Face-3D SDK",
      "route": "mesh",
      "type": "三维面部驱动 SDK",
      "input": "音频＋兼容面部资产",
      "output": "面部动画数据，需再渲染",
      "hardware": "官方推荐 CUDA 12.8+ 兼容 GPU、4GB+ 显存；不含高质量场景渲染预算。",
      "quality": "面部细节和情绪驱动可以与三维角色结合。",
      "limit": "不生成完整视频，也不自动生成身体动作；需重定向、眼神与身体层。",
      "license": "SDK MIT；模型另有条款，Audio2Emotion 权重存在访问许可流程。",
      "refs": [
        "a2f"
      ],
      "priority": "3D 备选",
      "local": true
    },
    {
      "id": "a2ftrain",
      "name": "Audio2Face-3D Training",
      "route": "mesh",
      "type": "训练框架",
      "input": "同步面部动画＋音频数据",
      "output": "可部署的面部驱动模型",
      "hardware": "需训练数据与训练资源；不能用推理硬件预算代替。",
      "quality": "适合特定角色、语言或风格的定制。",
      "limit": "不是现成完整主播；自训练前先验证预训练模型。",
      "license": "训练框架 Apache-2.0；数据与模型独立核查。",
      "refs": [
        "a2ftrain"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "meta",
      "name": "MetaHuman Animator",
      "route": "mesh",
      "type": "角色与动画工具链",
      "input": "MetaHuman＋音频 / 摄像头 / 深度表演",
      "output": "面部动画＋引擎渲染",
      "hardware": "UE 与插件版本、编辑器 / 运行时能力需匹配；无统一云 GPU 报价。",
      "quality": "写实 3D 路线，面部与场景制作空间大。",
      "limit": "离线音频解算和实时 Live Link 不同；完整身体自然度仍依赖动画。",
      "license": "商业引擎 / 工具与角色资产条款，不能归类为纯开源模型。",
      "refs": [
        "meta",
        "metart"
      ],
      "priority": "3D 备选",
      "local": true
    },
    {
      "id": "talkinghead",
      "name": "TalkingHead",
      "route": "mesh",
      "type": "浏览器 3D 框架",
      "input": "兼容 GLB 人物＋语音 / 时间戳 / viseme",
      "output": "Three.js/WebGL 三维角色",
      "hardware": "角色在客户端渲染；语音和对话费用另算。",
      "quality": "适合低服务器渲染成本的风格化网页角色。",
      "limit": "中文口型需核对语言模块或 TTS viseme；角色质量不是框架自动提供。",
      "license": "框架 MIT；人物、动作、TTS 各自的许可独立。",
      "refs": [
        "talkinghead"
      ],
      "priority": "3D 备选",
      "local": true
    },
    {
      "id": "vrm",
      "name": "three-vrm",
      "route": "mesh",
      "type": "VRM 渲染 / 控制库",
      "input": "VRM 角色＋动画 / 表情参数",
      "output": "浏览器内三维角色",
      "hardware": "依客户端 WebGL 和模型复杂度。",
      "quality": "适合已有 VRM 资产的风格化角色。",
      "limit": "不是语音识别、TTS 或口型 AI；需自己接表情和口型映射。",
      "license": "库 MIT；VRM 资产作者设置的使用条件另外检查。",
      "refs": [
        "vrm"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "live2d",
      "name": "Live2D Cubism",
      "route": "puppet",
      "type": "2D 角色工具链",
      "input": "分层立绘＋参数 / 音频",
      "output": "二维角色动画",
      "hardware": "依客户端及模型复杂度，通常无需视频扩散 GPU。",
      "quality": "风格化角色的表情控制明确。",
      "limit": "大幅转身受美术制作限制；音量驱动开合≠音素级嘴型。",
      "license": "工具和 SDK 有各自授权，不属于完全开源替代品。",
      "refs": [
        "live2d"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "rhubarb",
      "name": "Rhubarb Lip Sync",
      "route": "puppet",
      "type": "嘴型时间轴工具",
      "input": "现成语音文件",
      "output": "嘴型标签与时间点",
      "hardware": "桌面命令行处理录音，不是默认在线流式服务。",
      "quality": "适合立绘嘴型切换与离线动画制作。",
      "limit": "输出嘴型标记，不输出逼真人脸视频。",
      "license": "MIT；使用的角色素材需另有授权。",
      "refs": [
        "rhubarb"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "viduedit",
      "name": "Vidu S2-Editing",
      "route": "editing",
      "type": "商业实时视频编辑",
      "input": "源视频流＋参考图 / 编辑条件",
      "output": "编辑后视频流",
      "hardware": "云服务；需持续提供输入视频。",
      "quality": "可以利用真人表演的自然动作。",
      "limit": "动作来源仍是输入表演，不是无人自主动作系统。",
      "license": "商业服务；本页不声称可下载模型。",
      "refs": [
        "vidupaper",
        "vidu"
      ],
      "priority": "备选",
      "local": false
    },
    {
      "id": "livetalking",
      "name": "LiveTalking",
      "route": "support",
      "type": "整合与推流框架",
      "input": "文本 / 音频＋数字人后端",
      "output": "WebRTC / RTMP / 虚拟摄像头",
      "hardware": "公布 MuseTalk：3090 45 FPS、4090 72 FPS；需同时看 inferfps 与 finalfps。",
      "quality": "提供服务编排与推流能力，减少接线工作。",
      "limit": "它不是一个新的人像生成模型；不同后端能力和许可不同。",
      "license": "框架 Apache-2.0；README 另有水印声明，后端许可需独立核对。",
      "refs": [
        "livetalking"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "spline",
      "name": "OpenSpline",
      "route": "support",
      "type": "流式角色接入框架",
      "input": "参考图＋外部语音流",
      "output": "角色视频与播放接口",
      "hardware": "本地 NVIDIA GPU；依底层 FlashHead 与部署配置。",
      "quality": "可参考音视频同步、打断、待机状态的工程接口。",
      "limit": "不等于比 FlashHead 更强的新模型；服务商连接不等于全离线。",
      "license": "框架 MIT；内嵌代码和权重另有条款。",
      "refs": [
        "spline"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "rife",
      "name": "RIFE",
      "route": "support",
      "type": "视频插帧模型",
      "input": "两帧图像",
      "output": "中间帧",
      "hardware": "官方示例：2080Ti，720p 2× 插帧 30+ FPS；不等于本系统总帧率。",
      "quality": "可平滑合理的连续运动。",
      "limit": "跨姿势 / 遮挡跳变可能形变；不能创造合理的完整过渡动作。",
      "license": "按固定仓库版本 LICENSE 与模型文件核对。",
      "refs": [
        "rife"
      ],
      "priority": "已有组件",
      "local": true
    },
    {
      "id": "cosy",
      "name": "CosyVoice",
      "route": "support",
      "type": "语音生成",
      "input": "文本＋音色条件",
      "output": "语音 / 流式语音",
      "hardware": "需要单独测首音延迟、吞吐和显存竞争。",
      "quality": "本地中文语音候选，为头像驱动提供声音。",
      "limit": "声音情绪不会自动变成画面情绪。",
      "license": "核对具体代际的代码、权重及声音素材条款。",
      "refs": [
        "cosy"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "sovits",
      "name": "GPT-SoVITS",
      "route": "support",
      "type": "语音合成与克隆",
      "input": "文本＋参考语音 / 训练数据",
      "output": "语音",
      "hardware": "各版本性能差异大，不混用不同代际的 RTF。",
      "quality": "适合做音色与中文语音对照。",
      "limit": "实时会话仍需分句、取消与流式接线。",
      "license": "代码 MIT；模型和参考音色另查。",
      "refs": [
        "sovits"
      ],
      "priority": "备选",
      "local": true
    },
    {
      "id": "sense",
      "name": "SenseVoice",
      "route": "support",
      "type": "语音理解模型",
      "input": "用户语音",
      "output": "转写、语言 / 情绪 / 事件标签",
      "hardware": "服务延迟需包含 VAD、分段、网络和排队。",
      "quality": "为你的对话层提供识别入口。",
      "limit": "它不是 TTS 或数字人模型；识别情绪也不等于可靠的角色表演指令。",
      "license": "按代码与所用 checkpoint 的模型卡核查。",
      "refs": [
        "sense"
      ],
      "priority": "已有组件",
      "local": true
    }
  ],
  "matrix": [
    [
      "素材＋口型",
      "由底片决定，可很自然",
      "受预制素材限制",
      "可控切片，难临时组合新动作",
      "片段可预审；重复感明显",
      "中：口型推理",
      "低至中：你已有系统"
    ],
    [
      "单图运动驱动",
      "偏头部，视角与遮挡敏感",
      "有限头姿 / 表情",
      "取决于控制接口",
      "需测身份和变形",
      "低至中：依实现",
      "中：音频 / 运动接线"
    ],
    [
      "离线生成",
      "可挑选表现好的片段",
      "较丰富，依条件控制",
      "可提示或姿态约束",
      "需挑片；不适合即时回应",
      "按素材生产耗时",
      "中：审核与素材管理"
    ],
    [
      "实时生成",
      "有机会更协调，未同条件验证",
      "头部到全身差异很大",
      "有文本控制不等于精确执行",
      "漂移和异常帧需测",
      "中至高：模型差异大",
      "高：流式与状态一致性"
    ],
    [
      "显式 3D",
      "依资产、材质、动画质量",
      "骨骼范围内可拓展",
      "空间约束 / IK 更明确",
      "资产稳定；表演仍需设计",
      "客户端轻量至云端高画质",
      "高：资产、绑定、身体动作"
    ],
    [
      "神经人像",
      "固定人物 / 视角有优势",
      "受训练分布限制",
      "通常局限人像控制",
      "需测新音频、新姿态",
      "训练与推理分开算",
      "高：逐角色训练"
    ],
    [
      "Live2D / 立绘",
      "风格化，不追求照片真实",
      "受绑定和分层限制",
      "参数控制明确",
      "风格稳定、动作可预制",
      "较低客户端成本",
      "中：美术拆分与绑定"
    ],
    [
      "实时编辑",
      "继承真人表演优势",
      "取决于输入视频",
      "表演可控、编辑有不确定性",
      "源表演稳定，合成仍会失真",
      "模型费用＋表演来源",
      "中至高：视频与编辑链路"
    ]
  ],
  "glossary": [
    [
      "Lip sync / 对口型",
      "使嘴部运动与语音匹配；可通过像素重绘、嘴型图片切换或 3D 面部曲线实现。"
    ],
    [
      "Viseme / 视素",
      "一组视觉嘴型。多个发音可能对应同一嘴型；与音量大小不是同一个概念。"
    ],
    [
      "Blendshape / 形变目标",
      "三维面部预定义形状，通过权重组合出张嘴、微笑等表情。"
    ],
    [
      "Rig / 绑定",
      "将网格连接到骨骼和控制器；拥有 3D 模型不代表已经绑定、可口型驱动。"
    ],
    [
      "IK / 逆向运动学",
      "从手要到达的位置反求关节姿态；可约束拿物，但不自动赋予自然表演。"
    ],
    [
      "Motion retargeting / 动作重定向",
      "把一个角色或演员的运动映射到另一套骨骼或面部参数。"
    ],
    [
      "NeRF / 神经辐射场",
      "用神经表示重建和渲染场景；人物特化方法通常需要训练数据。"
    ],
    [
      "3DGS / 三维高斯",
      "以可渲染的高斯表示外观与空间结构；不等同于游戏角色网格。"
    ],
    [
      "Streaming / 流式",
      "输入和输出分块持续进行。完成一个短片很快，不足以证明完整会话流式。"
    ],
    [
      "FPS / 帧率",
      "每秒处理或输出帧数。必须注明推理、编码、发送还是实际播放帧率。"
    ],
    [
      "RTF / 实时因子",
      "处理耗时÷媒体时长，小于 1 表示吞吐快于播放；不说明首次响应多快。"
    ],
    [
      "P50 / P95 延迟",
      "中位数与第 95 百分位等待时间；均值可能掩盖频繁的长尾卡顿。"
    ],
    [
      "VAD / 语音活动检测",
      "判断用户是否在说话，影响断句、结束等待与打断响应。"
    ],
    [
      "A/V sync / 音画同步",
      "声音和嘴型的时间差；平均 FPS 足够也可能出现越聊越不同步。"
    ],
    [
      "TensorRT engine",
      "优化后的推理引擎文件；GPU 架构、CUDA / TensorRT 版本兼容性需单独核验。"
    ]
  ],
  "tests": [
    [
      "identity",
      "固定角色与输入",
      "同一角色、同一裁切、同一段中文 WAV，保存模型版本、种子和参数。"
    ],
    [
      "lip",
      "口型压力样本",
      "覆盖 b/p/m 闭唇、f/v 唇齿、快语速、停顿、数字、中英混读；重点看牙齿与下巴。"
    ],
    [
      "emotion",
      "八种情绪复测",
      "沿用已有八种情绪标签，固定强度和文本；区分声音变化、脸部变化和身体变化。"
    ],
    [
      "occlusion",
      "姿态与遮挡",
      "正脸、小角度侧脸、低头、手遮嘴、眼镜和头发遮挡；记录失败而非只选成功样片。"
    ],
    [
      "idle",
      "听与说的切换",
      "听 10 秒→回答→被打断→再次听，检查闭嘴、眼神、旧音频残留与身体跳变。"
    ],
    [
      "latency",
      "端到端时间戳",
      "记录用户结束、ASR 完成、首 token、首音频、首视频与实际播放；区分串行和重叠。"
    ],
    [
      "long",
      "连续运行 30 分钟",
      "包含沉默、快速交替、长句和重复问题，监控显存、漂移、重复、音画偏差与重连。"
    ],
    [
      "concurrency",
      "单路和多路分开",
      "单路通过后再加并发；测 P95、丢帧和播放队列，不按峰值 FPS 线性外推。"
    ],
    [
      "blind",
      "盲测两种真实感",
      "分别评价外观真实度与互动自然度；打乱 A/B 顺序，不把官方视频当同条件对比。"
    ],
    [
      "cost",
      "记录完整费用",
      "记录租赁、准备、失败重跑、空闲、磁盘、网络和 API；导出每成功会话小时成本。"
    ]
  ],
  "evidence": {
    "checked_on": "2026-10-23",
    "method": "Official repository README fetched at pinned HEAD; SHA-256 of retrieved bytes; no model inference performed.",
    "repositories": [
      {
        "repository": "TMElyralab/MuseTalk",
        "url": "https://github.com/TMElyralab/MuseTalk",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "0a89dec45a0192b824e3cf4daf96c239440c5ed8",
        "source_url": "https://raw.githubusercontent.com/TMElyralab/MuseTalk/0a89dec45a0192b824e3cf4daf96c239440c5ed8/README.md",
        "sha256": "63587c38fa53bd3292654a71aa6978628db02dd02cc93153030f3d0dca7721bf",
        "bytes": 22817,
        "status": "verified"
      },
      {
        "repository": "Rudrabha/Wav2Lip",
        "url": "https://github.com/Rudrabha/Wav2Lip",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "bac9a81e63ecc153202353372e5724b83d9e6322",
        "source_url": "https://raw.githubusercontent.com/Rudrabha/Wav2Lip/bac9a81e63ecc153202353372e5724b83d9e6322/README.md",
        "sha256": "8019ca16cf27529731bebed3c2f542046d6db1797cf38042cd1d27f4793ecd34",
        "bytes": 17062,
        "status": "verified"
      },
      {
        "repository": "bytedance/LatentSync",
        "url": "https://github.com/bytedance/LatentSync",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "a229c3948406bc2cf6eaf4873e662e70c6a04746",
        "source_url": "https://raw.githubusercontent.com/bytedance/LatentSync/a229c3948406bc2cf6eaf4873e662e70c6a04746/README.md",
        "sha256": "f4efe6ac062511b5de6ff65db110aa3d755fef662277c3bb4dd16dbfa02362b1",
        "bytes": 10216,
        "status": "verified"
      },
      {
        "repository": "antgroup/ditto-talkinghead",
        "url": "https://github.com/antgroup/ditto-talkinghead",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "c3e47eee2e626500017a0556b470d6d4182f85e8",
        "source_url": "https://raw.githubusercontent.com/antgroup/ditto-talkinghead/c3e47eee2e626500017a0556b470d6d4182f85e8/README.md",
        "sha256": "f39329835c98a021a6d1b2d1ac6b09751333de5ebd45995d29efbd43adfd63c0",
        "bytes": 9074,
        "status": "verified"
      },
      {
        "repository": "KlingAIResearch/LivePortrait",
        "url": "https://github.com/KlingAIResearch/LivePortrait",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "9b294b3d0536135442ea73cb01e6cb3ca7029dd3",
        "source_url": "https://raw.githubusercontent.com/KlingAIResearch/LivePortrait/9b294b3d0536135442ea73cb01e6cb3ca7029dd3/readme.md",
        "sha256": "ba9144f3a57c4acdeae3e51cdaf379b41c32ffe27ec7ff4b279265995ad01878",
        "bytes": 21614,
        "status": "verified"
      },
      {
        "repository": "OpenTalker/SadTalker",
        "url": "https://github.com/OpenTalker/SadTalker",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "cd4c0465ae0b54a6f85af57f5c65fec9fe23e7f8",
        "source_url": "https://raw.githubusercontent.com/OpenTalker/SadTalker/cd4c0465ae0b54a6f85af57f5c65fec9fe23e7f8/README.md",
        "sha256": "ee4a7802cc7735fdc3077d8d6f75fcda7012e84fce714b1cb4603c13b2552d4c",
        "bytes": 17124,
        "status": "verified"
      },
      {
        "repository": "Soul-AILab/SoulX-FlashHead",
        "url": "https://github.com/Soul-AILab/SoulX-FlashHead",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "9bc03de06bb0de82cd6bc477804512ae06144bf2",
        "source_url": "https://raw.githubusercontent.com/Soul-AILab/SoulX-FlashHead/9bc03de06bb0de82cd6bc477804512ae06144bf2/README.md",
        "sha256": "68910832b2f23db1395f1aaa980eb26e1014a2980bf62013231f5900e2b08378",
        "bytes": 11284,
        "status": "verified"
      },
      {
        "repository": "Soul-AILab/SoulX-FlashTalk",
        "url": "https://github.com/Soul-AILab/SoulX-FlashTalk",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "2ba2e1e801d59a9f526212a5aae5d374db8f2978",
        "source_url": "https://raw.githubusercontent.com/Soul-AILab/SoulX-FlashTalk/2ba2e1e801d59a9f526212a5aae5d374db8f2978/README.md",
        "sha256": "1b17b90787e8c1ebd6368562d7bf98ffccf540b9e15c326d3d14ad4dc512b296",
        "bytes": 12367,
        "status": "verified"
      },
      {
        "repository": "Alibaba-Quark/LiveAvatar",
        "url": "https://github.com/Alibaba-Quark/LiveAvatar",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "c3c47d031d8bf3247428333c1fe610579c71a551",
        "source_url": "https://raw.githubusercontent.com/Alibaba-Quark/LiveAvatar/c3c47d031d8bf3247428333c1fe610579c71a551/README.md",
        "sha256": "3e99c945e06a59f53ac9def8e01945c46c90b2a08601d7fb11527c4b482b8763",
        "bytes": 12653,
        "status": "verified"
      },
      {
        "repository": "lipku/LiveTalking",
        "url": "https://github.com/lipku/LiveTalking",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "c7269433a2b6ecebcd9342445d2ecc882c98b0da",
        "source_url": "https://raw.githubusercontent.com/lipku/LiveTalking/c7269433a2b6ecebcd9342445d2ecc882c98b0da/README.md",
        "sha256": "0a74f10d4fedcb4b2008483380f82c0cf6e2e49d5b96f67d98b16cb9275f50ac",
        "bytes": 10217,
        "status": "verified"
      },
      {
        "repository": "antgroup/echomimic_v2",
        "url": "https://github.com/antgroup/echomimic_v2",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "38c86809efa041884c774ee31d984a9577c0e0aa",
        "source_url": "https://raw.githubusercontent.com/antgroup/echomimic_v2/38c86809efa041884c774ee31d984a9577c0e0aa/README.md",
        "sha256": "ea5112f662972ce6564cc91c3d0dcdfc92318fed50052eaaad60e15ea1b049c6",
        "bytes": 14891,
        "status": "verified"
      },
      {
        "repository": "fudan-generative-vision/hallo",
        "url": "https://github.com/fudan-generative-vision/hallo",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "8fd7c572a3d43c2a9c1a5473219ce4fc1b6e3ed2",
        "source_url": "https://raw.githubusercontent.com/fudan-generative-vision/hallo/8fd7c572a3d43c2a9c1a5473219ce4fc1b6e3ed2/README.md",
        "sha256": "cf72b5dda3493fba73849283bec952f0c7537547d64677f80fc1a48e97f8ab67",
        "bytes": 20085,
        "status": "verified"
      },
      {
        "repository": "Fictionarry/ER-NeRF",
        "url": "https://github.com/Fictionarry/ER-NeRF",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "0cf72d8fb598d321de86b445bcd363cc2f6346a5",
        "source_url": "https://raw.githubusercontent.com/Fictionarry/ER-NeRF/0cf72d8fb598d321de86b445bcd363cc2f6346a5/README.md",
        "sha256": "accd10ff116ccd1eb10859812d0ff9a3ea2cb1488e1a62d3edcabac3f36ea498",
        "bytes": 7156,
        "status": "verified"
      },
      {
        "repository": "ashawkey/RAD-NeRF",
        "url": "https://github.com/ashawkey/RAD-NeRF",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "0de5ed259592592294677ad6cf7605f478a0de57",
        "source_url": "https://raw.githubusercontent.com/ashawkey/RAD-NeRF/0de5ed259592592294677ad6cf7605f478a0de57/readme.md",
        "sha256": "ec03dbb8a4f836ef5e2a96a389795831033e585f669bf85053038499a93653b7",
        "bytes": 8607,
        "status": "verified"
      },
      {
        "repository": "yerfor/GeneFacePlusPlus",
        "url": "https://github.com/yerfor/GeneFacePlusPlus",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "6c35651d9b731c041e3f10b0577b8ace24d65806",
        "source_url": "https://raw.githubusercontent.com/yerfor/GeneFacePlusPlus/6c35651d9b731c041e3f10b0577b8ace24d65806/README.md",
        "sha256": "3fa6ce9f29ee05533b0e3600cc1c6d973340dfd48b0126baf772f466b24156aa",
        "bytes": 5239,
        "status": "verified"
      },
      {
        "repository": "Fictionarry/TalkingGaussian",
        "url": "https://github.com/Fictionarry/TalkingGaussian",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "9bd34f732e30cd94c0a9a087a125d2dda228e258",
        "source_url": "https://raw.githubusercontent.com/Fictionarry/TalkingGaussian/9bd34f732e30cd94c0a9a087a125d2dda228e258/README.md",
        "sha256": "a3c59bc9494018b4280fc4c7345d2aa9e9f9bcc76bdabf412b0e6a6d8b3c85e0",
        "bytes": 6218,
        "status": "verified"
      },
      {
        "repository": "NVIDIA/Audio2Face-3D-SDK",
        "url": "https://github.com/NVIDIA/Audio2Face-3D-SDK",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "1ca0f02535ed774f5dbcd724a31cd486368dc783",
        "source_url": "https://raw.githubusercontent.com/NVIDIA/Audio2Face-3D-SDK/1ca0f02535ed774f5dbcd724a31cd486368dc783/README.md",
        "sha256": "b6415ea8c479c54ce632103fd0b6b48d7fc4a1db932f478d271d396cfe9cc0bc",
        "bytes": 12527,
        "status": "verified"
      },
      {
        "repository": "NVIDIA/Audio2Face-3D-Training-Framework",
        "url": "https://github.com/NVIDIA/Audio2Face-3D-Training-Framework",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "112c5eb3408afd065ac8974b2c6ea9ab0e3965c6",
        "source_url": "https://raw.githubusercontent.com/NVIDIA/Audio2Face-3D-Training-Framework/112c5eb3408afd065ac8974b2c6ea9ab0e3965c6/README.md",
        "sha256": "86fffdcffa6f6c411c22313607ff84789c22dccef59342a2bbbf5a18831b4a82",
        "bytes": 11485,
        "status": "verified"
      },
      {
        "repository": "met4citizen/TalkingHead",
        "url": "https://github.com/met4citizen/TalkingHead",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "91796631b569ec70aeba1e43f6fa1987e5e4115c",
        "source_url": "https://raw.githubusercontent.com/met4citizen/TalkingHead/91796631b569ec70aeba1e43f6fa1987e5e4115c/README.md",
        "sha256": "306b9a10cd7726e0ec971bf04840617a474cd6d2f8ba89b9dcf95b61331e8f37",
        "bytes": 69657,
        "status": "verified"
      },
      {
        "repository": "pixiv/three-vrm",
        "url": "https://github.com/pixiv/three-vrm",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "3caf7a21ee68f0d5dfa363ab3d577450bbf60136",
        "source_url": "https://raw.githubusercontent.com/pixiv/three-vrm/3caf7a21ee68f0d5dfa363ab3d577450bbf60136/README.md",
        "sha256": "09cd85c8a6d8b2616bd43b190ed78fd34dbc5b35cd9b1d93b196c976a09c804d",
        "bytes": 4455,
        "status": "verified"
      },
      {
        "repository": "DanielSWolf/rhubarb-lip-sync",
        "url": "https://github.com/DanielSWolf/rhubarb-lip-sync",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "9b9573cd21b253c9ba58739bbd1aa0b50b991bff",
        "source_url": "https://raw.githubusercontent.com/DanielSWolf/rhubarb-lip-sync/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/README.adoc",
        "sha256": "3c7dcb74008ca9eb96f5f258ca4f82e9a49ed9614d93f89bc98bd27ac3a22b43",
        "bytes": 23164,
        "status": "verified"
      },
      {
        "repository": "hzwer/ECCV2022-RIFE",
        "url": "https://github.com/hzwer/ECCV2022-RIFE",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "5d8adbdd40e12c2c8f91930eff838aebe561c086",
        "source_url": "https://raw.githubusercontent.com/hzwer/ECCV2022-RIFE/5d8adbdd40e12c2c8f91930eff838aebe561c086/README.md",
        "sha256": "05290581ecf28621a7731486fa17ba0e4f02fc689dba0a4ccd2c905f72851498",
        "bytes": 11007,
        "status": "verified"
      },
      {
        "repository": "FunAudioLLM/CosyVoice",
        "url": "https://github.com/FunAudioLLM/CosyVoice",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc",
        "source_url": "https://raw.githubusercontent.com/FunAudioLLM/CosyVoice/074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc/README.md",
        "sha256": "66436370172c2830ed98aa643b31898c65e16eee14ade68f00828d21fae602e0",
        "bytes": 13764,
        "status": "verified"
      },
      {
        "repository": "FunAudioLLM/SenseVoice",
        "url": "https://github.com/FunAudioLLM/SenseVoice",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "586bbdb2b052f4fe19322581825228b6810a9fb3",
        "source_url": "https://raw.githubusercontent.com/FunAudioLLM/SenseVoice/586bbdb2b052f4fe19322581825228b6810a9fb3/README.md",
        "sha256": "ce31cd7c065d40fa95829a191870c6f9b25feb94d23500d6bc522927857f721f",
        "bytes": 26816,
        "status": "verified"
      },
      {
        "repository": "RVC-Boss/GPT-SoVITS",
        "url": "https://github.com/RVC-Boss/GPT-SoVITS",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "b4570b876f5c086819ba84e3215472733c6a7b70",
        "source_url": "https://raw.githubusercontent.com/RVC-Boss/GPT-SoVITS/b4570b876f5c086819ba84e3215472733c6a7b70/README.md",
        "sha256": "b680976764d99f61d647394df4948a5698591dc9de1dd802d57f4598fdbb02d1",
        "bytes": 22027,
        "status": "verified"
      },
      {
        "repository": "openspline/openspline",
        "url": "https://github.com/openspline/openspline",
        "checked_on": "2026-10-23",
        "verification": "not-run",
        "commit": "6d53966e412a9c2946f3b777735ac04aa8879b0b",
        "source_url": "https://raw.githubusercontent.com/openspline/openspline/6d53966e412a9c2946f3b777735ac04aa8879b0b/README.md",
        "sha256": "307188a4ead1511f3c6c7a6e30b144cbfea4bede60bc7e8b436ca56ba8397ead",
        "bytes": 16737,
        "status": "verified"
      }
    ]
  }
};
