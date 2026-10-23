"""Build an original standalone research atlas. Stdlib only; no network.

Reviewed source, vendor claims, proposals and teaching examples are labelled.
Only assets/browser-choice-guide.svg and its web copy are generated.
"""
from pathlib import Path
from html import escape
import re
import unicodedata
import xml.etree.ElementTree as ET

PROJECT = Path(__file__).resolve().parents[1]
W, PAD, GAP = 2000, 64, 24
INNER = W - PAD * 2
INK, MUTED, BLUE, TEAL = '#14283f', '#53657a', '#2457d6', '#16867d'
PAPER, BG, LINE, LIGHT = '#ffffff', '#f5f7fa', '#dce3ed', '#eaf0ff'
AMBER = '#a76616'
parts, text_bounds, panel_checks = [], [], []
CHIPS = {'源码事实': (BLUE, '#eaf0ff'), '官方声明': (TEAL, '#e6f4f1'),
         '我们的推断': ('#6954a1', '#f1edf8'), '教学示意': (AMBER, '#fff3df'),
         '作者记录·未复测': ('#53657a', '#eaf0f5')}


def rect(x, y, w, h, fill=PAPER, stroke=LINE, r=14):
    parts.append(f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="{r}" fill="{fill}" stroke="{stroke}"/>')


def text(x, y, value, size=24, color=INK, weight=400, anchor='start', rotate=None):
    value = str(value)
    transform = f' transform="rotate({rotate} {x:g} {y:g})"' if rotate else ''
    parts.append(f'<text x="{x:g}" y="{y:g}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}"{transform}>{escape(value)}</text>')
    text_bounds.append((x, y, value, size, anchor, rotate))


def measure(value, size):
    return sum(size * (1.0 if unicodedata.east_asian_width(c) in 'WF' else .57) for c in value)


def wrap(value, width, size=24):
    lines, line, used = [], '', 0
    for token in re.findall(r'[A-Za-z0-9_./≥≤%:+-]+|[^\x00-\x7F]|.', value, re.S):
        if token == '\n':
            lines.append(line)
            line, used = '', 0
            continue
        advance = measure(token, size)
        if used + advance > width and line:
            if token in '，。；：？！、）》】”’':
                lines.append(line + token)
                line, used = '', 0
                continue
            lines.append(line.rstrip())
            line, used = '', 0
        line += token
        used += advance
    if line:
        lines.append(line.rstrip())
    return lines


def para(x, y, value, width, size=24, color=MUTED, weight=400, leading=None):
    leading = leading or round(size * 1.45)
    for line in wrap(value, width, size):
        text(x, y, line, size, color, weight)
        y += leading
    return y


def line(x1, y1, x2, y2, color=LINE, width=2):
    parts.append(f'<path d="M {x1:g} {y1:g} L {x2:g} {y2:g}" fill="none" stroke="{color}" stroke-width="{width}"/>')


def route(points, color=BLUE, dashed=False, width=4):
    d = 'M ' + ' L '.join(f'{x:g} {y:g}' for x, y in points)
    dash = ' stroke-dasharray="9 7"' if dashed else ''
    marker = 'teal' if color == TEAL else ('amber' if color == AMBER else 'blue')
    parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"{dash} marker-end="url(#{marker})"/>')


def chip(x, y, label):
    color, fill = CHIPS[label]
    width = measure(label, 23) + 28
    rect(x, y - 25, width, 36, fill, fill, 5)
    text(x + 14, y, label, 23, color, 650)
    return width


def heading(y, number, title, subtitle, label='源码事实'):
    y += 20
    parts.append(f'<g id="section-{number}">')
    text(PAD, y + 35, number, 28, BLUE, 750)
    text(PAD + 70, y + 35, title, 39, INK, 750)
    if label:
        chip(W - PAD - measure(label, 23) - 28, y + 30, label)
    end = para(PAD + 70, y + 79, subtitle, INNER - 70, 25)
    parts.append('</g>')
    return end + 22


def ribbon(y, title, body, fill=LIGHT, color=BLUE):
    h = 85 + len(wrap(body, INNER - 52, 24)) * 35
    rect(PAD, y, INNER, h, fill, fill)
    text(PAD + 26, y + 37, title, 27, color, 700)
    para(PAD + 26, y + 78, body, INNER - 52, 24, INK, leading=35)
    return y + h + 24


def cards(y, entries, columns=3):
    w = (INNER - (columns - 1) * GAP) / columns
    for start in range(0, len(entries), columns):
        row = entries[start:start + columns]
        h = max(96 + len(wrap(title, w - 48, 28)) * 40 + len(wrap(body, w - 48, 24)) * 35 for label, title, body in row)
        for i, (label, title, body) in enumerate(row):
            x = PAD + i * (w + GAP)
            rect(x, y, w, h)
            text(x + 24, y + 34, label, 23, BLUE if label != '边界' else AMBER, 650)
            end = para(x + 24, y + 76, title, w - 48, 28, INK, 700, 40) + 10
            end = para(x + 24, end, body, w - 48, 24, leading=35)
            panel_checks.append((end - 35 + 8, y + h - 14, title))
        y += h + GAP
    return y


def table(y, headers, rows, widths):
    xs = [PAD]
    for w in widths:
        xs.append(xs[-1] + w)
    rect(PAD, y, INNER, 63, LIGHT, LIGHT, 10)
    for x, w, value in zip(xs, widths, headers):
        text(x + 22, y + 40, value, 27, BLUE, 700)
    y += 63
    for index, row in enumerate(rows):
        h = max(len(wrap(value, w - 44, 24)) for value, w in zip(row, widths)) * 35 + 30
        rect(PAD, y, INNER, h, PAPER if index % 2 == 0 else '#fafbfd', LINE, 0)
        for i, (x, w, value) in enumerate(zip(xs, widths, row)):
            if i:
                line(x, y, x, y + h)
            para(x + 22, y + 34, value, w - 44, 24, INK if i == 0 else MUTED, 600 if i == 0 else 400, 35)
        y += h
    return y + 24


def node(x, y, w, h, title, body, label='', fill=PAPER, color=BLUE):
    rect(x, y, w, h, fill, color, 14)
    yy = y + 38
    if label:
        text(x + 22, yy, label, 23, color, 700)
        yy += 43
    yy = para(x + 22, yy, title, w - 44, 29, INK, 750, 39) + 9
    yy = para(x + 22, yy, body, w - 44, 24, INK, leading=35)
    panel_checks.append((yy - 35 + 8, y + h - 10, title))


rect(0, 0, W, 420, PAPER, PAPER, 0)
text(PAD, 66, '011 / JEV-ULTRAFAST 研究总图', 25, BLUE, 750)
text(W - PAD, 66, '2026-10-23 · v0.1.0 · MIT', 24, MUTED, 600, 'end')
text(PAD, 142, '网页里的“选择”，怎样变成完整任务？', 58, INK, 750)
para(PAD, 211, '程序从当前网页抽取控件和可选操作；Jev 结合目标与上下文选操作与目标；程序执行、读取新页面并反复循环；模型 DONE 后，业务独立验收。', INNER, 34, INK, 600, 49)
text(PAD, 355, '核心：持续运行的浏览器执行闭环。一次模型请求，只负责其中一轮判断。', 30, BLUE, 700)
text(PAD, 399, '这张图汇总我们的探究、源码分工、模型差异、酒店教学、性能证据与个人复用路径。', 25, MUTED)
y, x = 458, PAD
for label in CHIPS:
    x += chip(x, y, label) + 30
text(x + 3, y, '不同证据不混用；性能数字均未在本项目复测。', 23, MUTED)
nav = [('01', '架构闭环'), ('02', '选项来源'), ('03', '探究纠偏'), ('04', '模型与训练'), ('05', '酒店实例'), ('06', '三种方案'), ('07', '性能证据'), ('08', '场景与复用')]
rect(PAD, 496, INNER, 64, '#edf2f8', '#edf2f8', 8)
for i, (number, label) in enumerate(nav):
    parts.append(f'<a href="#section-{number}">')
    text(PAD + 20 + i * (INNER - 40) / 8, 537, number + ' ' + label, 23, BLUE, 650)
    parts.append('</a>')
y = 588

# Main architecture with actual arrows and three distinct decision branches.
y = heading(y, '01', '主架构：谁观察、谁选择、谁执行、谁验收？', '粗实线串起执行闭环；虚线表示失效或停止分支。每轮只执行一项操作；同轮多问题可并行，跨轮操作仍按页面变化依次进行。')
base = y
rect(PAD - 18, base - 18, INNER + 36, 975, '#eef2f7', '#eef2f7', 18)
text(86, base + 30, '业务入口', 25, MUTED, 700)
text(524, base + 30, 'jev-ultrafast / 通用应用层', 25, BLUE, 700)
text(1244, base + 30, '外部模型与业务验收', 25, TEAL, 700)
b = base + 56
node(64, b, 350, 210, '网址＋完整目标', '提供城市、日期等约束；事先定义成功条件。', '你提供', color=TEAL)
node(500, b, 580, 235, 'DOM 快照 → 动作空间', '识别 HTML/ARIA 控件，读取文字与状态；对实际节点和可用操作编号。', '库观察与组织')
node(1220, b, 716, 280, 'Jev：选操作，也选对应目标', '共享上下文：目标＋当前页面＋元素状态＋最近动作。问题：operation、click_target、type_text_target、select_target。', '外部决策服务', fill=LIGHT)
node(1220, b + 340, 350, 190, '文字 helper', '仅 TYPE_TEXT 时生成要输入的字段值。', '按需分支', fill='#e6f4f1', color=TEAL)
node(1636, b + 400, 300, 285, '业务独立验收', 'DONE 只是模型判断；核对目标条件和结果证据，再接受成功。', '业务负责', color=TEAL)
node(500, b + 480, 580, 235, '验证目标 → 浏览器执行', '先查 freshness、可见/禁用/只读与遮挡，再由 Browser Harness＋Chrome 点击、填字、选择或滚动。', '库检查与执行')
node(64, b + 480, 350, 235, '新页面＋执行记录', '重新读取页面；最近最多 10 条已执行动作随下一轮请求回传。', '循环状态')
node(64, b + 790, INNER, 125, '停止、诊断与业务处置', 'BLOCKED／错误会停止；默认最多 60 个动作、120 次决策；连续 3 次非 WAIT 操作无变化会 blocked。DONE 后业务验收不通过，应另行处理，原版不会自动重开任务。', fill='#fff8eb', color=AMBER)
route([(414, b + 113), (500, b + 113)])
route([(1080, b + 113), (1220, b + 113)])
text(1099, b + 88, '请求', 23, BLUE, 650)
route([(1220, b + 205), (1155, b + 205), (1155, b + 600), (1080, b + 600)])
text(1186, b + 578, '点击 / 选择 / 滚动 / WAIT', 23, BLUE, 600, 'middle', -90)
route([(1395, b + 280), (1395, b + 340)], TEAL)
text(1410, b + 319, 'TYPE_TEXT', 23, TEAL, 650)
route([(1220, b + 436), (1120, b + 436), (1120, b + 526), (1080, b + 526)], TEAL)
route([(1786, b + 280), (1786, b + 400)], TEAL)
text(1800, b + 350, 'DONE', 24, TEAL, 700)
route([(500, b + 618), (414, b + 618)])
text(430, b + 593, '执行', 23, BLUE, 650)
route([(239, b + 480), (239, b + 382), (790, b + 382), (790, b + 235)])
text(515, b + 366, '每次动作后重新观察', 24, BLUE, 650)
route([(500, b + 548), (457, b + 548), (457, b + 115), (500, b + 115)], BLUE, True, 3)
text(441, b + 333, '失效 / 遮挡 → 重新读页面', 23, BLUE, 600, 'middle', -90)
route([(1936, b + 152), (1962, b + 152), (1962, b + 852), (1936, b + 852)], AMBER, True, 3)
route([(1786, b + 685), (1786, b + 790)], TEAL, True, 3)
text(1805, b + 745, '保存验收结果', 23, TEAL, 600)
y = base + 1001

y = heading(y, '02', '选项怎么来？代码把网页结构映射成可执行能力', '没有“先让另一个模型出题”的步骤。识别规则由开发者预先写好，每次应用到当前页面；同一元素可以贡献多个动作。')
left_w, right_x, right_w, panel_h = 916, 1004, 932, 447
rect(PAD, y, left_w, panel_h)
text(PAD + 24, y + 40, '网页信息 → 规则映射 → 当前操作', 29, INK, 750)
dom_rows = [('button / role=button', 'CLICK：点击绑定的实际节点'), ('input / textarea / 可编辑控件', 'TYPE_TEXT；也可点击打开菜单'), ('select ＋ 可选 option', 'SELECT：元素与选项配对'), ('checkbox / radio / ARIA 状态', 'CLICK；同时保留 checked 等状态'), ('页面滚动位置', '上下滚动；始终提供 WAIT，由模型判断是否等待')]
yy = y + 92
for src, target in dom_rows:
    text(PAD + 24, yy, src, 24, BLUE, 650)
    text(PAD + 24, yy + 33, '→ ' + target, 24, INK)
    yy += 67
rect(right_x, y, right_w, panel_h, '#f8faff')
text(right_x + 24, y + 40, '原版请求：共享 state ＋ 多个问题', 29, INK, 750)
para(right_x + 24, y + 88, 'state：URL、标题、最多 6000 字符可见正文、元素及状态、最近 10 条已执行动作。用户目标与规则随 instructions 提供。', right_w - 48, 24, INK, leading=35)
yy = y + 219
questions = [('operation', 'CLICK / TYPE_TEXT / SELECT / WAIT …'), ('click_target', '假设点击，应选哪个元素？'), ('type_text_target', '假设填字，应选哪个字段？'), ('select_target', '假设下拉选择，应选哪个元素/选项？')]
for name, body in questions:
    text(right_x + 24, yy, name, 24, BLUE, 650)
    text(right_x + 300, yy, body, 24, INK)
    yy += 44
text(right_x + 24, y + 423, '一次请求多题回答，只执行 operation 匹配的目标答案。', 24, TEAL, 650)
y += panel_h + 24
y = ribbon(y, '识别与执行都有边界', '名称来自 aria-label、label、文字、placeholder 等；排除隐藏、禁用、视口外、password/file 等输入与不可用状态。快照最多 250 条底层动作；执行前仍检测目标和遮挡。程序判断“支持什么操作”，模型判断“此刻该做什么”。')

y = heading(y, '03', '我们的探究路径：六个容易混淆的地方', '顺着疑问看清分工：网页提供结构，代码组织动作，模型判断路径，执行后用新状态继续。', '我们的推断')
y = cards(y, [
    ('① 先用模型出题？', '由代码按当前网页构造选项', 'HTML/ARIA 提供控件类型和状态；规则将其变成操作与目标，不需要先调用另一个模型出题。'),
    ('② 只是 Jev API 封装？', '还包含浏览器执行闭环', '库负责快照、动作绑定、请求、验证、执行、历史、停止条件和调试；Jev 只提供每轮判断。'),
    ('③ Jev 与大模型对立？', 'Jev 本身也是模型', '它定位于专门的决策与概率输出；浏览器代码、模型服务与酒店业务是不同层。'),
    ('④ 只喂选项就够了？', '目标与上下文同样重要', '字段值、页面正文、勾选状态与近期操作告诉模型目前在哪一步；裸按钮列表无法表达任务。'),
    ('⑤ 每个选项单独请求？', '一次请求可含多个问题', '同一 state 支撑操作题与目标题；不能由此推断每个候选都各跑一遍完整模型。'),
    ('⑥ 一次判断完成任务？', '跨轮必须重新观察与判断', '页面经操作才改变。库保存历史并重新传入；后续弹窗和结果不能靠第一轮可靠预知。'),
], 3)

y = heading(y, '04', 'Jev 与常见生成模型：差在哪里，哪些仍未知？', '普通模型同样能做选择题。决定是否使用 Jev，要比较相同任务上的选择质量、完整耗时与费用。', '官方声明')
y = table(y, ['观察维度', 'Jev / TypeSafe 的公开描述', '常见生成式模型 / 可做的改造'], [
    ('输出与运行', '直接返回受约束的选择和概率；官方称多个问题可并行评估。', '通常逐 token 生成；可约束为一个选项 ID，减少长文本输出。'),
    ('训练目标', '官方称用 RLCD 后训练，重视决策与概率校准。', '通常围绕语言生成及各类后训练；具体方法因模型而异。'),
    ('上下文与多轮', '每题共享 state；库每轮重新提交页面和最近动作。', '同样需要目标、状态与历史；也可作为选择器嵌入相同循环。'),
    ('概率与正确性', '高概率不保证选对；confidence 也不是业务成功率。', 'token 分数或自报 confidence 不自动等于校准后的正确率。'),
    ('速度与代价', '178 ms 是特定演示的调用中位数，不能推及所有任务。', '短输出仍有输入计算、推理、排队和网络；少走错步骤也能节约总时间。'),
], [280, 796, 796])
y = ribbon(y, '未知不猜：无法从公开材料复现完整 Jev', '权重、网络结构、训练数据、损失函数和 parallel sampler 的完整实现没有充分公开。不能断言每个选项各跑一遍、只需一次前向计算，或把专用分类头当作已证实事实。', '#e6f4f1', TEAL)
text(PAD, y + 30, '开源模型也能改成选择器：先不训练，再按实际问题投入', 30, INK, 750)
y += 58
y = cards(y, [
    ('改造 A / 不需重训', '约束输出合法选项 ID', '用 enum 或约束解码，选 operation＋target 或完整动作 ID；验证输出并映射到已观察节点。'),
    ('改造 B / 不需重训', '直接读取候选 logits', '单题、同答位的单 token 候选 logits 做 softmax；多 token 需整段评分。不会自动获得 Jev 的多题并行。'),
    ('改造 C / 需要数据', '按需校准或微调', '先检查概率是否可信，可做轻量校准；选择能力不足再微调，新分类头通常需要训练。'),
], 3)

y = heading(y, '05', '酒店教学：一轮选择对应一步，11 步串成一项任务', '本页脚本模拟，与主页面教学顺序一致；不是原库真实 trace，不连接 Jev 或酒店 API，不创建真实订单。', '教学示意')
rect(PAD, y, INNER, 84, '#fff3df', '#fff3df', 10)
text(PAD + 24, y + 35, '目标：杭州 · 10/30 入住 · 10/31 离店 · 2 位成人 · 免费取消 · 打开清溪酒店详情', 27, INK, 700)
text(PAD + 24, y + 68, '初始人数已经是 2 位成人，直接保留；模拟概率、动作和页面均用于解释架构。', 24, AMBER)
y += 112
cw, ch, row_gap = (INNER - 3 * 32) / 4, 132, 32
hotel = [('01 城市输入', 'TYPE_TEXT → 填“杭州”'), ('02 城市建议', 'CLICK → 选择“杭州”'), ('03 打开日历', 'CLICK → 日期入口'), ('04 选择入住', 'CLICK → 10 月 30 日'), ('05 选择离店', 'CLICK → 10 月 31 日'), ('06 免费取消', 'CLICK → 勾选筛选条件'), ('07 提交搜索', 'CLICK → 搜索按钮'), ('08 等待加载', 'WAIT → 重新观察结果'), ('09 打开目标酒店', 'CLICK → 清溪酒店详情'), ('10 模型认为完成', 'DONE → 停止 Agent 循环'), ('11 业务独立验收', '核对城市、日期、人数与政策')]
positions = []
for i, (title, body) in enumerate(hotel):
    row, col = divmod(i, 4)
    if row % 2:
        col = 3 - col
    xx, yy = PAD + col * (cw + 32), y + row * (ch + row_gap)
    positions.append((xx, yy))
    node(xx, yy, cw, ch, title, body, fill=PAPER if i < 10 else '#e6f4f1', color=TEAL if i == 10 else BLUE)
for i in range(len(positions) - 1):
    x1, y1 = positions[i]
    x2, y2 = positions[i + 1]
    if y1 == y2:
        route([(x1 + (cw if x2 > x1 else 0), y1 + ch / 2), (x2 + (0 if x2 > x1 else cw), y2 + ch / 2)], width=3)
    else:
        route([(x1 + cw / 2, y1 + ch), (x2 + cw / 2, y2)], width=3)
xx = PAD + 3 * (cw + 32)
rect(xx, y + 2 * (ch + row_gap), cw, ch, '#fff3df', '#fff3df')
text(xx + 22, y + 2 * (ch + row_gap) + 40, '完成查询 ≠ 完成订房', 27, AMBER, 750)
para(xx + 22, y + 2 * (ch + row_gap) + 82, '本例没有下单、付款或预订凭证。', cw - 44, 24, INK)
y += 3 * ch + 2 * row_gap + 24

y = heading(y, '06', '同样查酒店，直接 Jev、用库、固定脚本分别得到什么？', '自行搭建完整 Agent 也可达到相同能力。库的收益是复用工程代码；它没有独家的酒店搜索算法、库存或交易接口。', '我们的推断')
y = table(y, ['对比', '直接调用 Jev', '使用这个库', '固定浏览器脚本'], [
    ('你提供', 'state、问题和候选选项。', '起始 URL、自然语言目标、模型配置。', '预写步骤、控件定位与条件。'),
    ('调用得到', '选择和概率；该请求结束。', '读取、判断、执行、重读的持续循环与记录。', '按规定流程执行；无需每步问模型。'),
    ('仍要自己做', '浏览器读取、动作绑定、执行、历史、循环、验收。', '站点兼容、复杂业务、独立验收与生产治理。', '站点适配、等待、失败恢复与验收。'),
    ('更适合的起点', '只需决策服务，已有其他执行系统。', '目标和页面路径会变化，想研究或构建网页 Agent。', '固定站点、步骤稳定，重视流程确定性。'),
], [180, 564, 564, 564])

y = heading(y, '07', '快在哪里？现有性能证据只支持这些结论', '作者发布的演示与小样本对照，均非本项目复测；模型推理速度和浏览器工程提速必须分开。', '作者记录·未复测')
y = cards(y, [
    ('模型调用样例', '178 ms / 单次 Jev 中位', '来自航班录制中的 17 次 Jev 请求。它是该任务与服务条件下的测量，缺少与普通模型的同题完整横评。'),
    ('任务演示样例', '7.073 s / 航班查询', '从初次观察后的预测到 DONE，含模型、文字助手、操作和加载；不含启动、首次导航及独立终检。'),
    ('同模型工程对照', '9.450 → 7.092 s / 约 25%', '同 Jev 1.13 与 Mercury 2.5，各 3 次同一航班任务；协议调用中位 1,092 → 101，决策请求 22 → 17。'),
], 3)
y = ribbon(y, '不能把工程提速说成“Jev 比其他模型快 25%”', '其他样例：Wikipedia 2.798 s；本地酒店 fixture 1.896 s（Lisbon／筛选／Casa Flora）。这不是广泛成功率基准；两次文字助手 USD 0.00006272 也不是任务总成本。替换模型应比较成功率、全程 p50/p95、无效步骤及每次成功任务费用。')

y = heading(y, '08', '能力边界与个人价值：把闭环拆开，逐段复用', '最有用的研究产物是可迁移的分工与验证办法：把页面观察、模型判断、浏览器执行、业务验收分开定位问题。', '我们的推断')
y = cards(y, [
    ('适用', '常见语义控件的搜索与表单', '支持点击、替换文字、原生下拉、页面滚动、等待与停止；可研究搜索筛选、打开结果及普通表单。调试 UI 展示元素、概率、耗时和轨迹。'),
    ('边界', '不承诺任意网站或完整预订', 'iframe、Shadow DOM、Canvas、上传、新弹出标签页、嵌套滚动及复杂键盘控件有限；密码字段排除。中文页面、登录与复杂日期控件需单独验证。'),
    ('环境与成本', '开放源码，外部服务仍需准备', 'Python ≥3.12、Chrome、browser-harness 0.1.13 与 API 配置。决策和文字助手分开配置；修改 TEXT_MODEL 不会自动替换 Jev，密钥不放前端。'),
], 3)
path_top = y + 8
rect(PAD, path_top, INNER, 270, '#14283f', '#14283f')
text(PAD + 28, path_top + 42, '我们的起步与迁移路径', 31, '#ffffff', 750)
path_steps = [('1 / 定小目标', '限定一个页面的一项查询；先写成功条件。'), ('2 / 跑本地场景', '理解快照、操作与 guard；保留逐步记录。'), ('3 / 独立验收', '把 DONE 和业务成功分开，覆盖失败证据。'), ('4 / 对照与替换', '同任务比较脚本和其他模型，找真实瓶颈。'), ('5 / 再扩展站点', '按兼容性与投入决定范围，再补生产治理。')]
pw = (INNER - 56 - 4 * 30) / 5
for i, (title, body) in enumerate(path_steps):
    xx = PAD + 28 + i * (pw + 30)
    text(xx, path_top + 104, title, 26, '#83cfc8', 750)
    para(xx, path_top + 146, body, pw, 24, '#ffffff', leading=36)
    if i < 4:
        route([(xx + pw + 4, path_top + 96), (xx + pw + 25, path_top + 96)], TEAL, width=3)
y = path_top + 302

line(PAD, y, W - PAD, y)
y += 46
text(PAD, y, '来源与核对口径', 30, INK, 750)
y = para(PAD, y + 43, '固定源码：browser-use/jev-ultrafast · commit 1231850a0bf1a0c0341fe408ef1668dbbfdfac46（2026-09-18）；资料核对日 2026-10-23。本图为原创研究归纳；未运行真实酒店交易，未复测上游模型或性能。', INNER, 24, MUTED, leading=35) + 12
sources = [
    ('源码依据：README / snapshot.js / model.py / agent.py / browser.py', 'https://github.com/browser-use/jev-ultrafast/tree/1231850a0bf1a0c0341fe408ef1668dbbfdfac46'),
    ('计时依据：docs/performance.md（作者记录）', 'https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/docs/performance.md'),
    ('模型声明：TypeSafe Jev 发布文 / fan-out / machine-learning-primer', 'https://typesafe.ai/blog/introducing-system-one-models-and-jev'),
    ('改造参考：Hugging Face CausalLMOutput / Guo et al. 2017 概率校准', 'https://proceedings.mlr.press/v70/guo17a.html'),
]
for label, url in sources:
    parts.append(f'<a href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">')
    text(PAD, y, label + ' ↗', 24, BLUE, 600)
    parts.append('</a>')
    y += 38
y += 14
text(PAD, y, '011 / 从网页可选操作，到模型判断与业务验收', 24, INK, 700)
text(W - PAD, y, 'JEV BROWSER AGENT STUDY', 23, MUTED, 650, 'end')
H = int(y + 48)
defs = ''.join(f'<marker id="{name}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{color}"/></marker>' for name, color in [('blue', BLUE), ('teal', TEAL), ('amber', AMBER)])
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="atlas-title atlas-desc">
<title id="atlas-title">jev-ultrafast 研究总图：程序抽取网页操作，Jev 支撑选择，执行闭环与独立业务验收</title>
<desc id="atlas-desc">可独立阅读的完整研究图：真实架构循环、文字助手分支、失效回退、DONE 验收、DOM 规则与原版多问题请求、探究误区、模型差异和训练、开源改造、11 步酒店教学、直接调用和脚本对比、性能口径、场景边界与迁移路径。核对日期 2026 年 10 月 23 日。</desc>
<defs>{defs}</defs><rect width="{W}" height="{H}" fill="{BG}"/>
<g font-family="Segoe UI, Microsoft YaHei, Noto Sans CJK SC, sans-serif">{''.join(parts)}</g></svg>'''
ET.fromstring(svg)
assert all(last <= bottom for last, bottom, title in panel_checks), [v for v in panel_checks if v[0] > v[1]]
assert all(size >= 23 for _, _, _, size, _, _ in text_bounds)
assert max(y for _, y, _, _, _, _ in text_bounds) < H - 20
for x, yy, value, size, anchor, rotate in text_bounds:
    if rotate:
        continue
    length = measure(value, size)
    left = x - length if anchor == 'end' else (x - length / 2 if anchor == 'middle' else x)
    assert left >= 0 and left + length <= W + 1, (value, left, length)
for target in (PROJECT / 'assets/browser-choice-guide.svg', PROJECT / 'web/assets/browser-choice-guide.svg'):
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(svg, encoding='utf-8')
print(f'Built two identical research atlases: {W} x {H}; {len(text_bounds)} lines; minimum font 23px.')
