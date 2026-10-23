"""Build the static handbook. Python standard library; no network or deletion."""
from pathlib import Path
from html import escape as esc
import json
import build_guide
import build_viewer

PROJECT = Path(__file__).resolve().parents[1]
WEB = PROJECT / "web"


def build():
    data = json.loads((PROJECT / "src/catalog.json").read_text(encoding="utf-8"))
    layout = build_guide.build(data)
    methods = []
    for index, item in enumerate(data["architectures"], 1):
        fields = [("适合什么场景", "scene"), ("核心原理", "principle"), ("落地方向", "direction"), ("对我们的意义", "value"), ("代价与取舍", "cost"), ("需要什么证据", "evidence"), ("什么时候先别用", "notFor"), ("最小落地动作", "firstStep"), ("常见误用", "pitfall"), ("怎样判断有效", "successSignal")]
        content = "".join(f'<div><h4>{label}</h4><p>{esc(item[key])}</p></div>' for label, key in fields)
        searchable = " ".join(value for value in item.values() if isinstance(value, str)).lower()
        methods.append(f'''<details class="architecture-card" id="method-{item['id']}" data-category="{esc(item['category'], quote=True)}" data-search="{esc(searchable, quote=True)}"><summary><span class="ordinal">{index:02d}</span><span class="method-name">{esc(item['name'])}<span class="english">{esc(item['en'])}</span></span><span class="question">{esc(item['question'])}</span><span class="category-label">{esc(item['category'])}</span><span class="expand-icon" aria-hidden="true">＋</span></summary><div class="method-body"><p class="method-summary">{esc(item['summary'])}</p><div class="method-grid">{content}</div><div class="method-rule"><span>{esc(item['kind'])} / 一条可落实的约束</span><p>{esc(item['rule'])}</p></div><div class="method-foot"><p>组合关系：{esc(item['combine'])}</p><a href="{esc(item['source'], quote=True)}" target="_blank" rel="noopener noreferrer">原始说明 ↗</a></div></div></details>''')
    categories = list(dict.fromkeys(item["category"] for item in data["architectures"]))
    filters = "".join(f'<button data-category="{esc(category, quote=True)}" aria-pressed="false">{esc(category)}</button>' for category in categories)
    recipes = []
    for item in data["recipes"]:
        tags = "".join(f'<span>{esc(method)}</span>' for method in item["methods"])
        fields = "".join(f'<dt>{title}</dt><dd>{esc(item[key])}</dd>' for title, key in [("为什么这样组合", "reason"), ("关键边界", "boundary"), ("需要验证", "verify"), ("以后怎样演进", "later")])
        recipes.append(f'<article class="recipe"><span class="recipe-label">{esc(item["label"])}</span><h4>{esc(item["title"])}</h4><div class="method-tags">{tags}</div><dl>{fields}</dl></article>')
    stages = []
    for index, item in enumerate(data["stages"], 1):
        stages.append(f'<article class="stage"><span class="stage-number">{index:02d} /</span><h3>{esc(item["name"])}</h3><p>{esc(item["action"])}</p><p class="deliverable">产物：{esc(item["output"])}</p><p class="condition">通过条件：{esc(item["pass"])}</p><details><summary>验证与调整</summary><p>证据：{esc(item["evidence"])}</p><p>用途：{esc(item["value"])}</p><p>返回：{esc(item["back"])}</p></details></article>')
    guards = "".join(f'<tr><td>{esc(item["intent"])}</td><td>{esc(item["rule"])}</td><td>{esc(item["check"])}<small>{esc(item["limit"])}</small></td></tr>' for item in data["guards"])
    sources = [(item["name"] + " / " + item["en"], item["source"]) for item in data["architectures"]]
    sources.extend([
        ("Eric Evans / DDD Reference", data["architectures"][0]["source2"]),
        ("Michael Nygard / Documenting Architecture Decisions", "https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions"),
        ("Patterns of Enterprise Application Architecture / Optimistic Offline Lock", "https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html"),
        ("OpenAI 官方文档 / AGENTS.md 项目指令", "https://learn.chatgpt.com/docs/agent-configuration/agents-md")
    ])
    source_html = "".join(f'<li><span>{index:02d}</span><a href="{esc(url, quote=True)}" target="_blank" rel="noopener noreferrer">{esc(title)} ↗</a></li>' for index, (title, url) in enumerate(sources, 1))
    page = (PROJECT / "src/page.html").read_text(encoding="utf-8")
    for name in ("comparison", "practice-notes", "workbench"):
        page = page.replace("@@" + name.upper() + "@@", (PROJECT / "src/partials" / (name + ".html")).read_text(encoding="utf-8"))
    compare_choices = "".join(f'<label><input type="checkbox" name="compare" value="{esc(item["id"], quote=True)}"><span>{esc(item["name"])}</span></label>' for item in data["architectures"])
    values = {"FILTERS": filters, "ARCHITECTURES": "\n".join(methods), "COMPARE_CHOICES": compare_choices, "RECIPES": "".join(recipes), "STAGES": "".join(stages), "GUARDS": guards, "SOURCES": source_html, "MAPHEIGHT": str(layout["height"]), "DATA": json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")}
    for key, value in values.items():
        page = page.replace("@@" + key + "@@", value)
    (WEB / "index.html").write_text(page, encoding="utf-8")
    (WEB / "guide.html").write_text(build_viewer.build(data, layout), encoding="utf-8")
    (PROJECT / "notes/sources.md").write_text("# 来源与证据范围\n\n整理日期：2026-10-23。下列原始资料用于概念核对；各方法的采用场景、组合、约束示例及流程是本次讨论的归纳与建议。\n\n" + "\n".join(f"- [{title}]({url})" for title, url in sources) + "\n\n原帖仅作为讨论起点，不作为开源库介绍或方案实测。所有笔记、数字人和工具工作台案例均为假设示例。\n", encoding="utf-8")
    print(f'Built handbook: {len(methods)} methods, {len(sources)} sources, guide {layout["width"]} x {layout["height"]}')


if __name__ == "__main__":
    build()
