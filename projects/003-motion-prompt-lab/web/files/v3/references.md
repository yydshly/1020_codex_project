# V3 参考研究与真实素材采集

采集日期：2026-10-20（Asia/Shanghai）。完整读取原始提示词和 brief-input.md；没有读取 V1/V2 影片、实现、笔记或画面。此报告仅描述参考与素材工作，不代表成片质量通过。

## 实际分析的官方参考

参考：[Introducing Linear Agent，官方 changelog，2026-03-24](https://linear.app/changelog/2026-03-24-introducing-linear-agent)。从该页面 `<video src>` 取得[公开 CDN MP4](https://webassets.linear.app/files/ornj730p/production/c8530d6578e71e2e6c1461778f1fe599bb5f0e00.mp4)，无登录、无访问绕过。仅作本地研究，不将其画面、音乐或布局放进交付片。

- 私有源文件：`.cache/v3-source/reference/linear-agent.mp4`
- 完整下载：6,293,220 bytes；SHA256 `6ecb1d9ff89d9c6ca0b71ceef0a0160a9ea9208773191b14e97776130318d1da`
- 全部解码：1646 / 1646 帧；30 fps；54.866667 秒；1280×720。
- 分析脚本：`.cache/v3-source/analyze_reference.py`
- 逐帧差分 CSV：`.cache/v3-source/reference/linear-agent-frame-difference.csv`
- 数字结果：`.cache/v3-source/reference/linear-agent-analysis.json`
- 全片每 0.5 秒一帧密集拼版：`.cache/v3-source/reference/linear-agent-dense-1.jpg` 至 `linear-agent-dense-4.jpg`
- 候选点前后各 1 帧拼版：`.cache/v3-source/reference/linear-agent-cut-neighbors.jpg`
- 全部文件 SHA256 见 assets.json。研究代理实际看了前三张密集拼版和候选点邻帧拼版；第4张只含片尾延续，没有额外宣称人工审看。

方法：每帧缩至 320×160，灰度相邻帧绝对差均值（0–255），全片均值 0.787565。取 MAE >5 且邻近 ±5 帧局部最大值作为候选，随后看邻帧区分硬切和 UI 状态变化。低 MAE 不能证明没有剪辑，尤其片尾小面积标识变化，因此以下是已确认剪辑点，非宣称穷尽。

| 新镜头首帧 | 时间 | MAE | 实际观察 |
|---:|---:|---:|---|
| 92 | 3.0667s | 10.0430 | 从项目文档上部转到输入区域 |
| 337 | 11.2333s | 7.9270 | 输入结果进入对话视图 |
| 513 | 17.1000s | 14.4301 | 检索结果局部转到下一次输入 |
| 659 | 21.9667s | 13.7971 | 对话转到生成文档 |
| 892 | 29.7333s | 11.3100 | 文档转结构图细节 |
| 1052 | 35.0667s | 11.0242 | 细节转完整工作空间 |
| 1219 | 40.6333s | 15.4317 | 工作空间回到操作对话 |
| 1353 | 45.1000s | 22.3604 | 产品操作转品牌落版 |

f622 / 20.7333s 和 f1246 / 41.5333s 的峰值来自输入框内容变化，邻帧背景连续，不能记成剪辑。相邻已确认剪辑点的间隔约 4.47–8.17 秒。该片是慢速细节展示，不能据此假称“每1.4–3.5秒换构图”；V3仍应满足原文自己的20秒节奏约束。

可迁移的原则：操作先给明确的空间和目标，输入产生检索结果，结果进入文档，再看到结构和全局。景别变化跟随任务进展，主体始终是真实产品。细节在移动时保持一块可聚焦的清晰区域。V3应该把“找到工具→读原理→看到验证状态→进入仓库”做成可见因果，使用自己的浅纸色/绿色体系与独立构图，不复制其黑色透视屏幕画面。

## 获取限制与未完成项

Stripe Payments 官方页面成功读取 HTML，但没有取得可分析的直接视频；Stripe Billing 请求发生 TLS EOF。未对 Stripe 视频逐帧分析，未采信第三方对其剪辑或音乐的描述。Linear 首页也未找到直接视频。

另一个官方 [Coding sessions，2026-06-11](https://linear.app/changelog/2026-06-11-coding-sessions) 的公开88.44MB视频下载过慢，在取得足够更合适的完整 Agent 参考后主动停止。部分数据保存为 `.cache/v3-source/reference/linear-coding-sessions.partial.mp4`；不得当作完整影片。其容器声明428.116秒与1920×1080不等于已完整获取。参考范围为一部完整官方产品片，尚不能证明“与同类最好作品并排不露怯”，该项须交给独立成片评审和人类审看。

## 当前观众公开讨论

以下为小样本一手公开讨论，不能推断整个开发者群体意见，也不作为本产品能力声明来源。

1. [r/LLMDevs：I built an open-source tool to change how AI coding agents investigate codebases](https://www.reddit.com/r/LLMDevs/comments/1x9uqdw/i_built_an_opensource_tool_to_change_how_ai/)，搜索索引日期2026-10-19；读取页面显示相对时间“4h ago”，不将其转换成精确发布时间。作者提出按需取证、形成假设和验证，回复者追问与其他工具的差异、上下文累积和已排除假设的处理。创意推论：本片应清楚展示“证据与边界”，不能仅列工具名或承诺效率提升。
2. [expo-kokoro issue #10：Please add proper documentation...](https://github.com/Mobile-Artificial-Intelligence/expo-kokoro/issues/10)，2026-03-06。标题直接要求完善文档，正文为空。它支持存在文档需求，不支持具体哪部分文档缺失的推断。
3. [r/cicd：Would an open-source tool that turns GitHub issues into verified failing tests actually be useful?](https://www.reddit.com/r/cicd/comments/1uwvzo0/would_an_opensource_tool_that_turns_github_issues/)，搜索索引日期2026-07-15。提议关注确定环境搭建、执行和验证工具链。用于解释为什么“准备好验证步骤”比笼统AI能力宣称更切合本次观众；本页未据评论数量作受欢迎程度推断。

已排除自动生成的 kokoro issue #310 作为真实开发者需求证据，因为正文明确说由观察层生成。

## 产品素材与原文符合情况

真实产品来自 `projects/002-ai-content-toolkit/web`，没有改动网站。Python 标准库本地服务器固定127.0.0.1:8764；Playwright无头Chromium，viewport2560×1440、device scale1，四个真实路由各采集一张完整视口 PNG。采集脚本自行关闭浏览器和服务器，无 CUA 使用。总览截图已实际查看，中文清晰正常；终端输出有编码显示问题不等于页面损坏。

截图、原favicon和字体全存私有 `.cache/v3-source/product/`，不将截图整块静止上片。截图用途是让实现者按真实页面内容重建各个可动HTML/SVG组件。

源码 `index.html` 的data-URI favicon原样URL解码为 `source-favicon.svg`，没有重画。它属于002子项目；根“GitHub 项目研究集”没有从本次限定源中找到独立官方SVG logo。页面侧栏主标记是HTML文本“研”，必须保留这个事实，不能伪称官方图形商标或将favicon身份扩大到根仓库。

颜色从styles.css的:root直接取值；字体从CSS和computedStyle取得。Windows已存在的Segoe UI、微软雅黑、Consolas、Georgia原始文件复制到私有缓存并算SHA，满足本机固定文件来源；是否交付/再分发字体许可未在本任务验证，缓存不公开。中文斜体标题实际CSS栈含Georgia/Songti SC/SimSun，本次未额外固定SimSun，若影片使用该标题样式，应由导演固定所用字体。

| 原文条款 | 本子任务状态 |
|---|---|
| 2倍分辨率采集真实产品 | 已执行2560×1440，对应1280×720 |
| logo从源头取SVG，不重画 | 002 favicon已执行；根项目独立logo未发现，须明确边界 |
| 真实颜色和字体取样 | 已执行，资产JSON可追溯 |
| 逐帧差分与密集拼版研究参考 | 已执行一部完整Linear官方片；Stripe未完成 |
| 研究观众现在如何讨论 | 已执行，有2026年讨论链接与日期限制 |
| 真实UI重建可动组件 | 本任务仅提供源，不评估影片实现 |
| 与最好作品相当 | 本研究不能判定；待独立评审与人工审看 |


更正记录：参考研究初稿将该文件尺寸记成1920×960；父协调代理对同一SHA文件再次ffprobe确认1280×720，已更正。帧率、帧数、时长、字节数及哈希不变。差分脚本使用320×160分析尺寸，不应误当原视频尺寸或保真画幅。
