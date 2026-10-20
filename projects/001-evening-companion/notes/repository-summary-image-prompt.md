# 总结图生成记录

工具：内置 image_gen（imagegen 技能），单张中文信息图。

以下为完整生成提示词。原库事实与产品扩展设想分别标注，未使用作者照片。

```text
Use case: infographic-diagram
Create one polished Chinese product-research summary infographic about the cyber-xiaowan repository and its inspiration for our desktop AI girlfriend project. Landscape 3:2 composition, high resolution, excellent legibility, elegant cream background, deep forest green typography, teal accents for upstream facts, soft peach for future extensions. Editorial information design, generous whitespace, crisp Chinese sans-serif type, strong hierarchy. Single cohesive poster with title on top, two balanced columns, full-width roadmap and conclusion below. Use simple tasteful illustrated pictograms, arrows and a small schematic desktop character card; this schematic must be labeled “结构示意” and must not look like an actual screenshot. No real-person photos, no imitation of the author's likeness, no invented capabilities. The point is gradual delivery and decoupling companionship from 3D, NOT dismissing the repository as worthless. All Chinese text must be sharp, correct, fully visible; do not add paragraphs beyond provided copy.

Exact text and layout:
TOP title, large:
“从赛博小晚，到我们的 AI 女友”
Subtitle:
“先让陪伴发生，再逐步升级形象”

LEFT PANEL, teal header:
“01  原库效果：让 Agent 状态看得见”
Draw a schematic desktop card with a tiny generic illustrated female avatar (simple original icon, not photoreal), speech bubble, state label and emoji chip. Labels around card:
“预设台词气泡”
“静态人物图片”
“状态名 + emoji”
Small caption “结构示意”
Below, seven compact state chips, all seven exactly once:
“待机” “思考” “干活” “鼓掌” “疑问” “比心” “打盹”
Then key fact:
“7 张静态图片 · 21 句预设台词”
Flow, readable left-to-right:
“点击 / 命令 / 宿主事件 → 切换状态 → 图片与台词展示”
Key takeaway emphasized:
“桌宠展示层的本质：把图片当作情绪表情包”
Small qualifying line:
“这是状态表达，不是桌宠自己理解了情绪。”

RIGHT PANEL, peach header:
“02  对我们的价值：不必等 3D 全部做好”
Top callout:
“我们卡在 3D，可以先换一条实现路径。”
Three concise layers, with distinct icons and short connecting lines:
“角色形象：图片表情包先建立存在感”
“视觉表现：逐步接入转场、呼吸、粒子等效果”
“陪伴能力：接入真实聊天、记忆与主动互动”
A clear small badge above layers:
“我们的扩展方向”
Boundary box:
“原库已有：图片状态展示 + 思考与表达 Skill”
“需要补充：聊天接口、长期记忆、主动触发机制”
“Skill 指导宿主模型；桌宠页面本身不提供自由聊天。”

BOTTOM FULL-WIDTH roadmap header:
“03  分阶段落地，把 3D 变成升级项”
Four connected numbered cards, prominent and evenly sized:
“① 图片 + 真实聊天”
“先验证愿不愿意聊”
“② 记忆 + 主动互动”
“再验证持续陪伴价值”
“③ 动效 / 2D 表现”
“逐步丰富情绪与反馈”
“④ 按需升级 3D”
“复用已有对话与记忆”
Connect all four with arrows, no implication these are existing repository capabilities.
Strong full-width bottom conclusion:
“不必一次到位：先做能陪伴的版本，再做更立体的她。”
Tiny footer:
“基于 cyberxiaowan/cyber-xiaowan v2.2.0 的本地研究整理 · 路线为我们的产品设想”
Avoid visual clutter, excessive decoration, dense tiny text, duplicated text, false promises. Do not suggest existing upstream JPEG animation is functioning; added effects are explicitly a future extension.
```
