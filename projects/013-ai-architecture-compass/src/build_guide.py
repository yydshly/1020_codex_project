"""Generate an original, editable SVG guide from the shared research catalog."""
from pathlib import Path
from html import escape
import json
import unicodedata

PROJECT = Path(__file__).resolve().parents[1]
WIDTH, PAD, GAP = 1800, 72, 24
INNER = WIDTH - PAD * 2
INK, MUTED, GREEN = "#21352f", "#5d6c65", "#265c49"
PAPER, WHITE, LINE, SOFT = "#f5f3ed", "#fffefa", "#d0d9c8", "#eaf0e3"
AMBER, BLUE = "#805c28", "#335c74"

SECTION_META = [
    ("understanding", "共同理解", "先抓住目标、模型、代码、证据与调整的主线。"),
    ("architectures", "12 种架构", "按六类关注点找到方法，再阅读采用条件与验证方式。"),
    ("composition", "选择与组合", "从真实项目压力判断最小组合及其演进条件。"),
    ("workflow", "实现流程", "将每次实现连到动作、产物、通过条件与返回路径。"),
    ("constraints", "持续约束", "把架构意图落到规则归属、自动检查和真实证据。"),
    ("example", "改动示例", "用 AI 润色场景检查职责、版本冲突与失败处理。"),
    ("value", "参考价值", "确认你掌握的取舍，以及目标项目仍需验证的内容。"),
]

CATEGORY_META = [
    ("业务建模", "把业务概念与规则放在哪里？", "先识别概念、规则与一致性范围。"),
    ("代码组织", "一次需求的代码如何组织？", "按职责或用例组织修改，观察变更是否容易定位。"),
    ("依赖控制", "哪些细节可以影响核心？", "隔离外部实现，选择适合当前项目的表达方式。"),
    ("部署与边界", "模块如何协作和独立演进？", "先明确所有权，再判断是否需要独立部署。"),
    ("协作与扩展", "能力如何接入，任务如何协作？", "说明扩展契约与消息交付的责任。"),
    ("数据与状态", "读写和历史如何表达？", "由查询压力与业务历史需求决定采用范围。"),
]


def build(data):
    parts, sections, methods = [], [], []

    def rect(x, y, w, h, fill=WHITE, radius=8):
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{LINE}"/>')

    def text(x, y, value, size=22, fill=INK, weight=400):
        parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}">{escape(str(value))}</text>')

    def wrap(value, width, size):
        lines, line, used = [], "", 0
        for char in value:
            if char == "\n":
                lines.append(line)
                line, used = "", 0
                continue
            char_width = size * (1 if unicodedata.east_asian_width(char) in "WF" else .58)
            if used + char_width > width and line:
                lines.append(line)
                line, used = "", 0
            line += char
            used += char_width
        if line:
            lines.append(line)
        return lines

    def paragraph(x, y, value, width, size=21, fill=MUTED, weight=400, leading=None):
        for line in wrap(value, width, size):
            text(x, y, line, size, fill, weight)
            y += leading or round(size * 1.55)
        return y

    def heading(y, label, title, subtitle):
        section_id, short, summary = SECTION_META[len(sections)]
        sections.append({"id": section_id, "short": short, "title": title,
                         "summary": summary, "y": 0 if not sections else int(y - 26)})
        parts.append(f'<path id="section-{section_id}" d="M {PAD} {y - 25} H {WIDTH - PAD}" stroke="{GREEN}" stroke-width="2"/>')
        text(PAD, y + 4, label, 19, GREEN, 650)
        text(PAD, y + 52, title, 38, INK, 650)
        return paragraph(PAD, y + 96, subtitle, INNER, 22) + 20

    def labeled_paragraph(x, y, value, width, size=20, leading=31):
        """Emphasize a field label while preserving the compact paragraph rhythm."""
        for index, line in enumerate(wrap(value, width, size)):
            if index == 0 and "：" in line:
                label, body = line.split("：", 1)
                parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{INK}"><tspan font-weight="650" fill="{GREEN}">{escape(label)}：</tspan><tspan>{escape(body)}</tspan></text>')
            else:
                text(x, y, line, size, INK)
            y += leading
        return y

    def cards(y, items, columns=2):
        width = (INNER - GAP * (columns - 1)) / columns
        for offset in range(0, len(items), columns):
            row = items[offset:offset + columns]
            heights = []
            for item in row:
                height = 108 + len(wrap(item["title"], width - 50, 27)) * 41
                for body in item["body"]:
                    height += len(wrap(body, width - 50, 20)) * 31 + 14
                heights.append(height)
            height = max(heights)
            for index, item in enumerate(row):
                x = PAD + index * (width + GAP)
                rect(x, y, width, height, item.get("fill", WHITE))
                text(x + 25, y + 34, item["label"], 17, GREEN, 650)
                cursor = paragraph(x + 25, y + 78, item["title"], width - 50, 27, INK, 650, 41) + 13
                for body in item["body"]:
                    cursor = labeled_paragraph(x + 25, cursor, body, width - 50) + 14
                if item.get("source"):
                    parts.append(f'<a href="{escape(item["source"], quote=True)}" target="_blank">')
                    text(x + 25, y + height - 24, "原始定义与说明 ↗", 17, GREEN)
                    parts.append("</a>")
            y += height + GAP
        return y

    def ribbon(y, title, body):
        height = 100 + len(wrap(body, INNER - 52, 22)) * 34
        rect(PAD, y, INNER, height, SOFT)
        text(PAD + 26, y + 40, title, 25, GREEN, 650)
        paragraph(PAD + 26, y + 82, body, INNER - 52, 22, leading=34)
        return y + height + 34

    def mainline(y):
        flow = [
            ("01 / 定义", "需求是目标", "用户完成什么？\n什么结果才算成功？"),
            ("02 / 表达", "模型与边界", "规则归谁维护？\n哪些模块需要协作？"),
            ("03 / 实现", "代码是基石", "让概念和依赖\n成为可修改的结构。"),
            ("04 / 检验", "用证据把控", "通过真实场景\n检查行为与约束。"),
            ("05 / 调整", "持续修正", "将新知识反馈到\n需求、模型与实现。"),
        ]
        gap, card_height = 32, 177
        width = (INNER - gap * 4) / 5
        for index, (label, title, body) in enumerate(flow):
            x = PAD + index * (width + gap)
            rect(x, y, width, card_height, GREEN if index == 2 else SOFT)
            foreground = WHITE if index == 2 else INK
            text(x + 20, y + 31, label, 17, "#dce8a8" if index == 2 else GREEN, 650)
            text(x + 20, y + 75, title, 27, foreground, 650)
            paragraph(x + 20, y + 116, body, width - 40, 20, foreground, leading=29)
            if index < 4:
                text(x + width + 3, y + 92, "→", 28, GREEN, 650)
        text(PAD, y + card_height + 35, "阅读顺序：先抓主线 → 按关注点找方法 → 明确采用条件 → 把规则连到证据。", 21, GREEN, 600)
        return y + card_height + 62

    def method_card(y, item, index):
        """A method has one scan line and three independently readable columns."""
        method_start = int(y)
        x, width = PAD, INNER
        inset, column_gap = 26, 22
        column_width = (width - inset * 2 - column_gap * 2) / 3
        content_width = column_width - 36
        columns = [
            ("理解", "它约束什么", GREEN, SOFT, [
                ("原理", item["principle"]), ("适用场景", item["scene"]),
                ("意义", item["value"]),
            ]),
            ("采用", "如何开始与取舍", AMBER, "#f4efdf", [
                ("实施方向", item["direction"]), ("最小动作", item["firstStep"]),
                ("代价", item["cost"]), ("延后信号", item["notFor"]),
            ]),
            ("约束与验证", "实现后如何判断", BLUE, "#eaf0f2", [
                ("约束示例", item["rule"]), ("证据", item["evidence"]),
                ("常见误用", item["pitfall"]), ("有效信号", item["successSignal"]),
            ]),
        ]
        question_lines = len(wrap(item["question"], width - inset * 2, 23))
        summary_lines = len(wrap(item["summary"], width - inset * 2, 20))
        header_height = 133 + question_lines * 34 + summary_lines * 31 + 18
        column_heights = [104 + sum(26 + len(wrap(body, content_width, 20)) * 31 + 18
                                   for _, body in fields)
                          for _, _, _, _, fields in columns]
        column_height = max(column_heights)
        combination = "组合提示：" + item["combine"]
        combination_height = len(wrap(combination, width - inset * 2, 20)) * 31
        height = header_height + column_height + combination_height + 102
        parts.append(f'<g id="method-{escape(item["id"], quote=True)}">')
        rect(x, y, width, height)
        text(x + inset, y + 33, f'{index:02d} / {item["kind"]}', 17, GREEN, 650)
        text(x + inset, y + 78, item["name"], 31, INK, 650)
        text(x + inset, y + 109, item["en"], 19, MUTED)
        paragraph(x + inset, y + 145, item["question"], width - inset * 2, 23, INK, 550, 34)
        paragraph(x + inset, y + 155 + question_lines * 34, item["summary"], width - inset * 2, 20, MUTED, leading=31)
        for number, (label, purpose, color, background, fields) in enumerate(columns):
            column_x = x + inset + number * (column_width + column_gap)
            column_y = y + header_height
            rect(column_x, column_y, column_width, column_height, background, 6)
            text(column_x + 18, column_y + 35, label, 23, color, 650)
            text(column_x + 18, column_y + 65, purpose, 18, MUTED)
            cursor = column_y + 103
            for label, body in fields:
                text(column_x + 18, cursor, label, 17, color, 650)
                cursor = paragraph(column_x + 18, cursor + 27, body, content_width, 20, INK, leading=31) + 17
        cursor = y + header_height + column_height + 39
        cursor = labeled_paragraph(x + inset, cursor, combination, width - inset * 2)
        parts.append(f'<a href="{escape(item["source"], quote=True)}" target="_blank">')
        text(x + inset, y + height - 25, "原始定义与说明 ↗", 18, GREEN, 600)
        parts.append("</a>")
        if item.get("source2"):
            parts.append(f'<a href="{escape(item["source2"], quote=True)}" target="_blank">')
            text(x + inset + 220, y + height - 25, "补充原始参考 ↗", 18, GREEN, 600)
            parts.append("</a>")
        parts.append("</g>")
        methods.append({"id": item["id"], "name": item["name"], "category": item["category"],
                        "y": method_start, "end": int(y + height), "x": PAD, "width": INNER})
        return y + height + GAP

    rect(0, 0, WIDTH, 350, GREEN, 0)
    text(PAD, 64, "013 / AI DEVELOPMENT ARCHITECTURE", 20, "#dce8a8", 600)
    text(PAD, 154, "需求是目标，代码是基石。", 64, "#fffefa", 650)
    paragraph(PAD, 217, "我们的探索：在 AI 持续实现需求的过程中，把控概念、边界、依赖与规则，让代码能够长期承载产品。", INNER, 28, "#e3ebd8")
    text(PAD, 314, f'原创讨论整理 · {data["date"]} · 架构定义有来源，组合建议需在真实项目验证', 20, "#dce8a8")
    y = heading(418, "01 / 共同理解", "从目标到代码，再用证据检验", "需求定义想达到的结果；领域模型表达理解；架构约束组织实现；运行证据检验产品行为。")
    y = mainline(y)
    y = cards(y, [
        {"label":"目标", "title":"先说明用户要完成什么", "body":["动作：确定任务、第一版范围、关键失败条件。", "产物：可观察的验收场景与投入边界。", "用途：决定哪些能力值得做，哪里值得精心设计。"]},
        {"label":"基石", "title":"让长期概念进入代码结构", "body":["动作：明确业务规则、数据所有者、模块接口与依赖。", "产物：可以理解、修改和验证的实现。", "用途：今天的代码，也成为下一轮 AI 的上下文。"]},
        {"label":"把控", "title":"同时观察功能与结构", "body":["动作：每次新增功能都检验改动范围、重复规则与协作关系。", "判断：小改动持续扩散时，回到模型与边界。", "用途：让下一次修改仍然容易，识别需要加固的地方。"]},
        {"label":"证据", "title":"明确做到了什么", "body":["动作：连接业务场景、代码约束、工具检查与真实流程。", "判断：自动检查只能证明其覆盖的范围。", "用途：保留已验证、失败和未验证记录，避免将方案当成结果。"]}
    ])
    y = heading(y + 42, "02 / 架构方法图谱", "12 种方法，各自约束哪一种复杂性？", "按关注点比较：业务建模、代码组织、依赖控制、部署与边界、协作与扩展、数据与状态。它们处在不同层次，可以有理由地组合。")
    y = ribbon(y, "先定位问题，再横向读一张方法卡", "理解：看原理、场景与意义。采用：看起步动作、代价与延后信号。约束与验证：看代码规则、反例与有效证据。每种方法单独判断适用范围。")
    method_number = 0
    for category_index, (category, question, purpose) in enumerate(CATEGORY_META, 1):
        rect(PAD, y, INNER, 114, GREEN)
        text(PAD + 24, y + 37, f'{category_index:02d} / {category}', 20, "#dce8a8", 650)
        text(PAD + 24, y + 80, question, 29, WHITE, 650)
        text(PAD + 685, y + 79, purpose, 21, "#e3ebd8")
        y += 134
        for item in data["architectures"]:
            if item["category"] == category:
                method_number += 1
                y = method_card(y, item, method_number)
        y += 24
    y = ribbon(y, "理解关系，再决定采用范围", "六边形、整洁、洋葱共享隔离核心的思想；DDD 解决业务建模；模块化单体与微服务涉及整体和部署边界；事件驱动、CQRS、事件溯源可以分别采用。重要数据首先需要完整性与恢复，不会自动要求事件溯源。")
    y = heading(y + 42, "03 / 选择与组合", "从真实压力出发，为每种方法写下理由", "以下为教学候选方案，未在所述产品实施。整体从简单运行与部署开始，在问题明确的地方增加约束，并记录代价及重新评估条件。")
    y = cards(y, [{"label":item["label"], "title":item["title"], "body":["组合：" + " + ".join(item["methods"]), "理由：" + item["reason"], "边界：" + item["boundary"], "验证：" + item["verify"], "演进：" + item["later"]]} for item in data["recipes"]], 3)
    y = heading(y + 42, "04 / 每次实现的流程", "六个阶段，把想法连到可交付的代码", "先完成一条真实用例，再利用后续需求检验结构。普通局部任务简要定位；涉及重要数据、公共接口或跨模块变化时，充分说明影响。")
    y = cards(y, [{"label":f'{index:02d} / 执行阶段', "title":item["name"], "body":["动作：" + item["action"], "产物：" + item["output"], "通过条件：" + item["pass"], "证据：" + item["evidence"], "个人用途：" + item["value"], "返回路径：" + item["back"]]} for index, item in enumerate(data["stages"], 1)], 3)
    y = heading(y + 42, "05 / 可执行的约束", "从架构意图，到代码与检查", "架构说明保存当前结构，ADR 保存重要取舍，AGENTS.md 规定 AI 的工作方式，包边界与检查落实可执行的约束。它们分工明确，内容跟随实现更新。")
    y = cards(y, [{"label":"约束 / 验证", "title":item["intent"], "body":["规则：" + item["rule"], "检查：" + item["check"], "边界：" + item["limit"]]} for item in data["guards"]], 2)
    y = cards(y + 22, [
        {"label":"规则追溯", "title":"从需求连到规则和证据", "body":["动作：规则 ID → 不变量 → 所有者及入口 → 反例场景 → 验证记录。", "判断：多个入口操作同一数据时，能否维护同一套规则？", "示例：旧建议不能覆盖新正文，由内容模块的采纳入口维护。"]},
        {"label":"六项任务草案", "title":"把下一次实现交代清楚", "body":["填写：目标验收、业务规则、责任边界、失败场景、计划验证、重审条件。", "产物：网页生成可复制或下载的 Markdown 任务卡。", "判断：填写完整仅说明信息覆盖，实际执行证据仍需另外记录。"]},
        {"label":"证据的范围", "title":"规则、检查和结果分开记录", "body":["写下约束：表明设计意图；接入检查：确认检查能发现违规。", "实际验证：记录代码版本、场景、命令或操作、真实结果与覆盖范围。", "返回：未执行或未通过的内容明确记录，不以放宽规则制造通过。"]}
    ], 3)
    y = ribbon(y, "结构变化时，同步演进", "出现重复规则、修改扩散、循环依赖或外部细节渗入时，重新审视模型。调整时记录理由、影响、替代关系和迁移方式，同步代码与检查；不为通过检查直接删除断言或放宽规则。")
    y = heading(y + 42, "06 / 一次改动示例", "给笔记增加 AI 润色：从规则检查底座", "假设正文已能可靠保存，生成建议由用户决定是否采纳。下列行为是教学预期，网页没有运行目标应用或实际测试。")
    y = cards(y, [
        {"label":"建模与职责", "title":"建议记录它依据的正文版本", "body":["AI 辅助用例负责生成建议；内容模块拥有正文与版本规则。", "用户采纳时由统一入口原子地维护版本匹配与写入；旧建议需要重新核对。", "模型 SDK 留在适配器，外部数据转换为应用可用结果。"]},
        {"label":"验证与失败", "title":"用关键失败场景检验设计", "body":["版本冲突：第 12 版建议无法直接覆盖第 13 版正文。", "并发采纳：两个请求持有同一旧版本，实际存储只能允许一个成功。", "模型失败：已保存正文保持完整，任务状态明确。", "真实存储：采纳后重开内容一致；索引失败允许重试。"]}
    ])
    y = heading(y + 42, "07 / 对我们的参考价值", "你掌握方向与取舍，AI 提供实现与证据", "选方向：识别当前的复杂性。控投入：每种抽象有理由。审实现：检查规则归属和依赖。可复用：让下一轮 AI 继承结构、决策与验证记录。")
    y = ribbon(y, "这份手册的边界", "已整理：12 种方法及采用/延后信号、架构对比、组合建议、执行流程、任务约束卡、教学案例与五份模板。还需在目标项目执行：适用性验证、工具检查接入、真实行为测试、CI 合入约束与运行观察。网页本身不调用模型、不扫描仓库；选择器只是透明规则映射。")
    text(PAD, y + 16, "来源：Eric Evans、Martin Fowler、Alistair Cockburn、Robert C. Martin、Jeffrey Palermo、Jimmy Bogard 等原始资料。", 19, MUTED)
    text(PAD, y + 54, "完整可点击来源与下载模板见研究网页 / 013-ai-architecture-compass / 整理日期 2026-10-23", 19, MUTED)
    height = int(y + 100)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height}" viewBox="0 0 {WIDTH} {height}" role="img" aria-labelledby="title desc"><title id="title">AI 开发架构完整引导图</title><desc id="desc">共同理解、12种架构的场景原理方向意义、组合、执行流程、约束与验证、教学示例、个人用途和证据边界。</desc><rect width="{WIDTH}" height="{height}" fill="{PAPER}"/><g font-family="Segoe UI, Microsoft YaHei, PingFang SC, sans-serif">' + "".join(parts) + "</g></svg>"
    for directory in (PROJECT / "assets", PROJECT / "web"):
        (directory / "architecture-guide.svg").write_text(svg, encoding="utf-8")
    for index, section in enumerate(sections):
        section["end"] = sections[index + 1]["y"] if index + 1 < len(sections) else height
        section["height"] = section["end"] - section["y"]
    layout = {"width": WIDTH, "height": height, "sections": sections, "methods": methods}
    (PROJECT / "assets/guide-layout.json").write_text(json.dumps(layout, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return layout


if __name__ == "__main__":
    result = build(json.loads((PROJECT / "src/catalog.json").read_text(encoding="utf-8")))
    print(f'Guide: {result["width"]} x {result["height"]}')
