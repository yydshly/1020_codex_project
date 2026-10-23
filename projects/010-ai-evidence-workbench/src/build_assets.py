"""Generate source explanations, templates and guide; optional Pillow PNG export."""
from pathlib import Path
from html import escape
import json
import re
from build_guide import build_guide

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
ASSETS = ROOT / "assets"


def main():
    ASSETS.mkdir(exist_ok=True)
    (WEB / "templates").mkdir(exist_ok=True)
    source_guide = json.loads((ROOT / "src/source-guide.json").read_text(encoding="utf-8"))["sources"]
    rows_html = []
    for source in source_guide:
        cells = f'<td><a href="{escape(source["url"], quote=True)}" target="_blank" rel="noopener noreferrer">{escape(source["name"])} ↗</a><small class="source-kind">{escape(source["kind"])}</small></td>'
        for key, label in [("collected_from", "信息从哪里来"), ("observe", "供我们观察什么"), ("followup", "后续怎么处理")]:
            cells += f'<td data-label="{label}">{escape(source[key])}</td>'
        rows_html.append("            <tr>" + cells + "</tr>")
    page_path = WEB / "index.html"
    page = page_path.read_text(encoding="utf-8")
    page, count = re.subn(r'(?<=<!-- SOURCE-GUIDE:START -->).*?(?=<!-- SOURCE-GUIDE:END -->)', lambda _: "\n" + "\n".join(rows_html) + "\n            ", page, flags=re.S)
    if count != 1:
        raise ValueError("Expected exactly one generated source guide block")
    page_path.write_text(page, encoding="utf-8")
    build_guide(source_guide)

    sources = {"schema_version":1,"scope":"AI 与效率工具","reviewed_at":"2026-10-23","note":"起步入口与分工建议；不表示每篇文章均可靠。具体产品官网按任务补充。", "sources":[
        {"id":"S01","name":"目标产品官方资料","url":"","role":"功能、价格、版本和限制","status":"起步保留"},
        {"id":"S02","name":"小众软件","url":"https://www.appinn.com/","role":"发现工具与替代品","status":"起步保留"},
        {"id":"S03","name":"少数派","url":"https://sspai.com/","role":"筛选实测、横评、长期体验与工作流","status":"起步保留"},
        {"id":"S04","name":"V2EX","url":"https://www.v2ex.com/","role":"问题与反例","status":"起步保留"},
        {"id":"S05","name":"Show HN","url":"https://news.ycombinator.com/show","role":"海外新项目与讨论","status":"起步保留"},
        {"id":"S06","name":"项目 Issues / 支持论坛","url":"","role":"复现与修复状态","status":"按需加入"},
        {"id":"S07","name":"Buzzing","url":"https://www.buzzing.cc/","role":"海外讨论与项目的中文导读，追溯原文核验","status":"备用"},
        {"id":"S08","name":"NewsNow","url":"https://newsnow.busiyi.world/","role":"跨平台热度，与原站及其他热榜去重","status":"移出默认清单，按需使用"},
        {"id":"S09","name":"今日热榜","url":"https://tophub.today/","role":"广泛热榜，与 NewsNow 用途重叠","status":"移出默认清单，按需使用"},
        {"id":"S10","name":"SoPilot 起爆帖","url":"https://sopilot.net/zh/hot-tweets","role":"X 升温讨论与内容选题时机","status":"运营时启用"}
    ]}
    guide_by_id = {source["id"]: source for source in source_guide}
    for source in sources["sources"]:
        if source["id"] in guide_by_id:
            source.update({key: guide_by_id[source["id"]][key] for key in ("kind", "collected_from", "observe", "followup", "verification")})
    evidence = {"schema_version":1,"note":"空白模板，不包含已验证证据；请填写后再使用。已核对原文只确认原文这样说，不代表内容已证实。", "records":[], "record_fields":{
        "id":"证据唯一编号", "topic":"工具、版本、事件或研究问题", "claim":"原文的具体声明或观察，避免写成无条件事实", "evidence_type":"官方声明 / 独立实测 / 用户反馈 / 本人测试", "source_id":"来源池编号；新来源先登记", "source_url":"原始链接", "author":"作者或发布者", "source_location":"可选：原文段落、表格或时间位置", "published_at":"发布日期，未知则留空", "accessed_at":"实际读取时间", "version":"适用版本，未知则留空", "conditions":"测试输入、设备、套餐、样本数和已知限制", "origin_evidence_id":"转载引用哪条证据；原创可填自身编号；不明则留空", "read_status":"未读正文 / 已核对原文", "verification_status":"待验证 / 本人已测试；与读过原文分开", "related_evidence_ids":"矛盾、支持或新版本关联的证据编号数组"}}
    decision = {"schema_version":1,"note":"判断与底层证据分开记录。不要把模型推断当作独立实测。", "decisions":[], "decision_fields":{
        "id":"判断编号", "task":"实际任务及约束", "conclusion":"推荐与取舍", "evidence_ids":"所引用的证据编号数组", "applicable_conditions":"结论的适用条件", "uncertainties":"未确认、冲突或缺失的证据", "next_test":"最小验证步骤与通过条件", "updated_at":"本次更新日期"}}
    for filename, data in [("sources.json", sources), ("evidence.json", evidence), ("decision.json", decision)]:
        (WEB / "templates" / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Generated 7 source explanations, comprehensive guide and 3 starter templates.")


if __name__ == "__main__":
    main()
