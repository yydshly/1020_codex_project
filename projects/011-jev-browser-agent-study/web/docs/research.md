# Jev Ultrafast 研究底稿

核对日期：2026-10-23（Asia/Shanghai）。上游：browser-use/jev-ultrafast，main commit `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`，提交于 2026-09-18；包版本 0.1.0，MIT，版权方 Browser Use。仓库文件逐个通过 GitHub 连接器读取，没有克隆完整仓库，没有调用付费模型，没有复测上游性能或真实酒店预订。

## 1. 顶部应传达的核心理解

**这个库把网页转换为模型能选择的操作，再负责执行和持续循环。Jev 是做选择的支撑模型。**

分工可以概括为：库看网页、列操作、发问题、执行选择；Jev 根据目标与当前状态决定下一步；独立文字模型只在需要填字时生成内容；Chrome / Browser Harness 完成浏览器控制。它提供应用层的浏览器 Agent 骨架，价值是复用通用观察、决策接入、执行与调试代码，并展示降低延迟的工程方法。

“选择题架构”是便于理解的说法：操作集合和识别规则由开发者预先编写，每轮代码按实际网页生成候选对象。没有先让某个大模型替 Jev 出题的步骤；也没有消除模型对上下文的需求。

来源：[README](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/README.md)、[model.py](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py)、[agent.py](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py)。

## 2. 证据标签与阅读边界

- **源码事实**：可以在固定 commit 的代码中直接核对。
- **官方声明**：TypeSafe 对 Jev 架构、训练、并行或校准的公开说明，本项目没有独立重现。
- **我们的推断**：基于源码得到的工程解释、适用性判断或改造方向。
- **教学示意**：用于讲清楚分工的简化场景、编号、概率、耗时或交互，不是已连接的真实网站或模型。
- **未复测**：性能数字、成功记录来自作者报告，不是本项目的测量。

网页的交互演示应明确标注“本地教学模拟”。模拟中展示的 A/B/C、目标概率、城市、酒店名与步骤不能被当成原库真实 trace 或模型实测。完整动作平铺成选项可作为解释，但需要另展示原版 operation / target 多问题结构。

## 3. 原版实际分层与数据流

| 层 | 输入 | 实际职责 | 输出 |
| --- | --- | --- | --- |
| 业务入口 | URL、自然语言完整目标 | 创建 Agent；定义独立业务验收 | 运行状态与结果校验 |
| DOM 观察 | 当前网页 | 抽取常见 HTML/ARIA 控件、文本、状态；保留实际节点身份 | page、actions、marker、guards |
| 动作空间 | actions | 对元素编号；按操作分组兼容目标 | elements、targets、controls |
| Jev 决策 | 目标、当前状态、最近动作、问题 | 返回操作与各目标问题的选择、概率和 confidence | operation / target 答案 |
| 文字 helper | 目标、选中字段、页面、短历史 | 仅 TYPE_TEXT 时产生合法 JSON 字段值 | 要输入的字符串 |
| 浏览器执行 | 已观察动作、当前节点、文字 | 重新校验时效与遮挡；点击、输入、选择或滚动 | 执行记录 |
| Agent 循环 | 执行结果与新页面 | 保存历史、再次观察、重试或停止 | ready / predicted / done / blocked |

默认 Agent 不向 Jev 提交截图。调试器/录制可以另外采集截图，截图标注不驱动策略。动作节点由代码绑定，不把模型答案解释成 CSS selector、坐标、shell 命令或可执行 JavaScript。

来源：[README](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/README.md)、[browser.py](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py)、[agent.py](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py)。

## 4. 程序怎样自动识别网页可操作能力

这部分是确定的 DOM/ARIA 规则，不是视觉模型发现所有可能操作。

1. 查询 `a[href]`、`button`、`input`、`textarea`、`select`、`summary`、`contenteditable=true`，及指定 ARIA role。
2. 识别 role：button、link、checkbox、radio、switch、tab、menuitem、menuitemradio、option、gridcell、combobox、textbox、searchbox、spinbutton。
3. 从 aria-labelledby、aria-label、关联 label、按钮值、alt、子节点文本、title、placeholder 等提取标签。这是常见情况的实现，没有完整覆盖 accessible-name 标准。
4. 排除 password/file/hidden 输入、不可见、aria-hidden/inert、禁用、元素中心位于当前视口外等候选。
5. 文字输入框、可编辑 combobox 等提供 fill；同一可编辑元素也可有 click 以打开菜单。只读元素不会提供 fill，但可能仍有 click。
6. 原生 select 为每个未选中且未禁用的 option 提供候选。checkbox/radio 的实际 checked 及 ARIA checked/selected/expanded 状态会随控件提交。
7. 依据页面滚动位置加入 SCROLL_UP / SCROLL_DOWN，始终有 WAIT。DONE / BLOCKED 在决策组织阶段加入。
8. 每次快照最多保留 250 条底层动作，记录省略数；同一元素可能贡献多个动作。可见正文最多 6000 字符。

候选“可操作”只是代码层面的初步可行性，不表示这个操作一定符合业务目标。执行前还会重新求几何中心、检测当前可见/禁用/只读状态，并以 elementFromPoint 检查是否被覆盖；不满足则拒绝执行并重新观察或停止。

来源：[snapshot.js](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/snapshot.js)、[browser.py](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py)。

## 5. Jev 收到的原版问题：并非只给一个扁平动作编号

`choose()` 会对同一份状态组织一组问题：

- `operation`：选 CLICK、TYPE_TEXT、SELECT、SCROLL_UP、SCROLL_DOWN、WAIT、DONE 或 BLOCKED；不支持的操作不提供。
- `click_target`：假设点击，哪个已观察元素最合适？
- `type_text_target`：假设填字，哪个可编辑字段最合适？
- `select_target`：仅有原生下拉候选时，选择哪个已观察元素/选项对？

这些问题在一次 TypeSafe HTTP 请求中发出。先看 operation 的结果，只有与之匹配的 target 答案会被校验并执行，其他目标答案丢弃。因此“一次请求同时选动作和目标”不表示浏览器同一轮执行多个动作。

请求的 state 包括页面 URL/title/text、带编号的元素与状态，以及最近最多 10 条已执行动作（action/kind/text/page_changed）。用户目标与规则在问题 instructions 中提供。模型不是凭一个裸按钮列表猜意图，也不是依靠服务自动保存前一轮会话。

**教学示意**：把它说成“候选 A=填写城市，B=点击搜索，模型选 A”有助于理解，但这是简化。把所有合法 operation+target 平铺为一个 enum 是可能的替代设计，不是当前原版 JSON 请求的精确复刻。

来源：[model.py](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py)、[questions.py](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/questions.py)。

## 6. 从一次决策到多轮任务

基本循环：observe → choose → validate → （如果填字则 field_text）→ act → record → observe。

- 浏览器启动和初始网页观察发生在首次决策之前。
- predict 前检查页面是否新鲜；变了就重新观察。
- 选择被 act 消费后立即清空，降低重试造成重复点击的风险。
- 填字前后都检查页面新鲜度。若 stale 重试且整个 helper 输入完全相同，可复用已生成文字。
- 点击/选择的 guard 兼顾文档、表单值、目标与附近上下文，不因任何无关动画都推翻决策。
- 输入后的 combobox 最多等待 200 ms 观察建议；其他交互最多两帧或 50 ms；显式 WAIT 为 100 ms。
- 最多 60 个执行动作、120 次模型决策预算；连续 3 次非 WAIT 操作均没有页面指纹变化时会 blocked。
- DONE / BLOCKED 停止运行。DONE 是模型判断；业务成功还需另写独立验收。

**并行与串行的区别**：同一轮中的多个 Jev 问题共享状态并行评估；跨轮网页操作仍要等执行后观察新状态。一次请求不能可靠预知还没出现的弹窗、联想项和结果页。

来源：[agent.py](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py)、[browser.py](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py)、[questions.py](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/questions.py)。

## 7. 以查酒店理解业务流程

下面是**教学场景**，不是原库在真实酒店平台上的实测：

目标：查杭州酒店，应用指定筛选，打开某酒店详情。

| 轮次 | 库观察到的情况 | Jev 负责的判断 | 库负责的操作 |
| --- | --- | --- | --- |
| 1 | 城市输入框为空 | TYPE_TEXT＋城市字段 | helper生成“杭州”，程序输入 |
| 2 | 联想城市出现 | CLICK＋杭州建议 | 点击该建议 |
| 3 | 日期入口可见 | CLICK＋日期入口 | 打开日历 |
| 4… | 日期、人数、筛选控件变化 | 逐轮选合法操作与目标 | 按需点击/填写/选择 |
| N | 查询条件已满足 | CLICK＋搜索 | 提交搜索 |
| N+1 | 结果加载中 | WAIT | 短等待、重读页面 |
| N+2 | 目标酒店结果可见 | CLICK＋目标酒店 | 打开详情 |
| N+3 | 详情页满足要求 | DONE | 停止；由业务校验检查结果 |

真实日期选择器可能需要多次点击，某些类型不受支持。原库不是预装各酒店平台业务流程的成品，更没有“已支持下单付款”的证据。

作者真正报告的酒店检查是**本地 fixture**：搜索 Lisbon、应用 Design 和 Free cancellation 条件、打开 Casa Flora，耗时 1.896 s，独立检查目标物业及三项条件。该检查只能证明该本地场景，不代表携程、美团等平台上的可用性、可靠性或预订成功。

来源：[performance.md](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/docs/performance.md)。

## 8. 直接调用 Jev、自己写脚本、使用库有什么不同

| 方案 | 你提供什么 | 已有能力 | 仍需自己做 |
| --- | --- | --- | --- |
| 直接调用 Jev | state＋questions | 返回选择及概率 | 浏览器连接、读取网页、动作绑定、执行、历史、循环、业务验收 |
| 固定浏览器脚本 | 预写步骤与控件定位 | 确定流程可直接执行 | 站点适配、等待、失败处理与结果检查 |
| 自己搭网页 Agent | 目标＋自己的观察/决策/执行模块 | 可以做到相同功能 | 从头实现通用模块与调试工具 |
| 使用 jev-ultrafast | URL＋目标＋模型配置 | 复用通用循环与调试、参考执行优化 | 特定站点兼容、业务校验、复杂流程、生产治理 |

**我们的判断**：固定站点、步骤稳定、重视确定性的流程通常适合固定脚本；目标变化、页面动态、希望模型决定路径时，这种库有起点价值。它的价值是节省同类工程搭建工作，而不是获得无法自行实现的酒店搜索算法。

## 9. 能力清单与边界

支持：常见页面控件的点击、文字替换、原生下拉选项、页面上下滚动、等待、停止；自然语言目标驱动；记录最近动作；调试器显示元素编号、概率、耗时、执行轨迹，可暂停在执行前检查；可通过库的 Agent 接口运行其他网址。

MVP边界：不遍历 Shadow DOM / iframe；不处理 Canvas、文件上传、弹出新标签页、嵌套滚动、任意键盘小部件；不完整实现 accessible-name 规范。密码字段明确排除。自行创建的标签页仍共享已有 Chrome profile；需要结合真实站点情况测试。

**我们的判断**：支持“点击/填字”不等于已经支持登录、验证码、支付、任意复杂预订。合法输出也可能选错有效按钮。生产化要补业务验收、合理的失败恢复、受限操作范围、日志/敏感信息处理与可观测性；这些不是本研究网页已实现的 Agent 功能。

来源：[README](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/README.md)、[snapshot.js](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/snapshot.js)、[performance.md](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/docs/performance.md)。

## 10. Jev 为什么快：分开模型声明与执行层事实

**官方声明**：TypeSafe 自述 Jev 使用专门的架构、parallel sampler 与 RLCD，输出预先约束的决策及概率，不生成自由文字；多个问题可一起评估。这些是供应商公开描述，不能据此推断每个候选都各跑一次完整模型，或断言整个请求只需一次前向计算。公开资料不足以复现完整网络、训练数据、损失与推理实现。[发布文](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

**官方训练说明**：RLCD把决策与概率校准作为后训练目标。校准是统计意义：一组报相近概率的预测，其实际频率应接近该概率；不是对单次判断的保证。[AI primer](https://docs.typesafe.ai/introduction/machine-learning-primer)

**官方接口说明**：同 state 的多个问题在一个请求中并行评估，代码采用相关答案；减少先选操作、再发请求选目标的网络往返。[fan-out](https://docs.typesafe.ai/patterns/fan-out) · [state](https://docs.typesafe.ai/concepts/state)

**源码可见的执行优化**：一次调用读取 DOM，不重复解析大量节点；默认不传截图；仅发视口文字；收窄 stale 判定；执行前仍做几何与遮挡检查；短等待建议出现再决策；HTTP连接复用；后台标签保持渲染。这些即使更换决策模型，也有机会保留。

**我们的判断**：普通模型若只输出一个编号、关闭长推理，差距可能缩小；仍有输入计算、服务排队、网络与浏览器成本。这个库不能证明 Jev 比任意普通大模型快几倍。更强模型如果减少无效步骤，也可能降低任务总耗时。

## 11. 性能数字：可以说什么，不能说什么

全部为**作者发布、我们未复测**。

| 项目 | 结果 | 范围 |
| --- | --- | --- |
| Google Flights 视频 | 7.073 s；单次Jev中位178 ms | 17次Jev请求，10次交互＋1次WAIT，2次文字helper |
| 原运行时对比优化后 | 9.450 → 7.092 s 中位，25.0%减少 | 6次交替，同任务、同Chrome profile、每组3次 |
| 浏览器协议调用中位 | 1092 → 101 | 执行层改造效果 |
| Jev请求次数中位 | 22 → 17 | 减少stale与无效观察带来的额外请求 |
| Wikipedia | 2.798 s | 打开指定文章，独立验证URL |
| 本地酒店fixture | 1.896 s | 搜索/筛选/打开Casa Flora的烟测 |
| 两次文字helper费用 | USD 0.00006272 | 不是任务总费用，不含Jev账单与浏览器成本 |

对照两组使用相同的 Jev 1.13.0 与 Mercury 2.5、相同设置，不能把 25% 当成“Jev对比其他模型”。只有同一个航班任务各3次，不是广泛成功率基准。

计时从初始页面观察后的第一次预测开始，到接受 DONE 结束，包含模型、文字生成、操作、过期决策、加载等待。浏览器启动、初始导航、结束后的独立验证在计时之外。视频为1×，末尾0.5秒停留不等同于额外任务时间。实验时新旧运行时都通过3/3；这个样本很小，作者也报告过开发过程的独立验证失败。

来源：[performance.md](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/docs/performance.md)。

## 12. 普通开源模型能否替代，是否要训练

**我们的方案推断**：可以保留浏览器观察/执行层，替换 `choose()` 的适配器。可沿用operation＋target，也可改成完整合法动作的enum；必须验证输出、映射到已观察节点，并区分不同模型概率的定义。`TEXT_MODEL`只配置填字helper，不会自动把Jev决策换掉。

不训练的最小实现：用普通生成模型输出严格候选ID；或在能够读取logits时，对同一答案位置的单token候选标签读分数并归一化。单token、上下文位置和分词必须验证；多token标签不能只比较第一个token。得到的是候选标签分数，不能直接叫实测正确率。[Hugging Face 输出接口](https://huggingface.co/docs/transformers/en/main_classes/output#transformers.modeling_outputs.CausalLMOutput)

概率可靠性应另用标注数据检查，必要时做后处理校准；温度缩放是已有的一类方法，不必因此重训整个模型。若选择能力不足，再用状态/候选/正确动作的数据微调。新分类头通常需要训练。以上不代表能够重现Jev的训练与并行机制。[Guo et al. 2017](https://proceedings.mlr.press/v70/guo17a.html)

比较时看完整任务成功率、总耗时、p50/p95、无效步骤、恢复成本、单个成功任务费用，并保持浏览器、任务、helper与验收相同。仅比较单次生成延迟不足以决定哪个更适合。

## 13. 概率、confidence、上下文的纠偏

- “只给选项”不够：目标、页面正文、字段值、勾选状态、近期操作是决策依据。
- 同请求多个问题都看同一state；“独立判断”指不依赖其他问题答案，不是忽略上下文。
- 下一轮要重新判断，因为浏览器和页面变了。历史由库保存并发回，不是模型自动拥有长期记忆。
- TypeSafe Choice 的 `confidence=(pmax-1/n)/(1-1/n)`，是由分布算出的统计量，不等于单次正确率。源码校验概率有效与所选项为最大值，却没有按confidence阈值拒绝执行；如需置信度路由要另实现。[Confidence](https://docs.typesafe.ai/confidence)
- 模型生成一个数字作为自报信心、语言模型token概率、供应商概率与真实业务成功率不是同一个量。
- 官方文档在核对日列出Jev 1.14（2026-10-14发布）与1.13；`jev-latest`仍指1.13.0，`jev-preview`指1.14.0。要重现结果应锁版本并记录返回model。英语为主要训练语言，中文页面/目标应单独验证。[Models](https://docs.typesafe.ai/models)

## 14. 安装/运行信息：研究记录，不代表本项目已部署

上游要求 Python >=3.12，依赖browser-harness==0.1.13和httpx[http2]>=0.28,<1；uv可安装依赖，Chrome通过Browser Harness连接。上游本地调试界面默认127.0.0.1:8766。

环境变量分两组：`TYPESAFE_API_KEY` / `TYPESAFE_MODEL`控制决策；`TEXT_MODEL_API_KEY` / `TEXT_MODEL_BASE_URL` / `TEXT_MODEL` / `TEXT_MODEL_REASONING`控制填字。示例.env配置OpenRouter＋inception/mercury-2.5、禁用推理；model.py在没设置时的helper缺省则是DeepSeek。不要把示例值和代码fallback混为一谈。API key留在服务器环境，不写网页前端。

上游测试命令包含ruff、pytest、node语法检查、uv build；说明测试离线，真实示例与录制会付费。本研究没有安装并运行这些上游流程。

来源：[pyproject.toml](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/pyproject.toml)、[.env.example](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/.env.example)、[model.py](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py)、[README](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/README.md)。

## 15. 我们的理解：从网页操作选择到持续执行

**我们的归纳**：这个库把当前网页变成一个有边界的操作环境。选择粒度是“点击某个按钮、填写某个字段、选择某个选项”，酒店查询等业务目标由多轮具体操作组合完成。

循环不是针对原始问题反复输出结论，而是“观察当前页面 → Jev 选择 → 程序执行 → 观察改变后的页面 → 再选择”。同一轮的操作题与目标题可以并行回答；后续轮次需要新状态。文字助手只在选中填字操作后生成字段内容，真正输入和点击仍由程序执行。

因此，它超出了 Jev API 的薄封装：快照、动作与节点绑定、状态校验、执行、历史、停止预算及调试共同组成可复用的浏览器 Agent。直接调用 Jev 可以得到选择；把选择变成持续运行的任务，还需要这些工程环节。Jev 本身是它使用的决策模型，不是这个库提供的模型权重或训练方法。

## 16. 能力与价值：已有通用骨架，业务结果仍需验收

下表是**基于源码的能力归纳及我们的价值判断**，不增加真实网站可用性的承诺。

| 已有能力 | 可复用价值 | 仍需另做的部分 |
| --- | --- | --- |
| 从常见 HTML/ARIA 控件提取动作、名称、值与状态 | 减少逐个编写通用控件读取与映射的工作 | 特殊控件、未支持页面结构及具体站点适配 |
| 用目标、当前页面和历史组织 Jev 请求 | 给模型明确的当前选择范围，便于替换和比较决策器 | 其他模型的请求、输出验证与概率含义适配 |
| 校验目标、执行操作、重新观察并记录 | 把一次判断接成连续任务，便于查看失效与延迟 | 复杂失败恢复、长流程状态和业务验收 |
| 提供调试界面及有限场景性能记录 | 为学习架构、定位瓶颈、建立对照提供起点 | 多网站成功率、任务成本和生产可靠性的独立评测 |

若已有稳定脚本或可靠业务 API，是否引入模型应由实际收益决定；自行实现同样的循环也能获得相近的工程能力。对个人研究最有用的是拆清“页面观察、模型选择、浏览器执行、业务验收”四个环节，再按需要复用。发布这份研究网页只是在发布资料和教学演示，不等于部署了真实自动预订系统。

## 17. 可扩展方向与先后路线

以下均为**我们的候选方案，尚未实现或验证**；不代表上游库或本研究网页已具备这些扩展。先建立可验收的小任务，再扩大模型和网站范围。

| 顺序 | 待实现方向 | 具体产物与进入下一步的依据 |
| --- | --- | --- |
| 1 | 本地场景与业务验收 | 为一项查询写出城市、日期、筛选、详情页等检查；保留成功和失败样本，区分 DONE 与实际达标 |
| 2 | 可重复的评测基线 | 固定任务、起始页面、模型版本、文字助手和验收器；记录成功率、全程耗时、请求数、无效操作和成功任务成本 |
| 3 | 替换决策模型 | 改造 choose() 适配，验证合法动作映射与输出；明确分数、概率和日志的新含义，在同一基线上比较，能力不足时再考虑校准或微调 |
| 4 | 扩展观测适配与恢复 | 在已有 stale/遮挡检查之上，按实际失败增加特定控件适配、错误分类、有限重试与状态恢复；每类新增支持都要有可复现页面和验收 |
| 5 | 组合业务上层流程 | 用显式子目标与检查点连接查询、筛选、比较等环节，管理跨页状态；订单、登录、支付如需加入，应作为独立需求实现并验证 |

业务验收与评测是后续扩展的共同前提。模型换得更快、控件识别得更多，都不自动证明整个任务更可靠；应根据测得的失败原因决定优先投入模型、观测、执行还是业务编排。网页教学继续使用固定本地状态，不伪装成真实模型调用或订房结果。

结构化来源见 [sources.json](sources.json)。模型权重、Jev完整训练算法和广泛真实站点可靠性仍不在本次证据范围。
