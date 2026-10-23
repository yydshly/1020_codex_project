"""Build one comprehensive SVG overview; export a PNG too when Pillow is available."""
from pathlib import Path
from html import escape
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
WIDTH = 1600
MARGIN = 64
INNER = WIDTH - MARGIN * 2
INK, MUTED, GREEN = "#243b35", "#65756b", "#275e4d"
PAPER, CARD, LINE, LIGHT = "#f7f5ef", "#fffefa", "#d8dfd1", "#e9eee1"

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    Image = ImageDraw = ImageFont = None


class Guide:
    def __init__(self):
        self.parts = []
        self.draws = []
        self.y = 318
        self.chapters = []
        self.fonts = {}

    def font(self, size, bold=False):
        key = (size, bold)
        if key not in self.fonts:
            path = Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc")
            self.fonts[key] = ImageFont.truetype(str(path), size) if ImageFont and path.exists() else None
        return self.fonts[key]

    def measure(self, value, size=20, bold=False):
        font = self.font(size, bold)
        if font:
            return font.getlength(value)
        return sum(size if unicodedata.east_asian_width(c) in {"W", "F"} else size * .56 for c in value)

    def wrap(self, value, width, size=20, bold=False):
        result, current = [], ""
        for char in value:
            if char == "\n":
                result.append(current)
                current = ""
                continue
            if current and self.measure(current + char, size, bold) > width:
                if char in "，。！？；：、）》】”’…,.!?;:%" and len(current) > 2:
                    # Keep closing punctuation together with preceding text.
                    tail, current = current[-2:], current[:-2]
                    result.append(current.rstrip())
                    current = tail
                    current += char
                    continue
                result.append(current.rstrip())
                current = ""
            current += char
        if current:
            result.append(current.rstrip())
        return result

    def rect(self, x, y, w, h, fill=CARD, stroke=LINE, radius=12):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>')
        self.draws.append(("rect", (x, y, w, h, fill, stroke, radius)))

    def text(self, x, y, value, size=20, color=INK, bold=False):
        self.parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{600 if bold else 400}">{escape(value)}</text>')
        self.draws.append(("text", (x, y, value, size, color, bold)))

    def paragraph(self, x, y, value, width, size=20, color=MUTED, gap=32, bold=False):
        rows = self.wrap(value, width, size, bold)
        for row in rows:
            self.text(x, y, row, size, color, bold)
            y += gap
        return y

    def line(self, x1, y1, x2, y2, color=LINE, width=2):
        self.parts.append(f'<path d="M{x1},{y1} L{x2},{y2}" fill="none" stroke="{color}" stroke-width="{width}"/>')
        self.draws.append(("line", (x1, y1, x2, y2, color, width)))

    def section(self, number, title, subtitle):
        if self.chapters:
            self.y += 50
        self.chapters.append({"number": number, "title": title, "y": self.y - 36})
        self.rect(MARGIN, self.y - 31, 52, 43, GREEN, GREEN, 5)
        self.text(MARGIN + 10, self.y, number, 24, "#f4f4e9", True)
        self.text(MARGIN + 74, self.y + 1, title, 32, INK, True)
        bottom = self.paragraph(MARGIN, self.y + 46, subtitle, INNER, 21, MUTED, 34)
        self.y = bottom + 16

    def cards(self, data, cols=3, fill=CARD, body_size=20):
        gutter = 22
        width = (INNER - (cols - 1) * gutter) / cols
        for start in range(0, len(data), cols):
            row = data[start:start + cols]
            heights = []
            for title, paragraphs in row:
                title_lines = len(self.wrap(title, width - 48, 25, True))
                body_lines = sum(len(self.wrap(p, width - 48, body_size)) for p in paragraphs)
                heights.append(35 + title_lines * 36 + 17 + body_lines * 32 + (len(paragraphs) - 1) * 12 + 22)
            height = max(heights)
            for col, (title, paragraphs) in enumerate(row):
                x = MARGIN + col * (width + gutter)
                self.rect(x, self.y, width, height, fill)
                cursor = self.paragraph(x + 24, self.y + 43, title, width - 48, 25, INK, 36, True) + 17
                for p in paragraphs:
                    cursor = self.paragraph(x + 24, cursor, p, width - 48, body_size) + 12
                if cursor - 12 > self.y + height:
                    raise ValueError(f"Card overflow: {title}")
            self.y += height + gutter

    def band(self, title, value, fill=LIGHT):
        rows = self.wrap(value, INNER - 48, 20)
        height = 86 + len(rows) * 32
        self.rect(MARGIN, self.y, INNER, height, fill)
        self.text(MARGIN + 24, self.y + 38, title, 23, GREEN, True)
        self.paragraph(MARGIN + 24, self.y + 78, value, INNER - 48)
        self.y += height + 26

    def source_table(self, sources):
        widths = [232, 404, 360, 476]
        xs = [MARGIN]
        for width in widths[:-1]:
            xs.append(xs[-1] + width)
        self.rect(MARGIN, self.y, INNER, 52, GREEN, GREEN, 8)
        for x, label in zip(xs, ["来源 / 信息形态", "信息从哪里来", "供我们观察什么", "后续怎么处理"]):
            self.text(x + 16, self.y + 34, label, 20, "#f4f4e9", True)
        self.y += 52
        for i, source in enumerate(sources):
            texts = [source[key] for key in ("collected_from", "observe", "followup")]
            counts = [len(self.wrap(t, w - 32, 19)) for t, w in zip(texts, widths[1:])]
            kind = source["kind"].split(" · ")[0]
            address = source["url"].replace("https://", "").replace("www.", "").rstrip("/")
            left_height = 41 + len(self.wrap(kind, widths[0] - 32, 15)) * 24 + len(self.wrap(address, widths[0] - 32, 14)) * 22
            height = max(32 + max(counts) * 30, left_height + 15)
            self.rect(MARGIN, self.y, INNER, height, CARD if i % 2 == 0 else "#f0f2e9", LINE, 0)
            self.parts.append(f'<a href="{escape(source["url"], quote=True)}" target="_blank">')
            cursor = self.paragraph(xs[0] + 16, self.y + 31, source["name"], widths[0] - 32, 21, GREEN, 30, True)
            cursor = self.paragraph(xs[0] + 16, cursor, kind, widths[0] - 32, 15, MUTED, 24)
            self.paragraph(xs[0] + 16, cursor + 1, address, widths[0] - 32, 14, MUTED, 22)
            self.parts.append('</a>')
            for x, width, value in zip(xs[1:], widths[1:], texts):
                self.paragraph(x + 16, self.y + 31, value, width - 32, 19, MUTED, 30)
            self.y += height
        self.y += 26

    def finish(self):
        height = int(self.y + 36)
        title = "AI 与效率工具信息体系：价值、来源、处理、使用和扩展全景图"
        desc = "一张完整长图，包含六项核心价值、七个原始来源与三类补证入口、六阶段处理闭环、证据结构与虚构去重示例、日常提示词、十二类应用方向、自动化演进、两周起步与验证边界。"
        prefix = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height}" viewBox="0 0 {WIDTH} {height}" role="img" aria-labelledby="title desc">', f'<title id="title">{title}</title>', f'<desc id="desc">{desc}</desc>', f'<rect width="{WIDTH}" height="{height}" fill="{PAPER}"/>', '<g font-family="Microsoft YaHei,Segoe UI,sans-serif">']
        svg = "\n".join(prefix + self.parts + ['</g></svg>'])
        for folder in (ROOT / "assets", ROOT / "web"):
            (folder / "source-to-evidence-guide.svg").write_text(svg, encoding="utf-8")
        if Image and self.font(20):
            image = Image.new("RGB", (WIDTH, height), PAPER)
            draw = ImageDraw.Draw(image)
            for kind, args in self.draws:
                if kind == "rect":
                    x, y, w, h, fill, stroke, radius = args
                    draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill=fill, outline=stroke)
                elif kind == "text":
                    x, y, value, size, color, bold = args
                    draw.text((x, y), value, font=self.font(size, bold), fill=color, anchor="ls")
                elif kind == "line":
                    x1, y1, x2, y2, color, width = args
                    draw.line((x1, y1, x2, y2), fill=color, width=width)
            for folder in (ROOT / "assets", ROOT / "web"):
                image.save(folder / "source-to-evidence-guide.png", optimize=True)
        for filename in ("index.html", "guide.html"):
            path = ROOT / "web" / filename
            page = path.read_text(encoding="utf-8")
            page = re.sub(r'(src="source-to-evidence-guide.svg" width="1600" height=")\d+("?)', lambda m: f'{m[1]}{height}{m[2]}', page)
            if filename == "guide.html":
                options = ['<option value="0">全图开头</option>'] + [f'<option value="{c["y"]}">{c["number"]} {c["title"]}</option>' for c in self.chapters]
                page = re.sub(r'(?<=<!-- CHAPTERS:START -->).*?(?=<!-- CHAPTERS:END -->)', lambda _: "".join(options), page, flags=re.S)
            path.write_text(page, encoding="utf-8")
        (ROOT / "assets" / "guide-layout.json").write_text(json.dumps({"width": WIDTH, "height": height, "chapters": self.chapters}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Generated comprehensive guide: {WIDTH} x {height}, {len(self.chapters)} chapters; SVG + optional PNG.")


def build_guide(source_guide=None):
    if source_guide is None:
        source_guide = json.loads((ROOT / "src/source-guide.json").read_text(encoding="utf-8"))["sources"]
    g = Guide()
    g.rect(0, 0, WIDTH, 264, "#203c33", "#203c33", 0)
    g.text(64, 52, "010 / 我们对 AI 与效率工具信息获取的共同理解", 20, "#becfae")
    g.text(64, 122, "把分散的信息，变成可复用的判断依据。", 48, "#faf7ed", True)
    g.text(64, 174, "任务入口 → 来源池 → 去重与互补分析 → 证据库 → 选择、行动与扩展", 25, "#e1e9d5")
    g.text(64, 219, "整理于 2026-10-23  ·  网站说明来自本次核对；使用方法为我们的总结；扩展方向为待验证建议", 18, "#b3c6aa")

    g.section("01", "我们总结的价值：积累来源、证据和处理方法", "模型能帮忙搜索与分析；我们的积累让下一次知道从哪里查、哪些材料重复、结论适用于什么条件，以及下一步该验证什么。")
    g.cards([
        ("发现有增量的信息", ["找到新候选、冷门工具、原创测试、长期体验和失败案例。", "价值判断：这个来源是否补了原先缺少的信息？"]),
        ("减少重复与漏项", ["合并同一发布稿的转载，按缺口补官方资料、实测和问题反馈。", "价值判断：少看重复内容，关键证据是否更完整？"]),
        ("判断有依据、有边界", ["保留原文、版本、条件与矛盾，区分厂商声明、观察与模型推断。", "价值判断：能否解释为什么选它，何时不适用？"]),
        ("把搜索变成持续积累", ["把可复用材料留下，追加新版本与本人测试；下次先查已有证据。", "价值判断：是否减少重复调研，并能追溯变化？"]),
        ("让模型执行更稳定", ["用同一任务模板约定查什么、如何去重、缺证据怎么办、怎样输出。", "价值判断：不同轮次的结果是否更容易核对与复用？"]),
        ("最终帮助实际行动", ["将证据用于选工具、改流程、写简报或验证新方向。", "价值判断：有没有改变选择，减少总耗时或人工修改？"]),
    ])
    g.band("我们保留的四项资产", "来源池 = 去哪里找、各自补什么；处理规则 = 如何筛选、去重和互补；证据库 = 发现了什么、依据与条件；判断记录 = 为哪个任务做了什么选择、还缺什么。")

    g.section("02", "源有哪些：七个原始入口 + 三类按需补证入口", "有些网站承载作者或用户发布的内容，有些负责聚合热门线索。入口帮助发现，具体材料仍要读原文、判断独立性与适用条件。")
    g.source_table(source_guide)
    g.cards([
        ("产品官网 / 文档 / 更新日志", ["来自：目标产品的厂商或维护者。", "观察：当前功能、费用、限制和版本变化。", "处理：保存具体声明与版本，再用实测验证效果。具体地址随候选补充。"]),
        ("项目 Issues / 支持论坛", ["来自：用户报障、开发者回复和修复记录。", "观察：复现条件、受影响版本与处理状态。", "处理：核对是否同一问题，区分未确认报告与已复现、已修复。"]),
        ("HN / Show HN", ["来自：作者提交的新项目和社区讨论。", "观察：海外新工具、作者解释与用户尝试。", "处理：作者自述和独立反馈分开，沿链接到项目与文档。", "入口：news.ycombinator.com/show"]),
    ], body_size=19)
    g.band("针对 AI 与效率工具，怎样搭配", "找候选：小众软件，缺海外项目再加 Show HN / Buzzing；看用法：筛少数派有过程的文章；找限制：V2EX + 对应 Issues；核实当前能力：具体产品官方资料。热度研究再开 NewsNow、今日热榜或 SoPilot。NewsNow 与今日热榜用途重叠，可先选一个，另一项仅用于补查。")
    g.band("本轮核对边界", "NewsNow 官方项目可确认聚合定位，但本轮未读到动态榜单，示例平台沿用原帖；今日热榜本次返回 503，当前栏目待核实。SoPilot 的热度与浏览量预测准确性未验证。其余文章也需逐篇判断，不能对整个网站统一背书。", "#f2ead8")

    g.section("03", "怎样处理：从一个真实任务出发，完成六阶段闭环", "每一步都有动作、产物与通过条件。一次只补影响决定的缺口；关键证据足够支持当前行动时停止，不为凑数量继续收集。")
    g.cards([
        ("01 明确任务与统一入口", ["动作：在聊天中说清目标、现有做法、预算与使用条件。", "产物：任务说明 + 评价标准 + 期望输出。", "通过：能说明什么结果算有用。", "个人用途：防止收集偏离真实问题。"]),
        ("02 按缺口选择来源", ["动作：先查已有证据，再按缺少的证据类型选入口。", "产物：本轮来源及各自要补的问题。", "通过：关键问题有查询或测试路径。", "个人用途：兼顾稳定覆盖与自由探索。"]),
        ("03 读原文并追到出处", ["动作：提取具体声明或观察，记录作者、日期、版本和条件。", "产物：可追溯材料与原始链接。", "通过：读到正文；读不到的保留待查。", "个人用途：减少标题误读与过时信息。"]),
        ("04 去重与互补分析", ["动作：合并同源转述；独立实测、反例分别保留，再比较条件。", "产物：引用关系 + 分歧 + 仍缺的证据。", "通过：每组证据都有明确的信息增量。", "个人用途：避免转载数量制造假共识。"]),
        ("05 保存证据与有边界的判断", ["动作：证据单独保存；结论引用证据编号，说明限制与下一步。", "产物：证据记录 + 判断记录。", "通过：来源可追溯，观察与推断分开。", "个人用途：复查、比较、更新时不用重来。"]),
        ("06 用自己的任务测试并回写", ["动作：同一份真实材料比较候选与现有做法。", "产物：总耗时、错误、修改量、本人测试与选择。", "通过：结果达到事先约定的标准。", "个人用途：把他人的经验变成自己的依据。"]),
    ], cols=2)
    g.band("失败回路与互补原则", "任务不清 → 回到 01；原文不可读 → 回到 03 找最初出处；有冲突 → 先比较版本、输入与环境，仍无法解释再补独立证据或本人测试；关键缺口补不到 → 降低结论确定性并说明。多个网站引用同一个人，不算多份独立证据；同一工具的不同测试也不能一起去掉。")

    g.section("04", "留下什么：三类记录 + 一个去重互补示例", "来源池像地址簿；证据库保存具体材料；判断记录说明面向哪个任务如何取舍。三者以编号关联，并保留后续更新历史。")
    g.cards([
        ("来源记录 S-…", ["名称、地址、覆盖范围、补充什么、起步保留或备用。", "记录接入方式、最近可用情况；复盘是否有增量。"]),
        ("证据记录 E-…", ["工具 / 主题、具体声明或反馈、类型、出处与作者。", "日期 / 版本、条件、同源关系、阅读状态、验证状态。"]),
        ("判断记录 D-…", ["任务与约束、结论与取舍、引用的证据编号。", "适用范围、剩余缺口、最小验证步骤、更新日期。"]),
    ])
    g.band("虚构教学示例：6 篇材料 → 3 组证据 → 1 个待测试的选择", "任务：找处理中文 PDF 表格的工具。1 份官方发布 + 3 篇转述，合并为 1 组声明；1 份文字版 PDF 实测、1 条扫描件失败反馈各保留 1 组。互补分析：知道它声称能做、在哪种输入上测试过、在哪种输入下可能失败。下一步：先验证自己的扫描件，比较总耗时与修改量。工具 A 与这些材料均为示意，没有实际检索或测试。")
    g.band("证据更新规则", "同一发布稿：保留原始出处与转载关系；不同版本：追加记录并关联旧条目；观点冲突：保留双方及条件，不直接投票；无法证实：保留不确定性。已核对原文，只确认原文这样说；模型推断、热度和成功个例都不能自动变成普遍事实。", "#f2ead8")

    g.section("05", "日常怎么用：一个入口，按任务调动来源与证据", "你可以直接在聊天里提需求；来源池提供起点，提示词规定处理标准，具备联网或采集能力的执行工具负责真正获取材料。")
    g.cards([
        ("按需调研：有问题时查", ["例：找一个能减少中文 PDF 表格修改量的工具。", "流程：说明约束 → 查已有证据 → 按缺口补查 → 比较与试用。", "适合：工具选型、具体问题与工作流改进。"]),
        ("持续观察：只跟踪变化", ["例：跟踪正在用的工具更新、重要问题修复和少量新候选。", "流程：采集新增 → 去重 → 与历史比较 → 仅报告相关变化。", "适合：简报、版本跟踪；需另接定时执行。"]),
        ("使用来源的三种模式", ["优先参考：默认，从已有池起步，按缺口扩展。", "自由探索：适合找新方向，仍要求原文和证据类型。", "限定来源：用于固定范围比较，同时报告范围外盲区。"]),
    ], body_size=19)
    g.band("可以直接复用的日常提示词", "请调研【任务、条件和预算】。先查已有证据，优先参考【来源池】，按缺口扩展。读原文并记录日期、版本与条件；合并同源转载，保留独立实测和反例。比较每类来源补了什么、哪里冲突或仍缺证据；区分声明、观察和推断。输出建议更新的证据、推荐与取舍、引用出处和最小验证办法。证据足够支持本次行动时停止。")
    g.band("来源池持续维护", "带来独有候选、原创测试、长期反馈或关键反例 → 保留；连续只转述已有信息 → 降为备用；不可访问或内容失效 → 标注后替换。不要只按更新频率和热度排名；来源质量还要逐条材料检查。")

    g.section("06", "可以扩展到哪里：十二个方向，先以真实需求验证", "以下是基于这套方法可以探索的应用建议，并非已实现或已证明有效的业务。共同底座都是任务、来源、证据与更新规则。")
    g.cards([
        ("01 工具选型与替代", ["证据：能力、价格、实测、迁移限制。", "输出：候选对比与试用清单。", "验证：同任务下结果、总成本是否更好。"]),
        ("02 个人工作流优化", ["证据：具体步骤、耗时、失败与人工修改。", "输出：工具组合、步骤说明与复用模板。", "验证：端到端收益，计入检查与维护时间。"]),
        ("03 更新与问题跟踪", ["证据：更新日志、Issues、本人测试。", "输出：重要变化、受影响范围与待复测项。", "验证：信息及时且真正影响自己。"]),
        ("04 定题简报与知识问答", ["证据：按主题关联的原文与历史记录。", "输出：带引用的周报、问答与变化对比。", "验证：引用可追溯，减少重复调研。"]),
        ("05 趋势与技术雷达", ["证据：多个时期的新项目、讨论和实际采用。", "输出：新方向、信号来源与不确定性。", "验证：区分短期热度和持续使用。"]),
        ("06 内容选题与解释", ["证据：热帖、用户问题、原始资料与实测。", "输出：有依据的选题、教程、对比与案例。", "验证：读者实际问题得到解决。"]),
        ("07 用户需求与痛点研究", ["证据：独立用户反复描述的问题和替代做法。", "输出：需求假设、目标人群与访谈问题。", "验证：访谈确认频率、代价和解决意愿。"]),
        ("08 竞品与机会分析", ["证据：功能变化、定价、使用体验与未解问题。", "输出：竞品差异、空白与可验证的定位。", "验证：差异是否影响用户真实选择。"]),
        ("09 团队采购与采用", ["证据：团队场景、权限要求、成本与试点反馈。", "输出：采用建议、使用边界与试点计划。", "验证：小团队试点，记录收益与维护负担。"]),
        ("10 垂直资料库 / 独立站", ["证据：聚焦人群的工具记录、测试和更新。", "输出：可检索对比库、案例库或专题站。", "验证：先有需求和回访，再扩大内容与功能。"]),
        ("11 定制研究与订阅服务", ["证据：特定人群持续需要的可追溯研究。", "输出：研究报告、精选更新或订阅简报。", "验证：谁受益、谁付款、是否愿意持续购买。"]),
        ("12 自动研究助手 / API", ["证据：结构化记录、工具接入与可复核规则。", "输出：检索 → 去重 → 补查 → 报告的执行流。", "验证：稳定性、成本、引用与错误率。"]),
    ], body_size=19)
    g.band("如果要变成产品或业务，继续补这条路径", "目标用户与真实问题 → 访谈 / 竞品核对 → 找到渠道并给出一个价值样例 → 确定受益者与付款者 → 选择形态（报告、简报、资料库、独立站或助手）→ 最小人工交付 → 检验回访与付费 → 再补搜索、订阅、域名与部署 → 持续更新。来源聚合只是输入，业务价值仍要由用户验证。")

    g.section("07", "怎样扩展系统：先跑通价值，再加采集、存储与自动化", "提示词是执行要求；模型是分析能力；采集工具、数据库、定时与通知是运行基础设施。仅有这张网页不会自动完成整个流程。")
    g.cards([
        ("阶段 A：轻量人工执行", ["聊天 + 来源清单 + 普通表格或 JSON。", "人提出任务，模型按需读资料，人做实际测试。", "升级条件：真实任务有收益，而且反复发生。"]),
        ("阶段 B：辅助采集与整理", ["对固定高价值入口接入 RSS / 官方 API / 网页读取，按站点可用方式选择。", "保存 URL、时间、原始出处与处理状态；先去明显重复，再做同源判断。", "升级条件：人工采集已成为稳定瓶颈。"]),
        ("阶段 C：持续执行与应用", ["数据库 + 定时流程 + 模型分析 + 人工复核 + 通知 / 问答 / 网页。", "新信息与历史比对，失败重试，关键变化提醒，判断引用证据。", "升级条件：成本与维护负担可接受。"]),
    ], body_size=19)
    g.band("扩展轴：不只增加更多网站", "来源：从 AI 工具扩展到具体行业与场景；数据：从链接摘要扩展到版本、测试、问题与引用关系；处理：从去重扩展到变化对比与缺口补查；交付：从聊天扩展到简报、问答、看板与垂直站；协作：从本人记录扩展到团队审核与共享。每次扩展都要检查是否增加有用证据。")
    g.band("候选工具与运行要求", "Inoreader / n8n / TrendRadar 是前述调研中的候选工具，本项目尚未部署或连续实跑。实际选型需核对站点接入、去重粒度、历史存储与分析能力。接入时还要处理来源可用性、凭据与访问权限、内容授权、失败状态、人工复核、成本和通知噪声；全文保存与分享需按材料使用条件处理。")

    g.section("08", "怎样落地与判断有用：两周试跑，留下可核对的结果", "先选一个自己会做的真实任务。衡量对行动的帮助，不用收集数量、站点数量或自动化程度代表价值。")
    g.cards([
        ("今天：建最小闭环", ["写任务、现有方法与通过标准。", "只选相关入口，建来源 / 证据 / 判断记录。", "开始一次按需调研，待查项明确保留。"]),
        ("第一周：少量收集与比较", ["每周两次，每次最多新增五条有效证据。", "合并转载，保留实测与反例。", "选一个候选，列出最小验证办法。"]),
        ("第二周：亲测与复盘", ["用同一份材料比较候选和现有方法。", "记录错误、总耗时、修改量与成本。", "更新选择与来源取舍，再决定是否自动化。"]),
    ])
    g.band("复盘的六个问题", "有没有发现新候选？关键缺口有没有补齐？同源转述是否清楚合并？有没有改变一次选择？实际总耗时 / 错误 / 修改成本是否改善？下次能否复用且知道何时需要更新？若始终没有帮助，先缩小目标、调整来源或停止无效采集。")
    g.band("当前已完成 / 尚未完成", "已完成：共同理解、七个来源说明、来源取舍、去重互补方法、静态网页与教学示例、提示词生成、完整图与空白模板。尚未完成：持续自动采集、外部模型接入、生产证据库、真实工具对比与长期收益验证。图中的业务方向与系统演进均为后续建议。", "#e1eadb")
    g.text(MARGIN, g.y + 12, "讨论起点：https://x.com/shenxiankk/status/2107493081146691700", 17, MUTED)
    g.text(MARGIN, g.y + 43, "可点击来源、详细示例与模板见研究网页；本图由项目源码生成，可下载 SVG / PNG、按章节放大阅读。", 17, MUTED)
    g.y += 62
    g.finish()


if __name__ == "__main__":
    build_guide()
