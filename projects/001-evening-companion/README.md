# 001 · cyber-xiaowan：AI 女友的过渡阶段参考

以宿主 Agent 为能力底座，用图片情绪包、预设台词和状态事件构成有情绪表达的桌宠；对我们而言，是 AI 女友从图片陪伴逐步走向 3D 的过渡阶段参考。

[在线研究页](https://yydshly.github.io/1020_codex_project/projects/001-evening-companion/) · [cyberxiaowan/cyber-xiaowan](https://github.com/cyberxiaowan/cyber-xiaowan)

![从赛博小晚到我们的 AI 女友：研究总结与分阶段实现路线](assets/repository-summary.png)

## 我们的理解与价值判断

原库把三部分组合起来：**宿主 Agent 提供模型与工具能力，Skill 指导思考和表达，桌宠用图片、徽标和预设台词呈现状态与情绪感**。宿主通知需要接入后才能驱动桌宠；它不会独立读懂聊天情绪，桌宠网页也没有自由聊天、长期记忆和自主对话后台。

它对我们的价值是一个可借鉴的过渡阶段。AI 女友不必等待 3D 建模、绑定、口型和动作全部完成才开始验证。先让图片表情配合真实聊天建立存在感，再增加记忆、主动互动与视觉效果，后续按需要替换为 2D 或 3D 表现层，复用已有的对话与记忆系统。

| 阶段（我们的扩展设想） | 要补充的能力 | 优先验证 |
| --- | --- | --- |
| 图片 + 真实聊天 | 真实模型接口、角色图片与对话状态映射 | 用户是否愿意聊 |
| 记忆 + 主动互动 | 可管理的长期记忆、可配置的主动触发机制 | 是否有持续陪伴价值 |
| 动效 / 2D 表现 | 转场、缩放、粒子、序列帧或 2D 动画 | 情绪反馈是否改善体验 |
| 按需升级 3D | 角色建模、绑定与动作系统 | 体验收益是否值得投入 |

这些是我们的产品路线，并非原库已经实现的能力。总结图使用内置 imagegen 生成，角色为结构示意；[完整提示词](notes/repository-summary-image-prompt.md)可查。

> 此前的「晚伴」是独立改造原型，不能作为原库能力的证据。公开研究页与历史原型分别维护。

| 项目资料 | 内容 |
| --- | --- |
| 上游 | [cyberxiaowan/cyber-xiaowan](https://github.com/cyberxiaowan/cyber-xiaowan) |
| 版本 / commit | 2.2.0 / `19496aaba767bc6b594d1e32f51eda3ee038ef5a` |
| 验证日期 | 2026-10-20 |
| 原库位置 | `upstream/`，原样 git clone，未修改源码 |
| 桌宠运行地址 | http://127.0.0.1:4318/ |
| 当前研究状态 | 研究中 |

## 看到的是什么

公开研究页包含理解摘要、总结图、七种状态说明、分阶段产品路线与六类真实 Skill 输出。公开页面不依赖本机服务，也不再分发作者人物图片；本机研究页保留完整原图图鉴与原版窗口。

本地能力汇总与实测报告：[打开六类真实回答](http://127.0.0.1:4319/)。

新增[原版桌宠图鉴](http://127.0.0.1:4319/#pet-gallery)：七张原图并排展示，点击可查看完整图片、画面说明、全部 21 句预设台词、触发与停留规则。图鉴分类和说明由我们整理；`showcase/pet-states.json` 是固定版本 `pet/pets.json` 的原样快照，图片直接引用本机原版服务，没有复制到展示目录。查看图鉴需要 4318、4319 两个服务同时运行。

待机、思考、干活、打盹无自动回落；鼓掌 6 秒、疑问 8 秒、比心 5 秒后由原版前端切回待机。气泡在页面可见时每 9 秒重新随机抽取预设台词。作者说明鼓掌图是实拍，其余六张是基于同一人设生成的动作图。图鉴选择不发送状态命令，原版交互保留在下方嵌入窗口。

原版动画核对：`pet/public/index.html` 把 `anim-*` 类设在 `#stage` 自身，但图片动画选择器写成 `.anim-* #stage img`，层级不匹配。本机浏览器在 `anim-sway` 状态下读取图片的计算样式 `animationName` 为 `none`。图鉴说明这一限制，未修改上游动画；睡眠符号和无图片时的 emoji 使用另一组选择器。

该报告是我们整理的研究展示页，**不是上游自带界面**。`showcase/results.json` 保存一次 Codex CLI 批量实际调用的六条未改写回答；`showcase/meta.json` 保存会话 ID、版本与输出哈希。输入为虚构案例，没有与不加载 Skill 的同模型做对照，因此不据此宣称能力提升。

可复现运行：

```powershell
node prepare-showcase.mjs
Get-Content -Raw .runtime/showcase/prompt.txt | codex exec --ignore-user-config --sandbox read-only --json --output-schema .runtime/showcase/schema.json -o .runtime/showcase/results.json - > .runtime/showcase/events.jsonl
node finalize-showcase.mjs
python -m http.server 4319 --bind 127.0.0.1 --directory showcase
```

新的实测可能生成不同回答，`showcase/app.mjs` 中的人工观察也需要按新结果重新核对。`prepare-showcase.mjs` 验证所用原版文件与已安装 Skill 的文本一致；需先拥有 `upstream/` 与 `.agents/skills/cyber-xiaowan/`。

本轮观察：合作判断、改稿与业务卡点分析有实用表现；资料整理仍出现将虚构案例称为真实业务样本的措辞问题，已在展示页注明。

原库桌宠是一张真人图片卡片，包含气泡台词、状态标签、图片和表情徽标。点击切换状态，双击鼓掌，可拖动卡片。

状态有待机、思考、工作、鼓掌、疑问、比心和打盹。气泡内容来自原库 `pet/pets.json`，并非即时模型生成。原库此页面没有聊天输入框、长期记忆界面或自主对话后台。

原库另一部分是 `SKILL.md` 和 `references/`。它们在宿主 Agent 中被加载，指导实际模型处理问题，不是桌宠网页内的聊天程序；没有独立的模型可执行文件或模型权重。

## 运行原版

Node.js 18+ 与 Git。PowerShell：

```powershell
cd F:\codex_project\1020_codex_project\projects\001-evening-companion
.\start-original.ps1
```

打开 [原版桌宠](http://127.0.0.1:4318/)。

脚本只负责取得并核对指定上游 commit，然后调用原库 `pet/cli.mjs --no-open --port 4318`。使用原库支持的 `CYBER_XIAOWAN_PET_HOME` 环境变量隔离本次运行记录。没有修改全局 Codex 配置，也没有自动接入本机其他会话。

原库默认会尝试打开浏览器应用窗口；本次通过它支持的 `--no-open` 选项启动，并在 Codex 浏览器展示同一个原版页面。

在另一个终端切换：

```powershell
.\start-original.ps1 -State think
.\start-original.ps1 -State work
.\start-original.ps1 -State clap
.\start-original.ps1 -State heart
.\start-original.ps1 -State idle
```

初次运行会克隆源码；已有 checkout 若版本不同或存在修改，启动器会提示，不会替用户覆盖或重置。

## 验证与证据

### 原版 Skill 真实模型运行

原版 Skill 已安装到本子项目 `.agents/skills/cyber-xiaowan/`。安装版本与上游记录 commit 一致，`SKILL.md` 和全部参考文件逐一核对文本相同（下载版本与 Git checkout 的换行符可能不同）。

已使用本机登录的 Codex CLI 实际运行一轮产品判断问题，结果在 `.runtime/skill-answer.txt`，运行事件在 `.runtime/skill-run.jsonl` 与 `.runtime/skill-resume.jsonl`。这些是实际模型生成结果，没有调用此前原型的规则回复函数。

首次调用时，CLI 只读策略阻止了参考文件读取；随后将同版本所需参考文件原文提供给同一会话继续运行，未扩大执行权限。侧栏输出是第二次完成后的原文。

继续这个实际会话：

```powershell
.\start-skill.ps1
```

启动的是 Codex 自带交互终端，接下来直接输入问题即可。桌宠仍在独立页面运行，不应将它当作聊天输入框。

### 原版桌宠

- `git rev-parse HEAD` 与记录 commit 一致。
- `git status --porcelain` 输出为空，上游源码未改动。
- 原版 HTTP 服务成功启动，浏览器实际显示真人待机卡片。
- 使用原库 CLI 触发 `think`，API 与页面均切换至“思考中”。
- 用测试事件 `agent-turn-complete` 调用原库通知桥，API 返回 `clap`；随后原版前端自动回到待机。此项为通知桥测试，不等于已安装全局 Codex 钩子。
- 本地实测截图保存在 `.runtime/original-*.png`，不进入静态发布目录。

## 文件边界

| 位置 | 含义 |
| --- | --- |
| `upstream/` | 原库完整本地 checkout，Git 忽略 |
| `start-original.ps1` | 不改原库的启动辅助脚本 |
| `.runtime/` | 本次运行状态与截图，Git 忽略 |
| `publication/`、`build-research.mjs`、`web/` | 公开研究页源码、构建脚本与静态产物 |
| `src/`、`tests/`、`.runtime/prototype-web/` | 历史「晚伴」原型源码、测试与本地构建，**不是原库** |
| `assets/repository-summary.png` | 本次生成的研究总结与路线引导图 |
| `notes/prototype.md` | 原型历史说明 |
| `notes/verification.md` | 原型验证记录，**不能用于证明原库能力** |

项目目录编号与路径保留，避免断开已有文件链接；目录名中的 evening-companion 不代表原版产品名称。公开产物已经切换为研究页，旧原型仅用于保留实验记录。

## 构建与发布研究页

在本子项目执行 `npm run build`，将 `publication/`、总结图与经核对的配置/实测数据输出到 `web/`。构建不复制本地会话、运行目录、上游照片或密钥。

在仓库根目录执行：

```powershell
node projects/001-evening-companion/build-research.mjs
python scripts/projects.py sync
python scripts/projects.py check
python -m unittest discover -s tests
python scripts/projects.py build
```

将源码与 `web/` 产物提交并推送到 `main`，然后执行 `gh workflow run deploy-pages.yml --ref main`。GitHub Pages 发布地址为上方在线研究页。历史原型改用 `npm run build:prototype` 输出到忽略的 `.runtime/prototype-web/`，不会覆盖研究页。

## 来源与许可

上游 `package.json` 声明代码/文字 MIT；`pet/assets/*.jpg` 有单独的肖像与版权约束，见 [原版桌宠说明](https://github.com/cyberxiaowan/cyber-xiaowan/blob/19496aaba767bc6b594d1e32f51eda3ee038ef5a/pet/README.md)。本次只运行原项目，没有改造或单独再发布人物素材。

[返回研究索引](../../README.md)
