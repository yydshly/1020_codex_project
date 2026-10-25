"""Build a self-contained project guide with the real browser screenshot."""
# SPDX-License-Identifier: GPL-3.0-only
from base64 import b64encode
from html import escape
from pathlib import Path
import struct

PROJECT = Path(__file__).resolve().parents[1]
png = (PROJECT / "assets/acceptance-desktop.png").read_bytes()
assert png[:8] == b"\x89PNG\r\n\x1a\n", "Save the browser screenshot as a real PNG first"
image_width, image_height = struct.unpack(">II", png[16:24])
parts = ['''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2400" viewBox="0 0 1600 2400" role="img" aria-labelledby="title description">
<title id="title">东坡南行：从一条提示词到独立作品的完整实践图</title>
<desc id="description">真实运行截图、来源原理、复用与独立实现、五阶段动作及产物、资料与手机实测改进、验收边界和个人参考价值。</desc>
<defs><style>
text{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:#2a4035}
.serif{font-family:'SimSun','Noto Serif CJK SC',serif}
.muted{fill:#707b68}.red{fill:#a34e39}
</style></defs>
<rect width="1600" height="2400" fill="#f2eee3"/>
<rect width="1600" height="12" fill="#a34e39"/>
''']


def text(x, y, content, size=19, css=""):
    parts.append(f'<text x="{x}" y="{y}" font-size="{size}" class="{css}">{escape(content)}</text>')


def lines(x, y, content, size=19, line_height=31, css="muted"):
    for index, line in enumerate(content):
        text(x, y + index * line_height, line, size, css)


def card(x, y, width, height, label, heading, content):
    parts.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="4" fill="#fbf9f1" stroke="#ccd2bf"/>')
    text(x + 24, y + 35, label, 15, "red")
    text(x + 24, y + 76, heading, 25, "serif")
    lines(x + 24, y + 116, content)


text(48, 62, "016 / A BRIEF → AN INDEPENDENT WORK", 17, "red")
text(48, 126, "东坡南行 · 从一条提示词到独立作品", 44, "serif")
text(48, 172, "把黄州 1080、惠州 1094、儋州 1097，做成可以亲手走完的三站阅读主线。", 22, "muted")
text(48, 214, "事实与实测截至 2026-10-24  ·  本地独立运行 8016  ·  制作记录见 process.html", 16, "muted")
shot_height = 940 * image_height / image_width
parts.append(f'<rect x="48" y="248" width="940" height="{shot_height}" fill="#fff" stroke="#c4cbb7"/>')
parts.append(f'<image x="48" y="248" width="940" height="{shot_height}" href="data:image/png;base64,{b64encode(png).decode()}"/>')
text(48, 248 + shot_height + 30, "真实浏览器截图：自己的地图渲染、三站入口、叙事面板和来源说明。", 17, "muted")

card(1016, 248, 536, 260, "来源能力 / 已核对", "江山时序带来的基础", [
    "时间与地点，能组织成可探索的内容。",
    "原作将疆域快照、地形、水系与人物",
    "行迹作为数据，由网页代码绘制与联动。",
    "启发：先确定阅读主线，再选择图层。",
    "不把模型名称当成运行所需的核心。",
])
card(1016, 534, 536, 260, "复用边界 / 已实现", "保留数据，重新实现体验", [
    "复用固定版本的政权轮廓、水系、地形。",
    "仅提取一组北宋快照与三站参照信息。",
    "自写 SVG 投影、视图、界面与叙事状态。",
    "无 iframe；无原作应用控制器。",
    "运行只请求自己的静态资源。",
])
card(1016, 820, 536, 260, "内容判断 / 已核查", "三个地点，三层时间", [
    "黄州：1080 抵达，词选 1082《定风波》。",
    "惠州：1094 抵达，诗按惠州时期呈现。",
    "儋州：1097 抵达，渡海诗写于 1100。",
    "古儋州用中和一带约点，不照搬今城。",
    "连线表达地点关系，省略中间行程。",
])
card(1016, 1106, 536, 284, "自己的理解 / 可迁移", "AI 参与实现，代码负责运行", [
    "主题只是起点，还要给出人群、主线、",
    "范围、视觉方向、资料要求和交付标准。",
    "先跑通三站，再针对真实问题修改。",
    "本次网页无需连接 Claude 或其他模型。",
    "可迁移到人物生平、旅行叙事、城市史；",
    "更换内容时仍需核对资料和地理位置。",
])
text(48, 1490, "实际推进的五个阶段", 32, "serif")
text(530, 1490, "每一步都留动作、产物、通过条件和下一次可复用的判断。", 19, "muted")
stages = [
    (48, 1525, "01 / 收敛首版", "先写清谁要看、怎样玩", [
        "动作：限定读者与三站闭环。", "产物：一条完整的首版实施提示。",
        "通过：能从选站走到终站并返回。", "用途：避免主题扩成全部年谱。",
    ]),
    (558, 1525, "02 / 核对资料", "把内容与坐标先落地", [
        "动作：核年份、诗作时间与古治所。", "产物：story.js、来源与提取清单。",
        "通过：各站至少两条来源可追溯。", "用途：先识别事实问题，再做画面。",
    ]),
    (1068, 1525, "03 / 跑通交互", "用同一状态更新全页", [
        "动作：联动地图、年份、事件与诗。", "产物：SVG 地图和站点状态控制。",
        "通过：上一站、下一站、总览一致。", "用途：先验证可用主线，再扩功能。",
    ]),
    (48, 1820, "04 / 看实屏修改", "让具体问题推动下一轮", [
        "动作：在桌面与手机实际点选。", "产物：三站常显，选站后滚到正文。",
        "通过：手机无页面与站点栏横溢。", "用途：把“优化一下”改成明确修正。",
    ]),
    (558, 1820, "05 / 验收与留档", "交付能再次打开的作品", [
        "动作：走主流程、回退、刷新和来源。", "产物：独立网页、截图、校验脚本。",
        "通过：三站同源数据与资源校验通过。", "用途：留下可运行入口和复用模板。",
    ]),
    (1068, 1820, "个人参考价值 / 判断方法", "下一次该怎样下发指令", [
        "先给“人群 + 完整体验 + 首版范围”。", "再给“风格 + 资料 + 可验收交付”。",
        "每轮只改已观察到的关键问题。", "资料错回第 2 步；交互错回第 3 步。",
    ]),
]
for x, y, label, heading, content in stages:
    card(x, y, 484, 266, label, heading, content)
parts.append('<rect x="48" y="2130" width="1504" height="162" rx="4" fill="#e3e8d8"/>')
text(72, 2166, "证据与边界", 23, "serif")
lines(72, 2202, [
    "已验证：三站切换、地图与文字同步、终站按钮、回到总览、缩放、浏览器回退、直接链接、手机布局。",
    "实际修正：手机站点栏 630 → 341 px（匹配容器）；古儋州点位改为中和附近 [109.35, 19.74]。",
    "范围限制：三年属于同一上游疆域快照，边界不随选站改变；水系为自然参照，连线不作精确行程。",
], size=19, line_height=31)
text(48, 2331, "上游 DeanChensj/jiangshan-map @ 53059f1c7fed  ·  来源：故宫 / 大学学报 / 海南大学 / 古籍与古治所资料", 16, "muted")
text(48, 2364, "新增代码 GPL-3.0-only；地图素材保留上游条款。网页提供可点击来源、原图放大与下载；此图内嵌截图，无外部图片依赖。", 16, "muted")
parts.append("</svg>")
svg = "\n".join(parts) + "\n"
for target in [PROJECT / "assets/implementation-guide.svg", PROJECT / "web/assets/implementation-guide.svg"]:
    target.write_text(svg, encoding="utf-8", newline="\n")
    print(f"Wrote {target.relative_to(PROJECT)} ({target.stat().st_size:,} bytes)")
