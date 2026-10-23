# GitHub 项目研究集

记录日常发现的优秀 GitHub 项目：从理解原理、运行验证，到改造实践与 Web 演示。

这里是研究总入口。每个子项目都有固定编号、独立说明和图片；按编号从小到大展示，方便持续积累和查找。

[在线索引页](https://yydshly.github.io/1020_codex_project/) · [项目索引](#项目索引) · [新增研究项目](docs/project-guide.md) · [Web 部署指南](docs/deployment.md) · [研究模板](templates/project/README.md)

## 项目索引

<!-- PROJECTS:START -->
| 编号 | 项目 | 摘要 | 状态 | 入口 |
| --- | --- | --- | --- | --- |
| 001 | cyber-xiaowan · AI 女友的过渡阶段参考 | 以宿主 Agent 为能力底座，用图片情绪包、预设台词和状态事件构成有情绪表达的桌宠；对我们而言，是 AI 女友从图片陪伴逐步走向 3D 的过渡阶段参考。 | 研究中 | [在线研究页](https://yydshly.github.io/1020_codex_project/projects/001-evening-companion/) · [研究说明](projects/001-evening-companion/README.md) · [cyberxiaowan/cyber-xiaowan](https://github.com/cyberxiaowan/cyber-xiaowan) |
| 002 | 六个 AI 内容工具的原理与实践 | 六个开源项目分别解决语音合成、本地内容检索、资料转播客、素材混剪、长视频选段和循环研究，重点看清模型判断与程序执行的分工。<br>**Kokoro**：语音合成模型及推理库，将文字转为音素，结合音色条件预测时长与韵律并生成语音波形。<br>**DigUp**：本地内容检索工具，将文件分片编码为语义向量并结合关键词索引，按描述返回文件及页码或时间位置。<br>**Podcastfy**：播客制作工作流，先提取资料并由语言模型改写成分角色对话，再调用语音后端配音合并。<br>**Short Video Factory**：自动混剪工具，以配音时长为目标随机截取已有素材，再叠字幕、合成音乐并导出视频。<br>**AI YouTube Shorts Generator**：长视频切片工具，让大模型读取带时间的语音转录来选段，再截取原画面与原声并按需裁切画幅。<br>**Local Deep Research**：深度研究编排工具，通过固定轮次或模型工具调用循环搜索和读取资料，最后综合为带引用的研究报告。 | 研究中 | [在线研究页](https://yydshly.github.io/1020_codex_project/projects/002-ai-content-toolkit/) · [研究说明](projects/002-ai-content-toolkit/README.md) · [hexgrad/kokoro](https://github.com/hexgrad/kokoro) · [ARahim3/DigUp](https://github.com/ARahim3/DigUp) · [souzatharsis/podcastfy](https://github.com/souzatharsis/podcastfy) · [YILS-LIN/short-video-factory](https://github.com/YILS-LIN/short-video-factory) · [Anil-matcha/AI-Youtube-Shorts-Generator](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator) · [LearningCircuit/local-deep-research](https://github.com/LearningCircuit/local-deep-research) |
| 003 | 动效提示词研究 · 从长流程到清晰意图 | 模型越能自主完成通用步骤，流程提醒的增益可能越小。通过原提示词、真实成片与同预算盲评，提炼简化方向：压缩重复步骤，保留受众目标、情绪、风格、氛围、动画目的及验收标准；跨代趋势仍待验证。 | 研究中 | [在线研究页](https://yydshly.github.io/1020_codex_project/projects/003-motion-prompt-lab/) · [研究说明](projects/003-motion-prompt-lab/README.md) · [yydshly/1020_codex_project](https://github.com/yydshly/1020_codex_project) |
| 004 | 数字人技术图谱 · 从素材口型到实时生成 | 研究低成本、动作自然且可实时交互的数字人：比较素材口型、单图驱动、离线与流式生成、3D、NeRF/3DGS、Live2D 和视频编辑八条路线。以优质动作素材 + MuseTalk 为当前主线，明确模型、成本与控制边界，并探索陪伴、客服导览、教学训练、虚拟直播及可插拔服务。 | 研究中 | [在线研究页](https://yydshly.github.io/1020_codex_project/projects/004-digital-human-atlas/) · [研究说明](projects/004-digital-human-atlas/README.md) · [TMElyralab/MuseTalk](https://github.com/TMElyralab/MuseTalk) |
| 005 | 角色与故事工坊 · 从定制角色到短片 | 以「定制角色＋故事」为核心，通过分镜、场景视觉、图生视频与配音剪辑，把情绪转成可观看的短片，积累可延续的角色、经历与素材。阿灯样例已验证制作路线；原帖底层技术仍未确认。 | 已完成 | [在线研究页](https://yydshly.github.io/1020_codex_project/projects/005-stickman-story-lab/) · [研究说明](projects/005-stickman-story-lab/README.md) · [原帖来源](https://x.com/Jason23818126/status/2112030757724340314) |
| 006 | 独立站实践手册 · 从需求到第一位用户 | 从“找新词建站”转向“为具体用户解决重复任务”：先发现需求、找到用户与渠道，再比较竞品、验证样例，完成最小产品和低预算部署，最终用真实交付、复用与付费检验价值。完整引导图帮助个人安排投入、判断下一步；部署有成熟路线，产品与获客仍待验证。 | 研究中 | [在线研究页](https://yydshly.github.io/1020_codex_project/projects/006-independent-site-playbook/) · [研究说明](projects/006-independent-site-playbook/README.md) · [yydshly/1020_codex_project](https://github.com/yydshly/1020_codex_project) |

### 001 · cyber-xiaowan · AI 女友的过渡阶段参考

<a href="https://yydshly.github.io/1020_codex_project/projects/001-evening-companion/"><img src="projects/001-evening-companion/assets/repository-summary.png" alt="从赛博小晚到我们的 AI 女友：原库的 Agent 与图片状态展示，以及先陪伴、再动效、按需升级 3D 的分阶段路线。图中角色为结构示意。" width="720"></a>

从赛博小晚到我们的 AI 女友：原库的 Agent 与图片状态展示，以及先陪伴、再动效、按需升级 3D 的分阶段路线。图中角色为结构示意。

以宿主 Agent 为能力底座，用图片情绪包、预设台词和状态事件构成有情绪表达的桌宠；对我们而言，是 AI 女友从图片陪伴逐步走向 3D 的过渡阶段参考。

### 002 · 六个 AI 内容工具的原理与实践

<a href="https://yydshly.github.io/1020_codex_project/projects/002-ai-content-toolkit/"><img src="projects/002-ai-content-toolkit/assets/six-tools-summary.jpg" alt="六个工具，从模型能力到可用产品：汇总每个工具的能力、原理、我们的理解、意义与使用场景，以及对学习和构建产品的价值。" width="720"></a>

六个工具，从模型能力到可用产品：汇总每个工具的能力、原理、我们的理解、意义与使用场景，以及对学习和构建产品的价值。

六个开源项目分别解决语音合成、本地内容检索、资料转播客、素材混剪、长视频选段和循环研究，重点看清模型判断与程序执行的分工。

### 003 · 动效提示词研究 · 从长流程到清晰意图

<a href="https://yydshly.github.io/1020_codex_project/projects/003-motion-prompt-lab/"><img src="projects/003-motion-prompt-lab/assets/understanding-map-2026-10-23.png" alt="长提示词研究总图：库的价值与原文规约、真实成片与同预算盲评、目标情绪风格氛围动画目的和验收标准，以及模型能力提升时通用步骤提示增益可能减少的判断与证据边界。" width="720"></a>

长提示词研究总图：库的价值与原文规约、真实成片与同预算盲评、目标情绪风格氛围动画目的和验收标准，以及模型能力提升时通用步骤提示增益可能减少的判断与证据边界。

模型越能自主完成通用步骤，流程提醒的增益可能越小。通过原提示词、真实成片与同预算盲评，提炼简化方向：压缩重复步骤，保留受众目标、情绪、风格、氛围、动画目的及验收标准；跨代趋势仍待验证。

### 004 · 数字人技术图谱 · 从素材口型到实时生成

<a href="https://yydshly.github.io/1020_codex_project/projects/004-digital-human-atlas/"><img src="projects/004-digital-human-atlas/assets/eight-routes-infographic.png" alt="八种数字人技术全景长图：原理、代表库、落地步骤与优缺点；推荐当前采用优质动作素材 + MuseTalk，区分复杂生成效果与 3D 空间控制。人物缩略图为机制示意。" width="720"></a>

八种数字人技术全景长图：原理、代表库、落地步骤与优缺点；推荐当前采用优质动作素材 + MuseTalk，区分复杂生成效果与 3D 空间控制。人物缩略图为机制示意。

研究低成本、动作自然且可实时交互的数字人：比较素材口型、单图驱动、离线与流式生成、3D、NeRF/3DGS、Live2D 和视频编辑八条路线。以优质动作素材 + MuseTalk 为当前主线，明确模型、成本与控制边界，并探索陪伴、客服导览、教学训练、虚拟直播及可插拔服务。

### 005 · 角色与故事工坊 · 从定制角色到短片

<a href="https://yydshly.github.io/1020_codex_project/projects/005-stickman-story-lab/"><img src="projects/005-stickman-story-lab/assets/understanding-map-v1.png" alt="角色与故事工坊中文研究总图：对照原帖火柴人动画与原创阿灯短片，梳理定制角色与故事的本质、分镜到图生视频及后期的实现流程、创作价值、扩展方向和验证边界。" width="720"></a>

角色与故事工坊中文研究总图：对照原帖火柴人动画与原创阿灯短片，梳理定制角色与故事的本质、分镜到图生视频及后期的实现流程、创作价值、扩展方向和验证边界。

以「定制角色＋故事」为核心，通过分镜、场景视觉、图生视频与配音剪辑，把情绪转成可观看的短片，积累可延续的角色、经历与素材。阿灯样例已验证制作路线；原帖底层技术仍未确认。

### 006 · 独立站实践手册 · 从需求到第一位用户

<a href="https://yydshly.github.io/1020_codex_project/projects/006-independent-site-playbook/"><img src="projects/006-independent-site-playbook/assets/independent-site-guide.svg" alt="独立站完整引导图：九阶段串联目标约束、需求与渠道、竞争与价值、样例、市场形态、开发、采购部署、首批使用、复用收费；每阶段列动作、产物、通过条件、失败回路与个人参考价值，并补充案例、预算与证据边界。" width="720"></a>

独立站完整引导图：九阶段串联目标约束、需求与渠道、竞争与价值、样例、市场形态、开发、采购部署、首批使用、复用收费；每阶段列动作、产物、通过条件、失败回路与个人参考价值，并补充案例、预算与证据边界。

从“找新词建站”转向“为具体用户解决重复任务”：先发现需求、找到用户与渠道，再比较竞品、验证样例，完成最小产品和低预算部署，最终用真实交付、复用与付费检验价值。完整引导图帮助个人安排投入、判断下一步；部署有成熟路线，产品与获客仍待验证。
<!-- PROJECTS:END -->

## 仓库结构

```text
projects/                 按编号组织的研究子项目
  001-evening-companion/  cyber-xiaowan 研究与公开页面
    project.json         名称、简介、来源、状态、图片和演示配置
    README.md            研究说明与结论
    assets/              封面、截图、流程图
    notes/               调研笔记、实验记录
    src/                 独立实现或改造代码
    web/                 可选：准备发布的静态 Web 文件
templates/project/       研究说明模板
docs/                    项目维护与部署说明
scripts/projects.py      新建项目、同步索引、校验和打包演示
.github/workflows/       自动校验与手动 Pages 部署
```

## 新增研究项目

需要 Python 3.10 或以上版本，无第三方 Python 依赖。

```bash
python scripts/projects.py new example-project --name "项目名称" --repo "https://github.com/owner/repo" --summary "一句话说明研究价值"
```

命令会创建 `projects/001-example-project/`，并更新本页索引。随后填写子项目 README，将截图放入 `assets/`，在 `project.json` 中配置 `cover` 和图片说明 `cover_alt`。

```bash
python scripts/projects.py sync
python scripts/projects.py check
```

## 维护约定

- **编号固定**：使用三位及以上编号，从 `001` 起递增；已发布编号不改动、不复用。归档项目保留记录。
- **先有来源，再有结论**：保留原仓库地址、研究时的版本或 commit、运行步骤和实际验证结果。
- **摘要留在首页，细节放进子项目**：首页展示简介、状态、封面和入口，研究过程写在子项目 README 与 `notes/`。
- **完整引导图**：用一张图串联核心理解、来源带来的思考、执行流程与个人参考价值，尽量保留细节、判断条件和证据边界；遵循[完整引导图要求](docs/research-guide-map.md)，提供放大查看与原图下载。
- **各项目独立运行**：依赖及启动命令在各自目录声明，避免互相干扰。
- **尊重上游许可**：引用、复制或修改上游代码时，保留其许可证与署名。当前仓库尚未指定统一开源许可证。

GitHub Pages 已开启：[访问在线索引页](https://yydshly.github.io/1020_codex_project/)。后续子项目的 Web 演示发布到 `/1020_codex_project/projects/编号-slug/`；操作步骤见[部署指南](docs/deployment.md)。
