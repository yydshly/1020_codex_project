"""Build the compact landscape architecture diagram; standard library only."""

from html import escape
from pathlib import Path
import xml.etree.ElementTree as ET

PROJECT = Path(__file__).resolve().parents[1]
W, H = 1920, 1080
INK, MUTED = "#14283f", "#54677d"
BLUE, PURPLE, TEAL, SLATE = "#2457d6", "#7551bf", "#14867d", "#526b83"
parts = []


def rect(x, y, w, h, fill="white", stroke="#dce3ed", radius=18):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>')


def text(x, y, value, size=28, color=INK, weight=400, anchor="start"):
    parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(value)}</text>')


def arrow(points, color=BLUE, dashed=False):
    path = "M " + " L ".join(f"{x} {y}" for x, y in points)
    dash = ' stroke-dasharray="10 8"' if dashed else ""
    marker = {BLUE: "blue", PURPLE: "purple", TEAL: "teal", SLATE: "slate"}[color]
    parts.append(f'<path d="{path}" stroke="{color}" stroke-width="5" fill="none" stroke-linejoin="round"{dash} marker-end="url(#{marker})"/>')


def card(x, w, role, title, lines, color, fill, footer):
    rect(x, 410, w, 300, fill, color)
    text(x + 25, 454, role, 24, color, 650)
    text(x + 25, 506, title, 34, INK, 700)
    for i, value in enumerate(lines):
        text(x + 25, 558 + i * 39, value, 26, MUTED)
    rect(x + 22, 653, w - 44, 38, "#ffffff", "#ffffff", 7)
    text(x + 36, 680, footer, 21, color, 600)


rect(0, 0, W, H, "#f7f9fc", "#f7f9fc", 0)
text(60, 57, "011 / JEV-ULTRAFAST · 核心架构", 22, BLUE, 650)
text(1860, 57, "四方分工 · 每轮执行一步", 22, MUTED, anchor="end")
text(60, 128, "程序负责循环，Jev 负责选择", 54, INK, 750)
text(60, 178, "程序从网页提取可操作选项；执行后再看新页面，直到目标完成并独立验收。", 29, MUTED)

# Task input and the optional writer remain separate from the action loop.
rect(60, 218, 810, 88, "#ffffff", "#dce3ed", 14)
text(84, 252, "你提供网址 + 目标", 27, INK, 650)
text(84, 286, "例如：查杭州酒店，指定日期，筛选免费取消", 25, MUTED)
arrow([(260, 306), (260, 410)])
text(277, 367, "启动任务", 23, BLUE)

rect(1000, 218, 400, 134, "#e8f5f1", TEAL, 14)
text(1025, 258, "文字模型 · 独立助手", 28, TEAL, 650)
text(1025, 298, "仅需填字时，生成字段内容", 25, MUTED)
text(1025, 332, "例如：为城市框生成“杭州”", 25, MUTED)

rect(1480, 218, 380, 134, "#ffffff", "#dce3ed", 14)
text(1505, 257, "先记住这四个角色", 26, INK, 650)
text(1505, 296, "程序组织与执行 · Jev 抉择", 23, MUTED)
text(1505, 330, "文字模型写内容 · 浏览器操作", 23, MUTED)

# Four steps, with the program deliberately appearing twice in the same color.
card(60, 400, "① 程序 / 这个库", "读网页，整理选项", [
    "从 DOM / ARIA 读取控件",
    "按规则列出能点、能填的操作",
    "附上目标、页面状态和历史",
], BLUE, "#edf2ff", "产物：当前可执行的候选操作")
card(540, 330, "② Jev / 决策模型", "选下一步", [
    "选择“做什么”",
    "同时选择目标元素",
    "如：填字 → 城市框",
], PURPLE, "#f2edfb", "返回：操作 + 对应目标")
card(1000, 400, "③ 程序 / 还是这个库", "检查，然后执行", [
    "核对页面与目标仍然有效",
    "检查可见、禁用与遮挡等状态",
    "通过后发送点击或输入指令",
], BLUE, "#edf2ff", "需要填字时，先取文字模型结果")
card(1480, 380, "④ 浏览器 / Chrome", "网页真正发生变化", [
    "实际点击、填字或选择",
    "触发导航、弹层或加载",
    "提供操作后的新页面状态",
], SLATE, "#eef2f6", "底层连接：Browser Harness")

arrow([(460, 568), (540, 568)])
arrow([(870, 568), (1000, 568)], PURPLE)
arrow([(1400, 568), (1480, 568)])

# Writer branch: action choice precedes content generation.
arrow([(1080, 410), (1080, 352)], TEAL)
text(940, 375, "需填字时", 22, TEAL)
text(940, 403, "程序调用", 22, TEAL)
arrow([(1320, 352), (1320, 410)], TEAL)
text(1336, 390, "字段文字", 23, TEAL)

# The full-width return arrow is the main visual emphasis.
arrow([(1670, 710), (1670, 812), (260, 812), (260, 710)])
rect(475, 777, 985, 70, "#f7f9fc", "#f7f9fc", 12)
text(968, 822, "新页面 + 执行记录 → 重新提取选项 → 再问 Jev", 29, BLUE, 650, "middle")
text(968, 873, "每轮都使用更新后的页面与历史；不是一次推理就做完整个任务。", 25, MUTED, anchor="middle")

rect(60, 915, 1800, 89, "#e7f3ef", "#d1e9df", 14)
text(88, 952, "完成出口", 24, TEAL, 650)
text(256, 952, "Jev 返回 DONE → 业务程序独立核验 → 确认实际结果满足目标", 30, INK, 650)
text(256, 986, "DONE 是模型的停止判断；是否真正成功，由业务规则验证。", 24, MUTED)

source = "https://github.com/browser-use/jev-ultrafast/tree/1231850a0bf1a0c0341fe408ef1668dbbfdfac46"
parts.append(f'<a href="{source}" target="_blank">')
text(60, 1049, "依据上游 v0.1.0 源码整理 · 2026-10-23 · 简化架构示意（非真实运行轨迹）", 21, MUTED)
parts.append("</a>")
text(1860, 1049, "详细原理、训练与速度证据见研究网页 →", 21, BLUE, anchor="end")

defs = "".join(
    f'<marker id="{name}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="{color}"/></marker>'
    for name, color in [("blue", BLUE), ("purple", PURPLE), ("teal", TEAL), ("slate", SLATE)]
)
svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title description">'
    '<title id="title">Jev Ultrafast：核心架构与执行循环</title>'
    '<desc id="description">程序提取网页候选，Jev选择操作和目标；需要填字时由独立文字模型生成内容，程序检查后通过浏览器执行。读取新页面并更新历史后再次循环；DONE后由业务独立验收。</desc>'
    f'<defs>{defs}</defs><g font-family="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, Segoe UI, sans-serif">'
    + "".join(parts) + "</g></svg>"
)
ET.fromstring(svg)
for target in [PROJECT / "assets/browser-agent-architecture.svg", PROJECT / "web/assets/browser-agent-architecture.svg"]:
    target.write_text(svg, encoding="utf-8")
print(f"Landscape architecture SVG: {W} x {H}; source and web copies synchronized")
