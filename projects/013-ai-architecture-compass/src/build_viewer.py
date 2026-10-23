"""Build a chapter reader and accessible text companion from the shared catalog."""
from html import escape as esc
from pathlib import Path
import json

PROJECT = Path(__file__).resolve().parents[1]


def field_list(item, fields):
    return '<dl>' + ''.join(f'<dt>{esc(title)}</dt><dd>{esc(item[key])}</dd>' for title, key in fields) + '</dl>'


def build(data, layout):
    bodies = {}
    bodies['understanding'] = '''<p class="reader-lead">需求决定我们想达到什么；代码保存规则与边界，让后续需求有可靠的落点。每次实现，都需要把目标、结构与实际证据接起来。</p><div class="text-flow"><article><h3>01 明确目标</h3><p>说明用户任务、第一版范围和可观察的成功结果，列出无法接受的失败。</p></article><article><h3>02 确定边界</h3><p>统一术语，明确业务规则、数据所有者、模块公开入口及允许的依赖。</p></article><article><h3>03 实现与检查</h3><p>完成一条真实用例，让结构检查与行为验证覆盖关键约束。</p></article><article><h3>04 用证据调整</h3><p>记录已验证和未验证范围；发生规则重复或改动扩散时，回到模型与边界。</p></article></div><p class="reader-callout">今天的代码也是下一轮 AI 的上下文。你掌握目标与重要取舍，AI 需要提供可审查的实现和证据。</p>'''
    method_fields = [('方法类型', 'kind'), ('关注的问题', 'question'), ('适用场景', 'scene'), ('核心原理', 'principle'), ('落地方向', 'direction'), ('意义', 'value'), ('代价', 'cost'), ('何时延后', 'notFor'), ('最小动作', 'firstStep'), ('常见误用', 'pitfall'), ('有效性信号', 'successSignal'), ('约束示例', 'rule'), ('验证证据', 'evidence'), ('组合关系', 'combine')]
    methods = []
    category = None
    by_id = {item['id']: item for item in data['architectures']}
    method_items = [by_id[item['id']] for item in layout['methods']]
    for item in method_items:
        if item['category'] != category:
            category = item['category']
            methods.append(f'<h3 class="text-category">{esc(category)}</h3>')
        extra_source = f' · <a href="{esc(item["source2"], quote=True)}" target="_blank" rel="noopener noreferrer">补充原始参考 ↗</a>' if item.get('source2') else ''
        methods.append(f'<details id="text-method-{item["id"]}" class="text-method"><summary><strong>{esc(item["name"])}</strong><span>{esc(item["en"])}</span></summary><p>{esc(item["summary"])}</p>{field_list(item, method_fields)}<a href="{esc(item["source"], quote=True)}" target="_blank" rel="noopener noreferrer">原始定义与说明 ↗</a>{extra_source}</details>')
    bodies['architectures'] = '<p class="reader-lead">先认清各自解决的问题。不同层次可以组合，相近的依赖控制思想可以择一表达。</p>' + ''.join(methods)
    bodies['composition'] = '<p class="reader-lead">每种方法都要有采用理由。组合之后，继续明确规则所有者、共同成功的边界和权威数据。</p>' + ''.join(f'<article class="text-block"><span class="eyebrow">{esc(item["label"])}</span><h3>{esc(item["title"])}</h3><p class="reader-callout">{esc(" + ".join(item["methods"]))}</p>{field_list(item, [("采用理由","reason"),("关键边界","boundary"),("怎样验证","verify"),("演进条件","later")])}</article>' for item in data['recipes'])
    bodies['workflow'] = ''.join(f'<article class="text-block"><span class="eyebrow">阶段 {index:02d}</span><h3>{esc(item["name"])}</h3>{field_list(item, [("动作","action"),("产物","output"),("通过条件","pass"),("证据","evidence"),("个人用途","value"),("返回路径","back")])}</article>' for index, item in enumerate(data['stages'], 1))
    bodies['constraints'] = '<p class="reader-callout">关键规则 ID → 规则所有者与入口 → 可以违反它的场景 → 实际验证证据。</p>' + ''.join(f'<article class="text-block"><h3>{esc(item["intent"])}</h3>{field_list(item, [("代码约束","rule"),("怎样检查","check"),("证明范围","limit")])}</article>' for item in data['guards']) + '<p class="reader-lead">架构说明保存当前结构；ADR 保存取舍；项目指令规定 AI 如何工作；检查与 CI 落实可执行约束。填完任务卡只表示信息齐全，执行证据需要另外记录。</p><a class="text-link" href="index.html#workbench">填写本次实现约束卡 →</a>'
    bodies['example'] = '''<p class="reader-lead">假设场景：生成润色建议，由用户决定采纳。AI 用例负责建议，内容模块拥有正文和版本规则。</p><article class="text-block"><h3>从规则看边界</h3><ul><li>生成建议或模型失败，都不修改已保存正文。</li><li>建议记录来源版本，采纳时由统一入口原子地维护版本匹配与写入。</li><li>模型 SDK 留在适配器，核心用例通过约定端口调用。</li></ul></article><article class="text-block"><h3>用失败场景验收</h3><ul><li>旧版本建议：无法直接覆盖较新的正文。</li><li>同版本并发采纳：实际存储只允许一个请求成功。</li><li>模型超时：原文完整，任务有明确失败状态。</li><li>保存后重开：读出的内容与已确认结果一致。</li><li>索引失败：已保存正文仍可用，索引可以重试。</li></ul></article><p class="reader-callout">这些是教学预期。本网页没有运行真实笔记应用或完成上述业务测试。</p>'''
    bodies['value'] = '''<div class="text-flow"><article><h3>选方向</h3><p>识别当前最值得解决的复杂性，找到适用的架构方法。</p></article><article><h3>控投入</h3><p>为抽象写明理由与代价；没有实际压力时保持简单。</p></article><article><h3>审实现</h3><p>追踪规则归属、实际依赖和运行证据，知道实现做到了哪里。</p></article><article><h3>持续复用</h3><p>让下一轮 AI 接手时继承结构、决策和验证记录，并据真实需求调整。</p></article></div><p class="reader-callout">已提供：资料、选择与对比工具、任务卡及模板。仍需在目标项目执行：适用性验证、依赖约束、真实测试与 CI 配置。</p><a class="text-link" href="index.html#map">获取五份工作模板 →</a>'''
    chapters, text_chapters = [], []
    for index, section in enumerate(layout['sections']):
        current = ' aria-current="step"' if index == 0 else ''
        chapters.append(f'<button data-section="{section["id"]}"{current}><span>{index + 1:02d}</span><strong>{esc(section["short"])}</strong></button>')
        text_chapters.append(f'<article data-text-section="{section["id"]}"{(" hidden" if index else "")}>{bodies[section["id"]]}</article>')
    options = ''.join(f'<optgroup label="{esc(category, quote=True)}">' + ''.join(f'<option value="{item["id"]}">{esc(item["name"])}</option>' for item in method_items if item['category'] == category) + '</optgroup>' for category in dict.fromkeys(item['category'] for item in method_items))
    values = {'CHAPTERS': ''.join(chapters), 'METHOD_OPTIONS': options, 'TEXT_CHAPTERS': ''.join(text_chapters), 'FIRST_TITLE': esc(layout['sections'][0]['title']), 'FIRST_SUMMARY': esc(layout['sections'][0]['summary']), 'MAPHEIGHT': str(layout['height']), 'LAYOUT': json.dumps(layout, ensure_ascii=False).replace('<', '\\u003c')}
    page = (PROJECT / 'src/guide.html').read_text(encoding='utf-8')
    for key, value in values.items():
        page = page.replace('@@' + key + '@@', value)
    return page
