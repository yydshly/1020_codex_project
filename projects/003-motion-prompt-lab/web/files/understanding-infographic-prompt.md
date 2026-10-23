# 一图理解本次研究 · 实际生成指令

用途：将讨论与实验整理成一张可放大阅读的完整中文信息图，用于本项目网页与分享。
尝试方式：内置 ImageGen；全新图像；无参考图；暖白/深绿来自现有网页的风格描述。
执行结果：该次 ImageGen 调用因网络错误失败，没有产出图片。以下保留实际提交文本，不作为成功生成的回执。
最终交付方式：使用 src/render-understanding-map.mjs 排版 SVG 并由 resvg 导出 PNG，另嵌入实际 MP4 第 10 秒抽帧。不是 AI 生成图片。完整尺寸、文件哈希与实际文字见 understanding-map-production.json。
说明：图内“随着模型能力提升”的关系是讨论形成的趋势推测，非本实验验证的跨代因果结论。

## 提交给图像工具的完整指令

Use case: infographic-diagram.
Create ONE polished, information-rich, entirely Simplified-Chinese editorial infographic, a tall portrait research poster, ideally 2160 × 3840 pixels or the largest high-resolution portrait available. Output one complete image, not a collage of alternative designs. This is a legible, shareable visual synthesis of a real research project and its insights. Every Chinese character and number below must be rendered accurately. Prioritize large, readable Chinese typography, strong hierarchy, careful alignment, and enough space over decorative art. Use a modern clean Chinese sans-serif; no tiny footnotes.

Art direction: warm ivory paper background, deep forest-green text and panels, muted sage secondary panels, small amber accents. Calm, thoughtful, credible, lucid. Use thin structured arrows, semantic mini-diagrams, minimal line icons, meaningful highlighting. This is an editorial research map with a clear top-to-bottom reading path. No gradients, no futuristic neon, no random 3D characters or fake screenshots, no excessive decoration. Differentiate observations from hypotheses visually using small badges “本次观察” and “趋势推测”. The hypothesis is a central idea but must stay explicitly conditional. Do not draw an empirical time-series or a measured trend curve; none exists.

Layout: a prominent header, one central thesis band, two side-by-side explanatory panels, a compact evidence/score band, a large six-part creative-intent map, a semantic motion flow example, then a reusable brief and honest limitations/footer. Keep all below content, arrange elegantly and proofread. All text within the image must be Chinese except tool names, X/Y, units, and numerical scores. The project title identifies the research library, not an upstream author repository.

EXACT COPY, grouped into sections. Do not display the labels “section” or these production instructions.

Header:
“一图理解：长提示词，最值得留下什么？”
“动效提示词实验室 · 从原文、成片到我们自己的判断”

Central thesis:
Badge “我们的核心判断 · 趋势推测”
“随着模型能力提升，通用步骤提示的额外作用可能减少。”
“模型越能自主完成分析、计划和检查，重复规定这些步骤的增量价值就可能越小。”
“更值得表达：目标 → 情绪与风格 → 氛围与动画目的 → 判断标准”

Panel A heading “这个研究库的价值”
“把提示词放进真实任务，留下可追溯的证据。”
Use a compact linked chain:
“原文与来源 → 实际输入 → 代码与成片 → 评审与返修 → 耗时、失败和限制”
“帮助判断：哪些要求值得保留，哪些流程没有兑现，效果提升是否有证据。”

Panel B heading “原提示词的本质”
“创作约束 + 制作流程 + 质量检查与交付规约”
“它把制作经验写成指令；收益来自具体要求和实际执行。”
“角色口号、篇幅和评审次数，本身不等于作品质量。”
“原帖提供提示词；本库记录的是我们的实验。”

Evidence band heading “本次实际效果 · 固定预算下的对照”
“同场景、同工具、同父模型配置；每组 20 分钟。”
“X 同样获得连续变形、可读性与真实性要求；比较的是附加原文的收益。”
Two equally sized score blocks, no winner badge:
“X · 明确需求  70 / 90”
“Y · 原提示词全文  67.5 / 90”
“两位 AI 盲评偏好相反，本次未观察到明确额外增益。”
“两组都完成 20 秒、720p、60fps 影片；仍有重复转场、低信息量漂移，Y 另有文字重影。”
“内部评审 / 完整渲染：X 为 4 / 6，Y 为 9 / 4。更多流程没有自动换来更高评分。”
“实际用 Canvas / SVG、resvg 与 FFmpeg 制作。”
“历史 V1 / V2 / V3 投入不同，只作迭代记录，不用于这次因果对照。”

Large section heading “我们最值得提取的，是创作意图与验收标准”
Six clear numbered modules, with the bold word as heading and second line as its concrete expression. Arrange into a connected 2 × 3 matrix if suitable, keep large type.
“01 受众与目标”
“给谁看？让人理解什么，最后愿意做什么？”
“02 情绪”
“希望感受怎样变化：困惑 → 理解 → 掌控感。”
“03 风格”
“稳定的表达规则：暖白与深绿、清晰字级、克制的平面图形。”
“04 氛围”
“整体体验：安静、可信、有探索感；用留白、光色和节奏落实。”
“05 动画目的”
“动作解释关系；对象身份、注意力和信息因果持续可追踪。”
“06 判断标准”
“静音能懂、文字读得完、事实可信、示意与实测分清、动作服务内容。”
Small prominent callout:
“把‘高级、震撼、流畅’继续说具体：什么感受、看哪里、什么关系、怎样验收。”

Motion example heading “让目的决定表现方式”
Draw four elegantly linked simple shapes / cards actually transforming semantically through arrows, with short labels:
“收藏卡 → 原理图 → 源码依据 → 实验记录”
“表现方式：连续变形、对象交接。”
“表达目的：让观众理解研究怎样一步步深入，每一步都有依据。”
“情绪走向：收藏后的困惑 → 逐渐看懂 → 知道下一步怎么做。”

Reusable brief heading “以后可以这样表达需求”
“讨论后整理的示例，尚未用于新一轮制作。”
“请为【受众】实现【目标】，让感受从【起点】走向【终点】；采用【风格】营造【氛围】，用【动画关系】解释【内容关系】。以【可检查的标准】验收，并明确事实、预算与交付限制。”
Three short practical rules on one line or in three columns:
“人来明确：目的、偏好、取舍。”
“模型选择：拆解、技术与实现方法。”
“实际执行：出样 → 审片 → 返修 → 复核。”

Limitations box heading “证据边界：观察、理解、推测要分开”
“只有一个场景、每组一个样本；评审为两个 AI 新上下文。”
“主要抽帧检查，未完整原速听看；原文流程未在时限内全部完成。”
“未锁定供应端模型版本、token 或费用；没有跨代模型实验。”
“本次结果不能证明‘长提示词普遍无用’，也不能证明模型升级必然使其贬值。”

Footer closing emphasis:
“把你希望作品产生的效果说清楚，并用真实结果判断是否做到。”
“研究整理 · 2026.10.23｜事实与讨论见本库网页”

Constraints: include all sections, accurate scores and qualifiers, no fabricated source repository, no implication these are author-generated examples, no made-up charts or statistics, no false cross-generation proof. The image should be rich but organized, readable when opened full size. Transparent background false.
