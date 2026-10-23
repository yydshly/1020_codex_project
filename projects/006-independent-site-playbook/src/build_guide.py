"""Render the complete Chinese research guide as a portable, editable SVG.

Python standard library only. Run from any working directory.
No network, deletion, paid provisioning, or changes to other projects.
"""
from pathlib import Path
from html import escape
import unicodedata
import json

PROJECT = Path(__file__).resolve().parents[1]
W, PAD, GAP = 1800, 76, 22
INNER = W - PAD * 2
INK, MUTED, GREEN = '#24372f', '#617363', '#285f49'
PAPER, BG, LINE = '#fffef8', '#f5f4ec', '#d6dfce'
parts = []
sections = []


def rect(x, y, width, height, fill=PAPER, stroke=LINE, radius=12):
    parts.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>')


def text(x, y, value, size=20, fill=INK, weight=400, anchor='start'):
    parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(value))}</text>')


def lines(value, width, size=20):
    result, line, used = [], '', 0
    for char in value:
        if char == '\n':
            result.append(line)
            line, used = '', 0
            continue
        char_w = size * (1 if unicodedata.east_asian_width(char) in 'WF' else .57)
        if used + char_w > width and line:
            result.append(line)
            line, used = '', 0
        line += char
        used += char_w
    if line:
        result.append(line)
    return result


def paragraph(x, y, value, width, size=20, fill=MUTED, weight=400, leading=None):
    leading = leading or round(size * 1.58)
    for line in lines(value, width, size):
        text(x, y, line, size, fill, weight)
        y += leading
    return y


def heading(y, label, title, subtitle=''):
    sections.append(dict(label=label, title=title, y=int(y - 25)))
    text(PAD, y, label, 17, GREEN, 650)
    text(PAD, y + 46, title, 35, INK, 650)
    y += 82
    if subtitle:
        y = paragraph(PAD, y, subtitle, INNER, 20)
    return y + 14


def cards(y, items, columns=3, fill=PAPER):
    width = (INNER - GAP * (columns - 1)) / columns
    for offset in range(0, len(items), columns):
        row = items[offset:offset + columns]
        heights = []
        for item in row:
            height = 76 + len(lines(item['title'], width - 44, 24)) * 35
            height += sum(len(lines(value, width - 44, 19)) * 30 + 15 for value in item['body'])
            heights.append(height)
        height = max(heights)
        for index, item in enumerate(row):
            x = PAD + index * (width + GAP)
            rect(x, y, width, height, item.get('fill', fill))
            text(x + 22, y + 31, item.get('label', ''), 15, GREEN, 600)
            cursor = paragraph(x + 22, y + 69, item['title'], width - 44, 24, INK, 650, 35) + 10
            for value in item['body']:
                cursor = paragraph(x + 22, cursor, value, width - 44, 19) + 15
        y += height + GAP
    return y


def ribbon(y, title, body, fill='#e5eddf'):
    body_lines = lines(body, INNER - 52, 20)
    height = 88 + len(body_lines) * 32
    rect(PAD, y, INNER, height, fill)
    text(PAD + 26, y + 37, title, 23, GREEN, 650)
    paragraph(PAD + 26, y + 77, body, INNER - 52, 20)
    return y + height + 30


STAGES = [
    ('01', '先确定这一轮要跑通什么', '目标与约束',
     '写清可投入时间、现金上限、现有能力和支付条件。第一轮只处理一种人群的一项任务，允许人工辅助。',
     '一页项目约束：目标用户、任务、第一版范围、预算、判断周期；第一轮目标是网站、真实用户与完成交付。',
     '能说明本轮学什么、最多投入多少。若目标仍是“做一个大平台”，先继续缩小；不以收入截图作收益预测。',
     '把学习和试错预算写清楚，避免先买长期资源、再寻找用途。'),
    ('02', '找到正在发生的任务与可接触的人', '需求与渠道一起找',
     '从近期求助、工作室流程与访谈寻找任务。询问上一个项目怎么做、频率、耗时、错误和替代工具。先列匹配对象。',
     '需求证据卡＋公开来源＋候选名单＋一条可执行触达方式。记录事实、个人自述和我们的推断。',
     '找得到正在做这件事的人，且有人愿意展示实际流程。找不到人 → 调整人群/渠道；抱怨和点赞不足以判定付费需求。',
     '从“有趣的方向”落到“谁在什么情况下需要”，把获客困难前置暴露。'),
    ('03', '对照竞品、人工和现有 AI 做法', '找具体差异',
     '用同一任务比较 Docs/网盘、人工整理、专用平台和通用 AI。核查功能覆盖，也比较准备、检查和修正的总时间。',
     '替代方案表＋一个价值假设：为谁减少哪项工作、为什么值得改变现有做法；保留不能解决的问题。',
     '能说明具体差异。按页面收集、免登录、提醒已有覆盖；如果现有方案足够 → 重新收窄任务，不复制整个成熟平台。',
     '避免把“能开发的功能”误当成“未满足的需求”，让竞争调查真正影响选题。'),
    ('04', '先拿一份样例检验结果是否值得要', '验证交付物',
     '用示意或获准材料，展示输入到输出；标出来源、冲突和缺项。向匹配设计师邀请一个真实项目，先人工辅助。',
     '一份能看懂的交付样例、用户反馈、真实试用许可，以及用户与我们双方耗时的记录。',
     '用户愿意带真实任务来试，知道结果用于哪里。无人愿试/结果无用 → 回到 02—03；不要直接投入全自动开发。',
     '较早得到“结果有用吗”的答案，减少围绕错误承诺搭建网站的成本。'),
    ('05', '确定市场、入口、收费对象与形态', '把方向变成方案',
     '分别决定国内/海外、语言、网页/插件/App、谁使用谁付款、按项目还是订阅，以及第一批从哪条渠道来。',
     '定位与使用路径：用户如何发现、开始任务、得到结果、再次使用和付费。候选：海外英文 Web App，浏览器访问。',
     '市场、可触达用户与交付方式匹配。国内若更容易找到真实用户，可先验证；PayPal 采购与对外收款需分别核实。',
     '看懂“独立站、云平台、App”是不同维度，把产品形态和渠道放在一起选择。'),
    ('06', '开发一条最小但完整的任务链', '实现可交付的结果',
     '只做输入→处理→检查→导出。按需增加账号、保存、文件限制和错误提示；私密 API Key 留在后端。允许保留可度量的人工步骤。',
     '可以稳定运行的第一版、示例输入输出、错误用例、代码版本和数据清单。记录每次处理的人工与 API 成本。',
     '受控样例可完成任务，结果能核对。结果不可靠 → 修正 06；成本偏高 → 回看 03/05，收窄功能与承诺。',
     '让开发规模跟随证据，避免先做完整账号、订阅、后台系统却无人使用。'),
    ('07', '按运行需要采购并部署独立站', '技术支撑主线',
     '代码入 Git→部署临时网址→配置服务端环境变量→按需接数据与文件→购买域名→DNS 指向→HTTPS→备份与账单。',
     '正式网址、发布和回退步骤、密钥位置、可恢复数据、用量观察与费用提醒。域名注册商与托管商可以不同。',
     '外部能访问、可更新回退、费用可观察。轻量先 Cloudflare；确需完整运行环境再 VPS。域名未定可先临时网址试用。',
     '部署已有成熟路线。先用小投入上线，再根据真实工作负载扩容，避免为促销改变产品路线。'),
    ('08', '验收完整体验，并带来第一批使用', '上线与获客相接',
     '从手机和电脑测试访问、上传、处理、失败提示、下载与数据权限。按既定渠道邀请少量匹配用户，看陌生人能否独立完成任务。',
     '一次端到端验收＋真实交付记录＋来源渠道、开始/完成、中断、返工和支持耗时。候选对象尚未联系，不等于已获用户。',
     '陌生用户能完成任务并得到可用结果。没人访问 → 查渠道；有人访问不开始 → 查承诺；开始后失败 → 回到 06—07。',
     '把网站可访问、获客成功与用户获得价值分别检查，知道失败具体发生在哪一段。'),
    ('09', '观察复用、付款与经营成本', '决定是否继续',
     '邀请第二次使用、提出明确报价；记录实际付款、任务频率、总耗时、获客成本、模型费用与支持工作，按同一口径复盘。',
     '继续/收窄/改为服务/转向/停止的决定，以及可复用的行业模板、案例、部署说明和渠道经验。',
     '出现再次使用或真实交易，交付成本可承担。只用一次/不付款 → 回看 03/05；维护过重 → 回看 05—07。',
     '一次小项目既检验生意，也留下下一次可复用的方法；跑通流程不等于已经找到长期产品。'),
]


def stage(y, item):
    number, title, label, action, output, gate, value = item
    left = 230
    body_width = (INNER - left - 60) / 3
    texts = [action, output, gate]
    body_height = max(len(lines(value, body_width - 36, 19)) * 30 for value in texts)
    value_lines = len(lines('给我的参考价值：' + value, INNER - 60, 19))
    height = max(225, 104 + body_height + 35 + value_lines * 29)
    rect(PAD, y, INNER, height)
    rect(PAD, y, left, height, '#e9efdf', '#e9efdf')
    text(PAD + 25, y + 43, number, 30, GREEN, 650)
    text(PAD + 25, y + 77, label, 16, GREEN, 500)
    paragraph(PAD + 25, y + 116, title, left - 50, 25, INK, 650, 37)
    for index, (column_title, body) in enumerate(zip(['做什么', '留下什么产物', '通过条件 / 失败回路'], texts)):
        x = PAD + left + 25 + index * body_width
        text(x, y + 39, column_title, 17, GREEN, 650)
        paragraph(x, y + 77, body, body_width - 36, 19)
    foot_y = y + height - value_lines * 29 - 16
    parts.append(f'<path d="M{PAD + left + 24} {foot_y - 27}H{W - PAD - 24}" stroke="{LINE}"/>')
    paragraph(PAD + left + 25, foot_y, '对我的价值：' + value, INNER - left - 65, 18, GREEN, 500, 29)
    # Keep footer height independent of the three-column body; stage footer is short.
    if number != '09':
        arrow_y = y + height
        parts.append(f'<path d="M{W/2} {arrow_y+3}v20m-6-7 6 7 6-7" stroke="#95ab85" stroke-width="2" fill="none"/>')
    return y + height + 30


def table(y, columns, rows, widths):
    header_h = 48
    rect(PAD, y, INNER, header_h, '#e5ecdc')
    x = PAD
    for title, width in zip(columns, widths):
        text(x + 18, y + 31, title, 18, GREEN, 650)
        x += width
    y += header_h
    for index, row in enumerate(rows):
        height = max(len(lines(value, width - 36, 18)) * 29 for value, width in zip(row, widths)) + 32
        rect(PAD, y, INNER, height, PAPER if index % 2 == 0 else '#f0f2e9', LINE, 0)
        x = PAD
        for value, width in zip(row, widths):
            paragraph(x + 18, y + 30, value, width - 36, 18)
            x += width
        y += height
    return y + 30


def build():
    y = 65
    text(PAD, y, 'PROJECT 006  /  独立站实践手册', 21, GREEN, 650)
    text(W - PAD, y, '研究快照：2026-10-23', 18, MUTED, 400, 'end')
    text(PAD, y + 84, '从需求判断，到独立站上线，再到真实使用', 51, INK, 650)
    y = paragraph(PAD, y + 137, '一张图整理我们的理解：为什么做、给谁用、如何找到人、怎么搭起来，以及下一次如何用证据决定继续。', INNER, 24) + 22
    y = ribbon(y, '当前状态：已形成研究与路线，尚未完成商业验证',
               '本库保存的是方法、证据与待执行方案。建站内容整理是优先候选；并未联系候选对象、采购资源或验证付费。这个研究网页的完成，不代表商业工具已经上线。')

    y = heading(y + 15, '01 / 这个库带给我们的思考', '部署可解决，项目价值与获客需要真实证据。')
    y = cards(y, [
        dict(label='想法 → 任务', title='新词是线索', body=['从趋势、求助与工作流寻找机会，再落实到具体用户、发生频率、代价与替代方案。','参考价值：不因热度或收入自述直接下注。']),
        dict(label='功能 → 价值', title='结果必须值得要', body=['现有产品已经覆盖大量通用功能；我们需要证明用户完成任务更省时、更可靠。','参考价值：用同一任务比较，而不是只列功能。']),
        dict(label='曝光 → 验证', title='获客从选题开始', body=['社区、目录、合作、Google 与 AI 都是可能入口。可收录、被引用不等于有人使用或付款。','参考价值：提前知道第一批人在哪里。']),
        dict(label='上线 → 经营', title='先跑一轮完整流程', body=['小网站可以低成本上线。真正要连起来的是触达、使用、交付、复用与费用。','参考价值：每一步留产物，下一项目可复用。'])
    ], 4)

    y = heading(y + 15, '02 / 从需求到上线的主线', '九个阶段，每一步都有产物与继续条件。',
                '顺序可以小步往返：需求与渠道先行，部署服务产品；上线后继续验证真实使用。图中回路是调整方向的依据，不是失败后的额外惩罚。')
    for item in STAGES:
        y = stage(y, item)
    y = ribbon(y, '失败回路：用证据定位问题，而不是一律继续加功能',
               '找不到人 → 02；样例不吸引人 → 02—04；结果不可靠 → 06；访问或交付失败 → 07—08；有使用无复用/付款 → 03/05/09；费用或维护过重 → 05—07。有效结果则沉淀模板、案例与操作记录。', '#f3eadb')

    y = heading(y + 15, '03 / 用一个具体案例理解价值', '候选：已有材料 → 可以建站的内容包',
                '这里收集的是客户交来的文案和图片，不是设计灵感素材库。使用者/潜在付款者是持续接项目的设计师或小工作室，商户主要负责提供事实与确认。')
    y = cards(y, [
        dict(label='示意输入 · 非真实用户成果', title='零散材料', body=['Word 公司介绍、20 张照片、几段补充邮件、多个版本的联系方式。','问题：不知道放在哪页、哪份最新、还缺什么。']),
        dict(label='候选产品能力 · 待验证', title='整理与核对', body=['按首页/服务/关于/联系分类，保留每段来源，标出矛盾与待补项目。','先接受设计师主动提交材料，不急着连接整个邮箱和网盘。']),
        dict(label='交付与价值假设', title='可确认的内容包', body=['可编辑页面文案＋图片清单＋来源索引＋冲突/缺项报告。','要衡量：准备、检查、修正后的总耗时；不能承诺让失联客户配合。'])
    ], 3)
    y = table(y, ['方向 / 当前证据', '可能重复发生的任务', '第一批用户与验证方式'], [
        ('内容整理 / 初步研究较深', '设计师每接一个新建站项目，重新整理材料与核对缺项。', '工作室流程页、Webflow 目录、相关求助 → 一个真实项目试用 → 看第二项目是否复用。'),
        ('商品图批处理 / 备选', '卖家上新时重复修改尺寸、留白、命名和导出。', '先固定一种平台与图片任务，取真实样本比较结果；本轮未同等深入验证。'),
        ('供应商 CSV / 备选', '周期性更新商品表、修正规则并导入目标系统。', '商品上架/导入服务商，取同一来源两期文件；核实是否持续更新而非一次迁移。')
    ], [370, 600, INNER - 970])

    y = heading(y + 15, '04 / 竞争告诉我们什么', '成熟功能是基础，差异要落在一项实际工作上。')
    y = table(y, ['产品 / 替代方案', '已有公开覆盖', '对我们的启示'], [
        ('Content Snare', '收集、模板、提醒、审批、导出与集成；Basic 月付 $42，年付折合 $35。', '通用流程已成熟；免登录、催交、模板不能单独算独特卖点。'),
        ('PageIntake', '按页面/区块收集、审核与集成；免费 1 项目，Studio $15/月。', '“按网页结构收材料”“低价”“接 Webflow”也有人做。'),
        ('Blocky / SimpleStage', '区块、状态与确认；设计位置收集和 Figma 相关流程已有覆盖。', 'Blocky Studio 早期价 £19/月；SimpleStage Premium 月付 $29。实际体验与配置成本待实测。'),
        ('Duda / 文档网盘 / 通用 AI', '平台内建收集和内容连接，或用户已有的人工与 AI 流程。', '真正的比较对象还包含“不换工具”。功能为官网说明，未逐一订阅验证。')
    ], [350, 660, INNER - 1010])
    y = ribbon(y, '优先验证的切口：整理已经发来的材料，而不是再加一个提交入口',
               '有材料分散、客户不会写、交接繁琐的公开线索，但尚未证明这个切口无人服务或有人付费。第二切口是减少从设计稿搭收集任务的时间，第三是把业务事实组织为可确认草稿；两者竞争更直接。')

    y = heading(y + 15, '05 / 第一批用户怎么找', '先取得真实任务，再验证可重复的获客方式。')
    y = cards(y, [
        dict(label='第一轮优先', title='定向找到设计师', body=['从公开项目、流程页、服务商目录筛选正在接项目且亲自处理内容的人。','例如 Seas Design、Jessica Diab：只有流程匹配线索，尚未联系、未确认需求。']),
        dict(label='流程交流与合作候选', title='社区和模板作者', body=['相关求助作者、Alana Jade Studio、Christy Price 可研究。旧帖子须确认问题是否仍存在。','通过公开商务渠道说明来意，遵守社区规则；有真实案例后再谈推广合作。']),
        dict(label='中长期可发现性', title='内容、搜索与 AI', body=['发布检查模板、教程与真实前后对比。AI 工具调用、API、插件和目录是后期可测试入口。','跟踪来源→开始任务→完成→再次使用→付款；不保证收录、排名或 AI 推荐。'])
    ], 3)
    y = ribbon(y, '建议试验：约 30 个对象 → 争取 8—10 次交流 → 3 个真实项目',
               '数字是安排实验的目标，不是承诺转化率。先赠一份范围明确的整理试用，再对第二个项目提出具体价格。记录双方总耗时与人工修正；例如 3 人中 2 人愿继续且有人付款，可作为继续投入的参考门槛，不是统计证明。', '#f3eadb')

    y = heading(y + 15, '06 / 把网站真正搭起来', '域名是地址，托管是运行环境，数据与模型按需接入。',
                '候选形态：在国内开发，面向海外用户的英文 Web App；手机/电脑浏览器访问。国内与海外、网页与 App、平台与 VPS 是不同决策，按实际用户与工作负载选择。')
    y = cards(y, [
        dict(label='入口 / 持有资产', title='域名 ＋ DNS ＋ HTTPS', body=['Porkbun 注册 .com → DNS 指向网站 → HTTPS 正常访问。注册商与服务器无需同一家。','代码留在自己的 Git 仓库；域名可以沿用，托管和实现可以调整。']),
        dict(label='起步主方案 / 月付或免费', title='Cloudflare 托管', body=['静态资源与轻量接口先试免费；运行限制或用量不足再开 Workers Paid。','按需接 D1 数据库、R2 文件与外部 AI API；各自额度与费用单独观察。']),
        dict(label='确需完整环境再选', title='DigitalOcean VPS', body=['适合常驻后端、特定依赖和后台任务；2GB 是否够需真实任务测试。','自管系统、进程、HTTPS、日志和恢复；Vercel Pro 是另一托管选择，$20/月起，Hobby 限非商业。'])
    ], 3)
    y = ribbon(y, '部署后的验收清单',
               '用陌生用户视角走一遍：域名/HTTPS → 手机与电脑访问 → 示例与真实输入 → 处理成功/失败 → 结果下载与核对 → 数据权限 → 更新回退 → 备份恢复与费用观察。费用提醒通常不等于自动封顶；敏感 API Key 不能出现在浏览器代码里。')

    y = heading(y + 15, '07 / 采购、预算与黑五', '现在买必要项，其余跟随产品进度。',
                '以下均为 2026-10-23 官方资料快照，普通非溢价域名，购买前复核价格、地区、税费与付款资格；未发生实际采购。')
    y = table(y, ['项目 / 商家', '参考费用与 PayPal 条件', '购买时机与注意点'], [
        ('域名：Porkbun .com，先 1 年', '$11.08/年；当时注册与续费同价。支持 PayPal，也有支付宝备用。', '名字确定即可买。PayPal 不能自动扣续费，需提醒或其他续费安排；未定先临时网址。'),
        ('部署：Cloudflare Workers', 'Free $0 起；Paid $5/月起。Cloudflare 支持 PayPal。', '现在试免费部署，确需额外资源再升级。Workers Paid 不是网站 Pro 套餐，也不是无限后端资源。'),
        ('数据/文件：D1 与 R2', '各有免费额度，超额按量计费；AI API 另付。', '有保存/上传需求再开。关注数据生命周期、权限、备份和可导出性。'),
        ('备用：DigitalOcean Basic Regular', '1核/2GB/50GB SSD：$12/月；周备份 +20%，约 $14.40/月。支持 PayPal。', '需要完整环境再创建。PayPal $5 预付款抵首账单；关机仍计费，停止实验需按备份与资源销毁流程处理。'),
        ('三个月基础预算', '域名＋免费：$11.08；＋Workers Paid：$26.08；改用 VPS＋周备份：$54.28。', '低用量、包含额度内；未计税费、AI、超额资源、交易手续费、开发和推广时间。'),
        ('黑五：11/27；网络星期一：11/30', '本次未确认所选商家可执行的 2026 黑五折扣；不计预期优惠。', '11/20—30 可复核真正需要的长期套餐。看首年与续费、有效期、机房与退款；不延迟开发和用户验证。')
    ], [390, 610, INNER - 1000])

    y = heading(y + 15, '08 / 对我的参考价值', '把研究变成一套能反复使用的决策方法。')
    y = cards(y, [
        dict(label='选题时', title='有一把筛选尺', body=['同时问：谁需要、任务多常发生、现有做法哪里不够、是否能接触用户。','换成图片、CSV 或其他工具时，仍能复用这个判断框架。']),
        dict(label='开发时', title='知道先做什么', body=['先做承诺和样例，再做一条能交付的链路。每一步都有产物与通过条件。','不会因为部署方案明确，就误以为项目已经成立。']),
        dict(label='投入时', title='知道何时花钱', body=['域名按年、托管按需、完整服务器在运行需求明确后开；AI 和维护也计成本。','黑五是采购比较机会，不能替代产品判断。']),
        dict(label='没有结果时', title='知道回到哪一步', body=['分开查看触达、开始、完成、复用与付费，识别渠道、承诺、体验或成本问题。','用失败回路调整，而不是无边界增加功能。']),
        dict(label='项目结束时', title='留下可复用资产', body=['证据与来源、行业模板、交付样例、部署/回退步骤、渠道记录、真实成本。','即使产品调整，方法和记录仍能帮助下一轮。']),
        dict(label='避免过度推断', title='清楚哪些还不知道', body=['官网是宣称，社区是自述，访谈是线索；真实使用、再次使用和付款逐步增强证据。','本图用于理解和执行，不提供流量、收入或成功保证。'])
    ], 3)
    y = ribbon(y, '第一步：选一种用户的一项任务，做出输入 → 输出样例',
               '沿用素材整理案例时，先用获准或示意材料做“按页面分类＋来源＋冲突与缺项”的样例，给少量匹配设计师看，争取一个真实项目。与此同时用免费托管跑通访问、处理与结果交付。')

    y = heading(y + 15, '09 / 来源与更新口径', '图负责串联判断，网页保留全部证据与细节。')
    source_rows = [
        ('需求信号 / 社区自述', 'reddit.com/r/webdesign/comments/1w7xtwi/；r/web_design/comments/uatqv4/；r/web_design/comments/1i1c1ei/'),
        ('竞品 / 公开功能与价格', 'contentsnare.com/pricing/；pageintake.com；blockyhq.com/pricing；simplestage.com/pricing/；duda.co 产品更新'),
        ('采购 / 官方文档', 'porkbun.com/tld/com；porkbun.com/support/payment_options；developers.cloudflare.com/workers/platform/pricing/'),
        ('VPS / 官方文档', 'digitalocean.com/pricing/droplets；docs.digitalocean.com/support/why-does-digitalocean-require-prepayment-for-paypal/'),
        ('完整来源 / 当前记录', '手册网页保留 26 个来源与限定说明；notes/research.md 保存讨论推理。候选尚未联系，商业项目与采购仍待执行。'),
    ]
    y = table(y, ['来源类别', '核查入口 / 证据边界'], source_rows, [390, INNER - 390])
    text(PAD, y + 14, '独立站实践手册 · 006 ｜ 研究与方案已整理，真实使用与付费待验证 ｜ 版本 2026.10.23', 18, GREEN, 500)
    y += 65
    document = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{int(y)}" viewBox="0 0 {W} {int(y)}" role="img" aria-labelledby="title description">
<title id="title">独立站完整引导图：从需求判断到上线、真实使用与持续经营</title>
<desc id="description">九阶段流程、动作与产物、通过条件与失败回路，以及案例、竞争、获客、部署采购、预算和个人参考价值。信息快照为2026年10月23日，尚未商业验证。</desc>
<rect width="{W}" height="{int(y)}" fill="{BG}"/>
<g font-family="Microsoft YaHei,PingFang SC,Segoe UI,Arial,sans-serif">{''.join(parts)}</g></svg>'''
    for target in [PROJECT / 'assets' / 'independent-site-guide.svg', PROJECT / 'web' / 'independent-site-guide.svg']:
        target.write_text(document, encoding='utf-8')
    (PROJECT / 'web' / 'guide-sections.js').write_text('window.GUIDE_SECTIONS = ' + json.dumps(sections, ensure_ascii=False) + ';\n', encoding='utf-8')
    print(f'Complete guide: {W} x {int(y)}, {len(document):,} characters; 9 stages with decision loops.')


if __name__ == '__main__':
    build()
