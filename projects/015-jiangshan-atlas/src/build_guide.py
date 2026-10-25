"""Build the editable, self-contained research guide. SPDX-License-Identifier: GPL-3.0-only"""
from html import escape
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
parts = []


def text(x, y, label, size=20, color="#263e35", weight="400"):
    parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(label)}</text>')


def lines(x, y, labels, size=19, color="#65705f", step=31):
    for index, label in enumerate(labels):
        text(x, y + index * step, label, size, color)


def box(x, y, width, height, label, rows, tag=None):
    parts.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" fill="#fffdf6" stroke="#cdd3c2"/>')
    if tag:
        text(x+25, y+38, tag, 14, "#a64735", "600")
    text(x+25, y+76, label, 27, weight="600")
    lines(x+25, y+117, rows)


def section(y, number, title):
    text(48, y, number, 17, "#a64735", "600")
    text(101, y+2, title, 29, weight="600")


def main():
    parts.extend(['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1900" viewBox="0 0 1600 1900" role="img" aria-labelledby="title desc">',
                  '<title id="title">江山时序：原作能力、理解与实践完整引导图</title>',
                  '<desc id="desc">从历史地理问题出发，展示原库六类能力、数据驱动原理、个人参考价值、六步专题实践，以及当前验收范围和待探索方向。</desc>',
                  '<rect width="1600" height="1900" fill="#f4f2e8"/>',
                  '<g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif">'])
    text(48, 53, "015 / RESEARCH → EXPLORE → BUILD", 16, "#74806b")
    text(48, 120, "江山时序 · 让历史拥有时间与坐标", 49, weight="600")
    text(48, 163, "来源：DeanChensj/jiangshan-map · 版本 53059f1c7fed · 2026-10-24 · 本阶段：原作能力展示", 19, "#65705f")
    section(221, "01", "先理解它解决什么，再决定怎样使用")
    box(48, 247, 485, 238, "从阅读中的问题出发", ["古书里的长安、黄州，在今天哪里？", "为什么在这里迁都、出关或交战？", "一个人的一生，跨过了哪些山河？", "用途：为文字补上时间和空间。"], "问题 / 阅读、学习与历史探索")
    box(557, 247, 485, 238, "用年份连接多层历史数据", ["年份 → 历史阶段 → 疆域与政区快照", "地名 → 位置 → 历代沿革与当地史事", "人物 → 生平事件 → 跨年地图路线", "原理：整理的数据＋浏览器交互渲染。"], "机制 / 原生 JavaScript + SVG")
    box(1066, 247, 485, 238, "给个人创作的启发", ["一首诗、一座城、一个人都能做专题。", "复用定位与展示能力，集中打磨叙事。", "先让一个具体例子有用，再扩展内容。", "判断：有人能借地图回答原来的问题。"], "理解 / 属于我们的研究判断")
    section(540, "02", "原库的六类能力：直接在展示页体验")
    cards = [
        ("01 / 天下分合", "疆域演变", ["动作：推进前 230 → 前 221 年。", "产物：秦灭六国的阶段版图。", "观察：同年多政权、边界变化。"]),
        ("02 / 一城千年", "古城沿革", ["动作：打开 741 年的长安。", "产物：古今归属、名称与当地史事。", "观察：地点固定，名称与政区变化。"]),
        ("03 / 随人而行", "人物行迹", ["动作：逐站跟随苏轼的生平。", "产物：生平事件与跨年行迹地图。", "观察：年份、年号与地图同步推进。"]),
        ("04 / 诗中有路", "诗词路线", ["动作：展开杜甫诗中的归乡路。", "产物：同年多站、编号与空间连线。", "边界：诗意路线不等于实走证据。"]),
        ("05 / 古今对照", "政区与地理图层", ["动作：叠加现代省界、切换图层。", "产物：山川、州府、关隘与交通网。", "观察：历史政区与今天怎样对应。"]),
        ("06 / 主动回忆", "古地名寻址", ["动作：读线索，在地图上落针。", "产物：位置误差、十题挑战成绩。", "用途：检验对历史地理的空间印象。"]),
    ]
    for i, (tag, title, rows) in enumerate(cards):
        box(48 + (i % 3) * 509, 566 + (i // 3) * 227, 485, 205, title, rows, tag)
    section(1050, "03", "从读懂原作，到自己的专题作品：按证据推进")
    steps = [
        ("01 / 选问题", "给具体的人解决具体问题", ["动作：选一个读者与阅读困惑。", "产物：一句问题＋一段来源文本。", "通过：知道谁会用、要弄懂什么。", "用途：控制范围，避免堆积功能。"]),
        ("02 / 核事实", "把文本变成时间与地点", ["动作：核对年份、古名今名与出处。", "产物：可追溯的年份／地名清单。", "通过：同名地与跨年关系已澄清。", "用途：避免漂亮地图放错地点。"]),
        ("03 / 跑样例", "先用原库回答这个问题", ["动作：用 year＋place 展开地图。", "产物：单点、多站或跨年路线。", "通过：位置能解析，路线对应文本。", "失败：回到第二步查年份和别名。"]),
        ("04 / 做专题", "围绕一个主题组织体验", ["动作：整理叙事、证据和体验入口。", "产物：一页可操作的诗／城／人专题。", "通过：读者能跟随内容完成探索。", "用途：复用地图，专注内容价值。"]),
        ("05 / 上线前", "把运行与来源都交代清楚", ["动作：校验许可、资源、手机与路径。", "产物：静态站点与固定版本记录。", "通过：真实地图可用，来源能追溯。", "用途：降低维护成本，方便复用。"]),
        ("06 / 看效果", "用真实阅读任务验收", ["动作：让读者回答最初的问题。", "产物：错误、反馈与复用记录。", "通过：理解更清楚，愿意再次使用。", "失败：回到选题或内容组织调整。"]),
    ]
    for i, (tag, title, rows) in enumerate(steps):
        box(48 + (i % 3) * 509, 1077 + (i // 3) * 259, 485, 237, title, rows, tag)
    section(1648, "04", "把当前交付与后续设想分开")
    parts.append('<rect x="48" y="1674" width="1503" height="156" fill="#e6ebdc"/>')
    text(73, 1710, "本阶段交付", 22, weight="600")
    lines(73, 1743, ["原作本地运行、六场景导航、单点与跨年路线输入、版本校验与引导图。", "实际检查结果与截图单独记录在 notes/verification.md，界面可亲手复核。", "实现原理、五阶段规划与六组可复制指令，已整理到网页手册。"], 18, step=29)
    text(883, 1710, "候选方向 / 尚未实施", 22, weight="600")
    lines(883, 1743, ["专题教学、城市史册、阅读助手与独立内容站。", "商业需求、收费与学习效果还需要真实验证。"], 18, step=29)
    text(48, 1870, "边界：历史地图按预设阶段切换；古代疆界为近似表达。GPL-3.0 原作代码、历史资料与新增导航均保留来源。", 18, "#65705f")
    parts.extend(['</g>', '</svg>'])
    svg = "\n".join(parts) + "\n"
    for target in (PROJECT / "assets" / "jiangshan-guide.svg", PROJECT / "web" / "assets" / "jiangshan-guide.svg"):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(svg, encoding="utf-8")
    print("Built self-contained 1600 × 1900 research guide")


if __name__ == "__main__":
    main()
