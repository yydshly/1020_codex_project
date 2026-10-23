"""Build the portable SVG guide and Markdown notes from the local research data."""
from pathlib import Path
import json
import html
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT / "web/data.js").read_text(encoding="utf-8")
data = json.loads(raw.removeprefix("window.ATLAS = ").strip().removesuffix(";"))
parts = []


def rect(x, y, w, h, fill="#ffffff", stroke="#dddcd2", radius=18):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>')


def line(x1, y1, x2, y2, color="#c74d30"):
    parts.append(f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{color}" stroke-width="3" fill="none" marker-end="url(#arrow)"/>')


def text(x, y, value, size=22, color="#203431", weight="400"):
    parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{html.escape(value)}</text>')


def wrap(value, width, size):
    rows, row, units = [], "", 0
    for c in value:
        length = 1 if unicodedata.east_asian_width(c) in "WF" else .57
        if c == "\n" or (units + length) * size > width:
            rows.append(row)
            row, units = "", 0
        if c != "\n":
            row += c
            units += length
    if row:
        rows.append(row)
    return rows


def paragraph(x, y, value, width, size=22, color="#53645e", leading=1.55):
    for row in wrap(value, width, size):
        text(x, y, row, size, color)
        y += size * leading
    return y


def chapter(y, number, title, subtitle):
    text(70, y, number, 22, "#c74d30", "700")
    text(130, y, title, 34, weight="700")
    text(130, y + 36, subtitle, 19, "#53645e")


parts.append('''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="3510" viewBox="0 0 1600 3510" role="img" aria-labelledby="title desc">
<title id="title">产品发现平台完整理解图</title>
<desc id="desc">六个平台的定位、核心差异、选择路径、市场验证动作与失败回路。事实来自官方资料，方法属于研究归纳。</desc>
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#c74d30"/></marker></defs>
<rect width="1600" height="3510" fill="#f6f4ee"/>
<g font-family="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif">''')
text(70, 65, "FIELDNOTES / 008      产品 · 创作者 · 被发现的方式", 20, "#c74d30", "700")
text(70, 134, "产品发现平台完整理解图", 54, weight="700")
text(70, 181, "从 Product Hunt 出发：理解平台 → 选择入口 → 收集线索 → 用真实行为验证", 25, "#53645e")
rect(70, 218, 1460, 143, "#203431", "#203431")
text(100, 264, "核心理解", 21, "#efb77e", "700")
text(100, 304, "平台围绕不同的内容中心连接产品与人；发布、关注、使用与付费是不同层次的结果。", 26, "#ffffff", "700")
text(100, 338, "Product Hunt 的管理是主页、团队和发布记录管理；并非产品开发、订单或客户管理系统。", 21, "#d4ded8")

chapter(425, "01", "先看内容中心，再看功能", "四类定位是我们的归纳，不是官方分类，也不是平台效果排名。")
families = [("产品发布", "Product Hunt · Uneed · 新趣集"), ("早期项目", "BetaList"), ("软件替代", "AlternativeTo"), ("创业过程", "Indie Hackers")]
for i, (name, names) in enumerate(families):
    x = 70 + i * 370
    rect(x, 485, 350, 103, "#eeeae0")
    text(x + 22, 524, name, 26, weight="700")
    text(x + 22, 559, names, 17, "#53645e")

chapter(658, "02", "六个平台：各自解决什么问题", "下列能力与参与机制依据官方资料归纳；费用、收录与语言要求在实际操作前复核。")
for i, p in enumerate(data["platforms"]):
    x = 70 + (i % 2) * 740
    y = 717 + (i // 2) * 266
    rect(x, y, 720, 246)
    text(x + 26, y + 43, p["name"], 31, p["color"], "700")
    text(x + 26, y + 80, p["question"], 23, weight="700")
    end = paragraph(x + 26, y + 117, "中心：" + p["object"] + "。价值：" + p["value"] + "。", 666, 20)
    end = paragraph(x + 26, end + 6, "参与：" + p["participation"] + "。", 666, 20)
    paragraph(x + 26, end + 6, "边界：" + p["limit"], 666, 18, "#886039", 1.4)

chapter(1566, "03", "按任务选择入口", "产品可属于个人或企业。社区条目并不自动代表官方声明；Product Hunt 不限定某个 AI 模型。")
tasks = [
    ("发现方向", "PH / BetaList / 新趣集", "收集任务、人群和反复出现的问题"),
    ("发布作品", "PH / Uneed / 新趣集", "准备演示、体验链接与反馈入口"),
    ("招募内测", "BetaList", "核对早期阶段条件，安排真实体验"),
    ("研究竞品", "AlternativeTo / PH", "找替代关系，回到官网并实测"),
    ("学习经营", "Indie Hackers", "看渠道、代价、失败与适用条件")]
for i, (task, platforms, action) in enumerate(tasks):
    y = 1626 + i * 64
    rect(70, y, 1460, 54, "#ffffff", radius=8)
    text(94, y + 35, task, 22, "#c74d30", "700")
    text(270, y + 35, platforms, 22, weight="700")
    text(785, y + 35, action, 22, "#53645e")

chapter(2010, "04", "从平台线索走向需求证据", "这是建议流程，未在本研究中执行用户招募、投放或收入验证。中文市场需要中文目标用户的证据。")
steps = [
    ("圈定任务", "动作：确定人群、场景和任务", "产物：一句可验证的问题描述", "条件：目标用户可以接触到"),
    ("收集问题", "动作：记录重复困难与替代办法", "产物：问题原话、日期和来源", "条件：确有频率或成本"),
    ("同任务比较", "动作：用相同材料试用竞品", "产物：结果、步骤与价格差异", "条件：有值得验证的改善"),
    ("小样交付", "动作：访谈后交付可用结果", "产物：真实任务完成记录", "条件：用户愿意投入材料"),
    ("复用与付费", "动作：观察回访、购买与推荐", "产物：价值与获客成本证据", "条件：持续价值与成本可行")]
for i, (title, action, output, criteria) in enumerate(steps):
    x = 70 + i * 296
    rect(x, 2072, 276, 232, "#ffffff")
    text(x + 18, 2110, f"0{i+1}", 20, "#c74d30", "700")
    text(x + 18, 2150, title, 27, weight="700")
    for j, value in enumerate((action, output, criteria)):
        paragraph(x + 18, 2190 + j * 34, value, 242, 16.5, leading=1.3)
    if i < 4:
        line(x + 277, 2125, x + 293, 2125)

rect(70, 2330, 1460, 100, "#e7eee8")
text(98, 2370, "实施衔接", 23, weight="700")
paragraph(267, 2370, "先确认有用的结果，再做最小实现；根据使用场景选择网页／App、部署与域名。技术上线后继续观察使用。", 1210, 21)
text(98, 2408, "个人参考", 21, "#26746c", "700")
text(267, 2408, "用六个平台降低搜索成本，把时间投入到用户、任务和可验证的差异；不因榜单热度直接扩张功能。", 20, "#53645e")

rect(70, 2460, 1460, 207, "#f3e9dd", "#e5d4bf")
text(98, 2501, "失败回路：证据不足时，回到对应问题", 27, "#886039", "700")
text(98, 2545, "不愿意试用 → 重查人群与表达 → 回到「圈定任务」", 23)
text(98, 2586, "使用后不回来 → 检查结果质量、任务频率与替代优势 → 回到「同任务比较／小样交付」", 23)
text(98, 2627, "经常用但不付费 → 检查购买者、定价和交付成本 → 调整实验；不可行时停止投入", 23)

chapter(2740, "05", "用证据约束结论", "每个数字都要说明样本、时间、来源与人群。不要把海外科技社区反馈直接外推为整个中文市场。")
rect(70, 2802, 1460, 124, "#203431", "#203431")
text(100, 2848, "点赞／夸赞  →  注册／留邮箱  →  完成真实任务  →  主动再用  →  购买／续费／推荐", 27, "#ffffff", "700")
text(100, 2893, "关注信号逐渐接近价值证据；仍需验证购买者、任务频率、留存、渠道成本和适用范围。", 22, "#d4ded8")

labels = [("有来源的事实", "平台定位、主页结构、参与和收录规则。当前方案可能变化。", "#26746c"), ("我们的判断", "四类内容中心、选用路径、实测与验证流程。没有做流量排名。", "#886039"), ("尚未验证", "获客效果、付费意愿和市场规模；示例产品是假设案例。", "#6b50a0")]
for i, (title, desc, color) in enumerate(labels):
    x = 70 + i * 493
    rect(x, 2950, 473, 141)
    text(x + 24, 2990, title, 25, color, "700")
    paragraph(x + 24, 3026, desc, 425, 21)

text(70, 3150, "资料与阅读方式", 30, weight="700")
paragraph(70, 3193, "官方来源：Product Hunt 帮助中心与产品页、Uneed 发布说明、BetaList 帮助与标准、AlternativeTo 关于与 FAQ、Indie Hackers 栏目、新趣集关于与发布页。完整 19 项链接见网页「来源与边界」及研究笔记。", 1450, 22)
paragraph(70, 3307, "范围：汇总对话理解与六个平台的比较，不展开自建平台的扩展规划。未购买推广、提交产品或测量转化。资料快照：2026-10-23。", 1450, 22)
text(70, 3430, "008 / PRODUCT PLATFORM ATLAS", 20, "#c74d30", "700")
text(70, 3470, "独立研究整理 · 非平台官方页面 · SVG 矢量图可放大阅读", 19, "#53645e")
parts.append('</g></svg>')
svg = "\n".join(parts)
for folder in ("assets", "web"):
    (ROOT / folder).mkdir(exist_ok=True)
    (ROOT / folder / "platform-guide.svg").write_text(svg, encoding="utf-8")

notes = ["# 产品发现平台图谱", "", f"资料快照：{data['date']}。本页为独立研究整理，不代表平台官方。", "", "## 核心理解", "", "Product Hunt 以产品为中心组织发布、发现与交流。个人和公司均可参与；账号、产品归属、产品主页和一次发布是不同对象。主页管理不是产品开发、订单或客户管理。", "", "四类内容中心是我们的归纳：产品发布（Product Hunt、Uneed、新趣集）、早期项目（BetaList）、软件替代（AlternativeTo）、创业过程（Indie Hackers）。", ""]
fields = [("object", "内容中心"), ("audience", "主要人群"), ("entry", "发现入口"), ("interaction", "互动"), ("lifecycle", "阶段"), ("participation", "参与方式"), ("cost", "费用"), ("language", "语言"), ("value", "主要价值"), ("limit", "边界")]
for p in data["platforms"]:
    notes += [f"## {p['name']}", "", p['question'], ""]
    notes += [f"- **{label}**：{p[key]}" for key, label in fields]
    notes += ["", "核心能力：" + "；".join(p["features"]) + "。", "", "我们的理解：" + p["insight"], "", "假设案例：" + p["example"], "", "依据：" + "、".join(f"[{s['title']}]({s['url']})" for s in data["sources"] if s["id"] in p["sources"]), ""]
notes += ["## 按目的选择", ""]
for r in data["routes"]:
    notes += [f"### {r['label']}", "", r["description"], "", r["action"], "", "边界：" + r["boundary"], ""]
notes += ["## 从线索到验证", "", "1. 圈定用户、场景和任务，确认可以接触到目标用户。", "2. 收集产品与重复问题，记录原话、时间和来源。", "3. 用同一任务试用 3–5 个竞品，也比较表格、人工和通用 AI。", "4. 访谈后用最小样例交付真实结果，记录用户是否投入材料并完成任务。", "5. 观察主动复用、购买、续费与推荐，同时核算获客和交付成本。", "", "起步可收集 10–15 个相关产品，访谈 5–10 位目标用户。这些是建议数量，不是统计充分性的保证。中文市场需加入中文目标用户的实际行为。", "", "失败回路：不试用时重查人群与表达；用后不回来时检查结果质量、频率和替代优势；常用却不付费时检查购买者、价格和交付成本。证据不足时调整实验或停止。", "", "实施衔接：确认有用的结果后做最小实现，根据场景选择网页或 App、部署和域名。上线只是技术结果，不是市场验证。", "", "## 事实、判断与未知", "", "- 平台规则以官方原文为依据；费用、语言、榜单与收录要求会变化。", "- Product Hunt 发布免费，广告另收费；发布内容用英文，产品可服务中文用户；纯中文界面不保证通过审核或获推荐。", "- 公司产品主页不证明每条内容均来自官方。榜单互动不是收入或质量认证。", "- 对话起点的 Astra 合作活动指定 2026-09-18 发布，该日期已过；本页不提供当前参赛入口指引。", "- 分类与选用路径属于研究归纳；没有比较真实流量，也没有获客效果排名。", "- 没有提交产品、购买推广、访谈、测量留存或收入。中文笔记软件只是解释差异的假设案例。", "- 新趣集发布方案价格未完整核实；操作前查看当前规则。", "- 当前范围不包含自建平台的功能扩展规划。", "", "## 官方来源", ""]
for i, s in enumerate(data["sources"], 1):
    notes += [f"{i}. [{s['title']}]({s['url']}) — {s['supports']}"]
markdown = "\n".join(notes) + "\n"
for folder in ("notes", "web"):
    (ROOT / folder).mkdir(exist_ok=True)
    (ROOT / folder / "research.md").write_text(markdown, encoding="utf-8")
print("Generated assets/platform-guide.svg, web/platform-guide.svg, notes/research.md, web/research.md")
