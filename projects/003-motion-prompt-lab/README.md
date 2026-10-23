# 003 · 动效提示词研究 · 从长流程到清晰意图

模型越能自主完成通用步骤，流程提醒的额外收益可能越小。这个判断指向的是重复的分析、计划与检查指令；任务独有的目标、情绪、风格、氛围、动画目的和验收标准仍应明确。跨代模型的收益变化尚未由本次实验验证。

本项目拆解[米开朗基杨分享的动效导演提示词](https://x.com/CarsonYangk8s/status/2111520795575116016)，为真实的「GitHub 项目研究集」制作 20 秒产品介绍片，以同预算盲评检查全文附加的收益，保留原文来源、实际输入、代码、成片、耗时与失败记录。

[在线研究页](https://yydshly.github.io/1020_codex_project/projects/003-motion-prompt-lab/) · [怎样简化提示词](web/index.html#prompt-simplification) · [同预算公平对照](web/index.html#controlled) · [理解与表达示例](notes/prompt-understanding.md) · [研究总图高清 PNG](assets/understanding-map-2026-10-23.png) · [可编辑 SVG](assets/understanding-map-2026-10-23.svg)

## 我们的理解与简化方向

1. 合并重复的分析、计划和检查提醒，按任务需要选择阶段评审。
2. 保留受众、内容目标和期望行动，把情绪起点、变化和结尾感受说具体。
3. 用少量明确的风格规则与参考，说明配色、字级、材料、留白和节奏怎样营造氛围。
4. 说明动画解释的内容关系、注意力位置与持续对象，以可理解、可读、真实作为效果标准。
5. 根据实际画面偏差定向返修，保留事实来源、预算、技术限制和交付格式，并复核修改。

简化的是冗余指令。独立评审、真实验收与必要的硬约束仍按任务需要执行。新提炼的表达模板尚未通过另一次制作对照验证。

![研究理解总图：价值、本质、实际效果与简化方向](assets/understanding-map-2026-10-23.png)

## 历史三版与输入边界

**三版的输入不同：V1 是简化实现；V2 使用另写的项目执行指令；V3 直接读取完整原文，具体任务由独立 brief 提供。V2 的“三轮渲染”只是内部修订次数，并不是第三版。输入未改写也不等于全部质量标准通过，当前 V3 第二轮仍需返修，最终验收与执行审计未完成。**

[三版对比网页](web/index.html#compare) · [V3 第二轮影片（待返修）](web/media/v3/round-02.mp4) · [V3 独立 brief 输入](notes/v3/brief-input.md) · [原文完整性记录](notes/v3/source-manifest.json) · [V3 第二轮独立评审](notes/v3/review-round-02.md) · [V3 修订账本](notes/v3/ledger.md)

[V2 影片](web/media/v2/research-film-v2.mp4) · [V2 另写的执行提示词](notes/v2-execution-prompt.md) · [V2 质量报告](notes/v2-quality.md)

## 同预算公平对照（2026-10-23）

入口：[公平对照](web/index.html#controlled)。同一 20 秒研究集/Kokoro 场景、冻结素材与质量标准，新上下文继承同一模型配置；每组最多 20 分钟与 12 个内部独立评审，串行制作。原文组附加未改写正文，对照组仅明确需求。制作结束后封存影片，两位新上下文评审按相反顺序匿名评价，先封存分数再揭晓。

明确需求组 X 均分 **70/90**，原提示词组 Y 为 **67.5/90**；两位评审偏好相反，未达到事先约定的同向且差至少 5 分标准。本次未观察到全文附加带来一致提升。明确需求组也获得共同质量要求；原文组未在预算内完成全部评审流程，不能推断无限制执行或跨代模型的最终效果。

[预注册协议](notes/controlled/protocol.json) · [共同要求](notes/controlled/common-brief.md) · [对照完整输入](notes/controlled/requirements-full-input.md) · [统一 rubric](notes/controlled/rubric.json) · [最新状态/结果](notes/controlled/results.json)

预算为时间与工具上限，非相等 token/费用；供应端模型快照与种子无法锁定。N=1 配对，不作跨场景因果推断。旧版 V3 未完成的返修不被这次实验覆盖。

## 网页内容

在线入口为 https://yydshly.github.io/1020_codex_project/projects/003-motion-prompt-lab/，本地入口为 http://127.0.0.1:8033/ 。页面以我们的理解总图为引导，承接简化方向、原文来源、实际输入、同预算盲评、历史三版视频、页内评审阅读器与资料目录。历史 V3 当前保留第二轮，尚未验收；第三轮没有完成影片。


- V1/V2/V3 近似同步播放、同帧定位、任一旧版对比 V3、单独放大 V3，以及影片下载和实测对比。
- 原帖原文入口与 SHA-256、V3 独立 brief，以及明确标为历史输入的 V2 项目执行指令。
- 按任务信息、工作流程、创作判断拆解十一组提示词模块。
- 说明应保留的硬约束、需要调整的规则及原文音效音量冲突。
- 播放实际 MP4，按五镜时间轴定位，查看抽帧和制作资料。
- 展示真实测量，区分工程成功、审美不足与未验证命题。
- 同预算独立制作对照：匿名播放、原始盲评、耗时、未达项和封存记录。
- 我们的理解：受众目标、情绪、风格、氛围、动画目的与判断标准，以及如何压缩重复提示。
- 使用已生成的研究总图作首页引导图，提供高清 PNG 和可编辑 SVG。

## 场景与范围

主题是本仓库的 001 / 002 号研究。片中名称、状态、内容与文件结构来自本地工作树，包含尚未发布内容，不承诺所有条目均已上线。UI 为真实字段的影片重构，不是操作录屏。

视频：1280×720、60 fps、1,200 帧、20 秒、H.264 + AAC。音乐为原创程序合成，无语音、付费模型或外部影视素材。实际响度和真峰值见测量文件。

V1采用Canvas 2D；V2采用原生SVG、resvg与FFmpeg，并以3/7时间样本合成运动模糊。两版均是当前Codex会话的实际制作，未测原帖所称Opus 5.5，未测角色、3D、竖屏、旁白或商业级音乐生成。V1边界见experiment.json，V2适用要求及未通过项见v2-quality.md。

V2最终为20秒、1200帧，响度−14.04 LUFS、真峰值−5.62 dBTP。主体裁切未检测到达到0.5秒的低运动段；全画面仍有1.183秒低运动，保留未通过记录。详细审片见[最终独立评审](notes/v2-final-review.md)。

V3 的原文取自指定帖子的完整正文：3,821 字符、9,143 UTF-8 字节，SHA-256 为 `ab01c038ef3b71821bad85b2ddb45ca37891c5fa2d019adb59572de6bbfcb037`。原帖直连返回 403，通过对应帖子的转存接口取得正文，来源方式已记录。原文在内部缓存原样保留，没有用 V2 指令替换；网页链接作者原帖，不全文转载。音效音量的两条冲突按原文规定的 brief 优先级处理，其他未达标项不得以改写 brief 豁免。

V3 使用未参与 V1/V2 的新执行代理，独立建立方案与实现；分镜、场景与成片的评审和迭代记录见 `notes/v3/`。三个版本不是同模型、同预算的受控 A/B 测试，也不构成对原帖所称模型的性能复现。

## 文件与证据

| 文件 | 用途 |
| --- | --- |
| src/film.mjs | 按帧绘制的五镜代码 |
| src/timing.json | 场景、节拍与动作锚点 |
| src/audio.py | 原创音乐、音效和两遍响度归一 |
| src/render.mjs | 固定字体、离线编码和代表帧 |
| src/verify.py | 实际 MP4 技术检测、抽帧与配色对比度 |
| notes/brief.md | 方向选择、分镜与明确取舍 |
| notes/facts.json | 六条事实、来源哈希与原创文案声明 |
| notes/experiment.json | 实验边界与偏离原帖之处 |
| notes/review.md | 独立审片结果 |
| notes/ledger.md | 实际失败和修改记录 |
| web/ | 可独立托管的网页、成片与交付文件 |

## 本地预览

现成网页与 MP4 已提供，无需安装渲染依赖：

```powershell
cd projects/003-motion-prompt-lab
npm run preview
```

访问 http://127.0.0.1:8033/ 。测量数据通过相对地址读取，推荐 HTTP 预览而不是 file 协议。

## 复现

环境：Node.js 22、Python 3.10+、FFmpeg / ffprobe 6.1+，需在 PATH 中。Node 依赖固定在 lockfile。

```powershell
npm ci
New-Item -ItemType Directory -Force .cache
curl.exe -L --fail "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf" -o .cache/NotoSansCJKsc-Regular.otf
python src/facts.py
npm run audio
node src/render.mjs --test
npm run render
npm run verify
npm run build
```

字体是 Noto Sans CJK SC，SIL OFL 1.1。渲染文件 SHA-256 在 notes/font-provenance.json；上游 main URL 可能变化，严格复现应比对该哈希。缓存字体不提交，视频仅含栅格化字形。

复现V2（沿用上面缓存的原始字体）：

```powershell
python -m pip install --target .cache/python fonttools==4.60.1
python src/subset-v2.py
python src/facts-v2.py
npm run audio:v2
node src/render-v2.mjs stills
node src/render-v2.mjs proof
node src/render-v2.mjs bridge
npm run render:v2
npm run verify:v2
npm run build
python src/check-web-v2.py
```

最后一个命令需要本地预览服务器已经启动。字体子集、视频最终哈希及实际渲染时间分别位于v2-font.json、v2-verification.json和v2-render.json。主要轨迹和节拍在src/timing-v2.json；部分附属动效仍使用源码相对帧偏移。历史样片审查对应当时哈希，重新生成样片后应重新审查，不能沿用旧报告。

V3 的命令、实际跑通范围与环境前提见[复现说明](notes/v3/reproduce.md)、[环境记录](notes/v3/environment.json)和[字体锁定记录](notes/v3/font-lock.json)。V3 使用真实产品字体和本轮采集缓存，仅安装 npm 依赖不足以从一个全新的目录复现。重新渲染的影片需要重新核验，不能沿用交付影片的评审结论。

渲染用时在 notes/render.json，只是当前主机的观测，不等于模型思考时间或跨模型性能。无 API 费用不等于没有算力与评审成本。

## 发布状态

使用仓库现有 GitHub Actions / Pages 流程，发布 `web/` 到 `/1020_codex_project/projects/003-motion-prompt-lab/`；部署结果以工作流和在线访问验证为准。发布包包括成片与评审材料，排除 `.cache/`、依赖目录和内部原提示词缓存。研究总图的实际制作方式与文件哈希见 [制作记录](notes/understanding-map-production.json)。

---

[返回总索引](../../README.md)
