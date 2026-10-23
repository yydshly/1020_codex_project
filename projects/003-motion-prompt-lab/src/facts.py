import hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[1]
paths=["README.md","projects/001-evening-companion/project.json","projects/002-ai-content-toolkit/project.json","projects/002-ai-content-toolkit/README.md"]
sources=[{"path":p,"sha256":hashlib.sha256((REPO/p).read_bytes()).hexdigest(),"url":"https://github.com/yydshly/1020_codex_project/blob/main/"+p,"scope":"Local working-tree content; URL may not yet include uncommitted changes."} for p in paths]
facts=[
 {"id":"F1","claim":"项目名称为 GitHub 项目研究集，组织原理理解、运行验证与 Web 演示。","source":"README.md","quote":"记录日常发现的优秀 GitHub 项目：从理解原理、运行验证，到改造实践与 Web 演示。","frames":[0,1199]},
 {"id":"F2","claim":"001 研究 cyber-xiaowan，并以图片陪伴和桌宠作为过渡阶段参考。","source":"projects/001-evening-companion/project.json","quote":"cyber-xiaowan · AI 女友的过渡阶段参考","frames":[240,479]},
 {"id":"F3","claim":"002 是六个 AI 内容工具的原理与实践，包含 Kokoro、DigUp、Podcastfy。","source":"projects/002-ai-content-toolkit/README.md","quote":"这六个项目覆盖素材查找、资料研究、语音合成、视频制作和播客制作。","frames":[0,719]},
 {"id":"F4","claim":"研究条目仍为研究中，不等于所有工具已完成本机实测。","source":"projects/002-ai-content-toolkit/README.md","quote":"安装体验、中文效果、运行速度和实际费用尚未实测。","frames":[240,959]},
 {"id":"F5","claim":"002 包含研究说明、来源记录、实验计划和 Web 演示。","source":"projects/002-ai-content-toolkit/README.md","quote":"版本与证据清单","verified_paths":["projects/002-ai-content-toolkit/README.md","projects/002-ai-content-toolkit/notes/sources.json","projects/002-ai-content-toolkit/notes/07-experiments.md","projects/002-ai-content-toolkit/web/index.html"],"frames":[720,959]},
 {"id":"F6","claim":"片尾仓库地址为 github.com/yydshly/1020_codex_project。","source":"README.md","quote":"https://yydshly.github.io/1020_codex_project/","corroboration":"scripts/projects.py REPO constant","frames":[960,1199]}
]
for fact in facts:
    assert fact["quote"] in (REPO/fact["source"]).read_text(encoding="utf-8"),fact
    for p in fact.get("verified_paths",[]): assert (REPO/p).is_file(),p
data={"sources":sources,"facts":facts,"editorial_copy":["收藏之后，理解开始。","开源项目，也值得认真研究。","让项目有来处，也有去处。","沿着问题，把工具看明白。","把结论，交还给证据。","来源可追溯","理解有结构","验证有边界","打开仓库，继续研究。"],"editorial_note":"这些是原创叙事文案、分类标签或行动号召，不是产品功能、测量结果或用户评价。画面编号、时间码、英文阶段标签为设计元信息。","scope":"事实核对读取本地文件，不把本地未发布内容表述为在线可用。"}
(ROOT/"notes/facts.json").write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("Verified six claims against local source files.")
