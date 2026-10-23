# 单图总览制作记录

方法：内置 Imagegen；非 CLI / API 调用。输出为 1536 × 1024 PNG。

用途：汇总六个平台的定位、作用、个人价值、适用阶段，以及从找方向到市场验证的使用顺序。依据本项目现有官方来源记录，未新增流量、效果或收入承诺。

最终图片：`assets/platform-overview-2026-10-23.png`。网页使用副本位于 `web/platform-overview-2026-10-23.png`。

## 最终提示词

```text
Create ONE polished Chinese information-design poster, landscape 3:2 aspect ratio, high resolution ideally 3840×2560. This is the definitive visual summary for a Chinese independent product creator studying six product discovery platforms. ALL text must be crisp accurate Simplified Chinese; platform names in English as given. Dense but readable editorial infographic, no photos, no mockup device, no 3D decoration, no giant ornamental icons. Warm ivory paper #f6f4ee, dark teal #203431, muted orange #c74d30, restrained distinct accent per platform. Professional typographic hierarchy, clear grid, ample spacing, light card borders. Main title visually dominant; six platforms dominate the central 60% of the image. Six equal cards in 3 columns × 2 rows; arrange first row Product Hunt, Uneed, 新趣集 (same publication family); second row BetaList, AlternativeTo, Indie Hackers. Small simple letter badges not forged official logos. Use bold highlighted “对我价值” within each card. Every text below must be represented legibly, do not add fabricated numbers, pricing amounts, market-size or success claims.

TOP:
Title: “产品发现平台 · 一张图看懂”
Subtitle: “六个平台分别做什么？我能获得什么？怎样用它们找到值得做的产品？”
Prominent concise understanding ribbon:
“共同价值：连接产品、创作者与用户，降低发现、比较和交流成本。”
Second line: “区别在内容中心：产品发布 / 早期项目 / 软件替代 / 创业过程”

SIX CARD EXACT CONTENT (use compact short rows, separate bold labels):
1. “Product Hunt” badge “发布与发现”
“定位：新品发布 + 长期产品档案”
“能力：发布排期、榜单、评论、评价、团队主页”
“我怎么用：看新品与反馈，组织正式发布”
“对我价值：找灵感、看竞品、获得早期反馈”
“适用：独立创作者和公司团队；以英文展示”
“费用：正常发布免费，广告另付费”

2. “Uneed” badge “发布与发现”
“定位：工具目录 + 发布展示”
“能力：排期、分类、投票、滚动榜单、徽章”
“我怎么用：补充发布渠道，维护产品介绍”
“对我价值：增加被发现的机会”
“适用：已有可展示产品，希望增加曝光”
“费用：免费与付费方案并存，保留条件不同”

3. “新趣集” badge “中文发布与交流”
“定位：面向中文用户的产品发现社区”
“能力：产品提交、分类榜单、评论、文章”
“我怎么用：用中文展示场景、解释产品、交流”
“对我价值：降低语言成本，接触中文反馈”
“适用：中文产品、中文用户与创作者”
“注意：发布价格待核实；中文支持不等于转化”

4. “BetaList” badge “早期项目”
“定位：筛选刚起步的创业项目”
“能力：编辑审核、项目展示、邮件与注册引导”
“我怎么用：为未上线、内测或新项目招募体验者”
“对我价值：接触早期用户，验证初始兴趣”
“适用：项目早期；成熟产品并非重点”
“费用：提交付费，未选中退款”

5. “AlternativeTo” badge “软件替代”
“定位：围绕替代关系的软件选型库”
“能力：替代推荐、平台与许可筛选、评价”
“我怎么用：围绕同一个任务查竞品、做实测”
“对我价值：找替代方案、识别差异与机会”
“适用：有明确需求的选型者和产品研究者”
“注意：替代关系不代表功能完全等价”

6. “Indie Hackers” badge “创业过程”
“定位：独立创业者的经营交流社区”
“能力：案例、讨论、项目进展、经验分享”
“我怎么用：研究获客、定价、失败与经营过程”
“对我价值：减少试错，建立同行联系”
“适用：从想法到经营阶段的个人与小团队”
“注意：有公开及付费内容；个案不是普遍结果”

BELOW CARDS: a compact Product Hunt understanding strip with heading “我们对 Product Hunt 的关键理解”
Three equally spaced notes:
“个人和公司都可参与；社区条目不自动代表官方声明”
“产品主页是长期档案；一次发布是一个展示事件”
“独立平台，不限定 AI 模型；专项挑战赛另有规则”
Second concise tiny line:
“中文产品可参与，提交内容使用英文。平台管理的是主页与发布资料，不是开发、订单和客户系统。”

BOTTOM: actionable left-to-right flow labeled “对我最实用的使用顺序”
Five linked steps, bold short headings plus platform names plus one output:
“找方向” / “PH · BetaList · 新趣集” / “产出：人群与问题清单”
→ “看竞品” / “AlternativeTo · PH” / “产出：同任务实测差异”
→ “找人试用” / “BetaList · 中文目标用户” / “产出：真实体验反馈”
→ “发布与交流” / “PH · Uneed · 新趣集” / “产出：访问与反馈记录”
→ “学习经营” / “Indie Hackers” / “产出：获客与定价实验”

Bottom dark-teal evidence band, readable white text:
“判断有没有市场：关注 → 注册 → 完成真实任务 → 主动复用 → 付费 / 续费”
“没有人试用：重查人群与表达。用后不回来：检查质量与频率。不愿付费：检查购买者、价格与成本。”
Bottom fine print:
“平台热度 ≠ 市场成立。要结合中文目标用户、获客成本与真实行为验证。”
“资料快照 2026-10-23｜平台事实依据官方资料；分类、路径和个人价值为研究归纳；未验证实际转化。完整来源见配套研究网页。”

Design must show distinct visual reading order: overview understanding -> six platform comparisons -> personal use workflow -> evidence and limitations. It must feel like one complete purposeful map, not a webpage screenshot or random text sheet. All six platforms equally legible. Preserve all six exact names.
```
