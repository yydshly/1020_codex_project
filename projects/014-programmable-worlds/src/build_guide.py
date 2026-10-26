"""Build the final guide from pinned independent-scene evidence. Standard library only."""

from html import escape
import base64
import argparse
import hashlib
import json
import re
from pathlib import Path
import unicodedata
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 1800, 4830


parser = argparse.ArgumentParser(description="Generate the research guide only from pinned final evidence; never starts a renderer.")
parser.add_argument("--evidence", default="notes/guide-final-evidence.json", help="Project-relative final evidence manifest")
parser.add_argument("--check", action="store_true", help="Validate the final evidence without writing SVG output")
parser.add_argument("--output-dir", help="Optional project-relative candidate output folder; default writes both published SVG copies")
args = parser.parse_args()


def project_file(name):
    path = (ROOT / name).resolve()
    if not path.is_relative_to(ROOT.resolve()) or not path.is_file():
        raise RuntimeError("Evidence file missing or outside the project: " + str(name))
    return path


def pinned_file(entry):
    path = project_file(entry["path"])
    expected = entry.get("sha256", "")
    if not re.fullmatch(r"[0-9a-f]{64}", expected or "") or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise RuntimeError("Final evidence checksum is absent or changed: " + entry["path"])
    return path


def passed_report(key):
    entry = EVIDENCE["reports"][key]
    if key == "station" and ("story" in entry["path"] or "source-export" in entry["path"]):
        raise RuntimeError("A shared old-story report or unbaked production preview cannot accept the second work")
    report = json.loads(pinned_file(entry).read_text(encoding="utf-8"))
    tests = report.get("tests", [])
    required = entry.get("requiredChecks", [])
    names = {test.get("name") for test in tests if test.get("passed") is True}
    if (report.get("status") != "passed" or report.get("errors")
            or len(tests) < max(1, entry.get("minimumChecks", 1))
            or not all(test.get("passed") is True for test in tests)
            or not required or not set(required) <= names):
        raise RuntimeError("Incomplete final functional evidence: " + entry["path"])
    for source in report.get("sourceReports", []):
        pinned_file(source)
    return report


def actual_capture(report, key):
    entry = EVIDENCE["reports"][key]
    capture = next(item for item in report["captures"] if item["name"] == entry["capture"])
    path = project_file(capture.get("video") or capture.get("canvas") or capture.get("page"))
    if path.suffix.lower() != ".png":
        raise RuntimeError("Invalid actual runtime capture")
    data = path.read_bytes()
    if capture.get("sha256") and hashlib.sha256(data).hexdigest() != capture["sha256"]:
        raise RuntimeError("Actual runtime capture checksum changed")
    return capture, base64.b64encode(data).decode("ascii")


def visit_dicts(value):
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from visit_dicts(item)
    elif isinstance(value, list):
        for item in value:
            yield from visit_dicts(item)


def validate_production_hub(report):
    # Explicit False is the current runner's production contract. Missing,
    # null, zero and candidate True are not evidence of a public entry run.
    if report.get("candidateOverride") is not False:
        raise RuntimeError("Final homepage evidence must be an explicit production run")
    hub_maps = [item for item in visit_dicts(report)
                if isinstance(item.get("entries"), list) and len(item["entries"]) == 3]
    if not any(item.get("candidateOverride") is False
               and "runtime/source-live.html" in str(item["entries"][0])
               and "canal-real/index.html?experience=window" in str(item["entries"][1])
               and "shipyard-station/index.html" in str(item["entries"][2])
               for item in hub_maps):
        raise RuntimeError("Final homepage evidence must use the three actual production entries, without a candidate override")
    if report.get("peakObservedLiveSceneDocuments") != 1 or report.get("peakObservedHeavyScenes") != 1:
        raise RuntimeError("Final homepage must release each world before starting the next")


def validate_mobile_hub(report):
    # A combined desktop/mobile run and a pinned focused supplement are both
    # eligible. Individual failed layout assertions cannot supply a group.
    records = [report]
    for source in report.get("sourceReports", []):
        records.append(json.loads(pinned_file(source).read_text(encoding="utf-8")))
    covered = set()
    for record in records:
        validate_production_hub(record)
        for test in record.get("tests", []):
            layout = test.get("evidence")
            if test.get("passed") is not True or not isinstance(layout, dict):
                continue
            requested, actual = layout.get("requestedViewport", {}), layout.get("actualViewport", {})
            width, stage = requested.get("width"), layout.get("stage")
            if width not in [375, 390] or stage not in ["idle", "docked"]:
                continue
            name = "actual-{}-{}-independent-station-{}-controls-fit".format(actual.get("width"), actual.get("height"), stage)
            if test.get("name") != name:
                continue
            preview, buttons = layout.get("preview", {}), layout.get("buttons", [])
            if (abs(actual.get("width", 0) - width) > 1 or abs(actual.get("height", 0) - 844) > 1
                    or layout.get("parentOverflow") is not False or layout.get("previewOverflow") is not False
                    or layout.get("frame", {}).get("height", 0) < 519 or preview.get("height", 0) < 519
                    or layout.get("notice") or not buttons or layout.get("buttonIntersections") != []):
                raise RuntimeError("Final station mobile layout is clipped, overflowing or incomplete")
            for button in buttons:
                rect = button.get("rect", {})
                if (rect.get("left", -2) < -1 or rect.get("right", 9999) > preview.get("width", 0) + 1
                        or rect.get("top", -2) < -1 or rect.get("bottom", 9999) > preview.get("height", 0) + 1
                        or button.get("parentOverlap", 9999) >= .5):
                    raise RuntimeError("Final station mobile controls overlap the parent entry or viewport")
            usable = {button.get("id") for button in buttons if button.get("disabled") is False}
            required = {"pause", "reset", "callBoat"} if stage == "idle" else {"pause", "reset", "board", "stay"}
            if not required <= usable:
                raise RuntimeError("Final station mobile actions are not usable")
            if stage == "idle" and not {"shipyard", "platform", "hall"} <= {b.get("shot") for b in buttons if b.get("disabled") is False}:
                raise RuntimeError("Final station mobile viewpoints are absent")
            if stage == "docked" and not (layout.get("journey", {}).get("phase") == "docked" and layout["journey"].get("canChoose") is True):
                raise RuntimeError("Final mobile choices did not come from an actually docked boat")
            covered.add((width, stage))
    if covered != {(width, stage) for width in [375, 390] for stage in ["idle", "docked"]}:
        raise RuntimeError("Final station mobile evidence requires both actual idle/docked layouts at requested 375/390 widths")


def validate_station_chain(functional, hub, identity):
    # Functional capture precedes final visual review. Its accepted=False is
    # preserved; the later production hub confirms the reviewed same package.
    manifest_entry = identity["giManifest"]
    if manifest_entry.get("path") != "web/shipyard-station/baked-r1/manifest-oak2048.json":
        raise RuntimeError("Final station evidence must pin its actual oak2048 manifest")
    manifest = json.loads(pinned_file(manifest_entry).read_text(encoding="utf-8"))
    if (manifest.get("sceneId") != "shipyard-station" or manifest.get("lightingMode") != "full-diffuse"
            or manifest.get("runtimeAsset", {}).get("sha256") != identity["modelSha256"]
            or manifest.get("lightingFingerprint") != identity["lightingFingerprint"]
            or manifest_entry["sha256"] != identity.get("manifestSha256")
            or identity.get("runtimeRevision") != "shipyard-oak2048-aftdeck-2"):
        raise RuntimeError("Station functional, runtime and pinned GI identities disagree")
    groups = manifest.get("groups", [])
    oak_key = "ShipyardGI_Station_oiled_oak"
    if not any(g.get("key") == oak_key and g.get("samples") == 2048 for g in groups):
        raise RuntimeError("Final station manifest lacks the actual oak2048 integration")

    def matches(item, reviewed):
        light = item.get("lighting") or {}
        if not isinstance(light, dict):
            return False
        sample = next((x for x in light.get("sampling", []) if x.get("key") == oak_key), {})
        return (item.get("sceneId") == "shipyard-station" and item.get("runtimeRevision") == identity["runtimeRevision"]
                and light.get("mode") == "full-diffuse" and light.get("bound") == len(groups) > 0
                and light.get("model") == "shipyard-lightmapped.glb" and light.get("modelSha256") == identity["modelSha256"]
                and light.get("lightingFingerprint") == identity["lightingFingerprint"]
                and light.get("manifestSha256") == identity["manifestSha256"]
                and str(light.get("manifestURL", "")).endswith("/shipyard-station/baked-r1/manifest-oak2048.json")
                and sample.get("samples") == 2048 and (not reviewed or light.get("accepted") is True))

    if not any(matches(item, False) for item in visit_dicts(functional)):
        raise RuntimeError("Functional station report lacks the actual complete oak2048 resource identity")
    if not any(matches(item, True) for item in visit_dicts(hub)):
        raise RuntimeError("Production hub must confirm the visually accepted station with the same resource identity")


try:
    EVIDENCE = json.loads(project_file(args.evidence).read_text(encoding="utf-8"))
    if EVIDENCE.get("status") != "accepted":
        raise RuntimeError("Final evidence manifest is pending; independent second work remains unaccepted")
    if EVIDENCE.get("sceneIds") != ["canal-street", "shipyard-station"]:
        raise RuntimeError("The final guide must bind the two independent scene identities")
    visual = EVIDENCE["visual"]
    pinned_file(visual)
    if visual.get("status") != "accepted" or set(visual.get("sceneIds", [])) != {"canal-street", "shipyard-station"}:
        raise RuntimeError("Both independent scenes require a separate recorded visual judgement")
    identities = EVIDENCE["identities"]
    for key, scene_id in [("window", "canal-street"), ("station", "shipyard-station")]:
        identity = identities[key]
        if identity.get("sceneId") != scene_id:
            raise RuntimeError("Scene identity mismatch: " + key)
        for field in ["modelSha256", "lightingFingerprint"]:
            if not re.fullmatch(r"[0-9a-f]{64}", identity.get(field, "")):
                raise RuntimeError("Missing final model or lighting identity: " + key)
    if any(identities["window"][field] == identities["station"][field] for field in ["modelSha256", "lightingFingerprint"]):
        raise RuntimeError("A second label on the same model or light package is not an independent second work")
    REPORT = passed_report("source")
    WINDOW = passed_report("window")
    STATION = passed_report("station")
    HUB_CURRENT = passed_report("hub")
    HUB_MOBILE = passed_report("hub_mobile")
    validate_production_hub(HUB_CURRENT)
    validate_mobile_hub(HUB_MOBILE)
    validate_station_chain(STATION, HUB_CURRENT, identities["station"])
    CAPTURE, CAPTURE_DATA = actual_capture(REPORT, "source")
    WINDOW_CAPTURE, WINDOW_DATA = actual_capture(WINDOW, "window")
    STATION_CAPTURE, STATION_DATA = actual_capture(STATION, "station")
except (RuntimeError, KeyError, StopIteration, ValueError, TypeError) as error:
    parser.exit(2, "Final guide not generated: " + str(error) + "\n")

HUB_CURRENT_LINE = "原作、窗景与新车站的正式入口切换通过；切换需等待。"
if args.check:
    print(json.dumps({"status": "passed", "scope": "CPU evidence binding only; no renderer or visual judgement performed", "evidence": args.evidence,
                      "runs": {key: report["runId"] for key, report in [("source", REPORT), ("window", WINDOW), ("station", STATION), ("hub", HUB_CURRENT), ("hub_mobile", HUB_MOBILE)]}}, ensure_ascii=False))
    raise SystemExit(0)


INK = "#203c36"
MUTED = "#58736a"
PAPER = "#f2f1e8"
GREEN = "#2d6454"
AMBER = "#a16c32"
BLUE = "#3f6478"
parts = []


def add(s):
    parts.append(s)


def rect(x, y, w, h, fill="#fafaf5", stroke="#c9d4c8", rx=14):
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}"/>')


def txt(x, y, value, size=20, fill=INK, weight=400):
    add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}">{escape(value)}</text>')


def wrap(value, width, size):
    cap = width / size
    lines = []
    for paragraph in value.split("\n"):
        line, n = "", 0
        for token in re.findall(r"[A-Za-z0-9_.:/%×+\-]+|[^\x00-\x7F]|[ \t]+|.", paragraph):
            unit = sum(1 if unicodedata.east_asian_width(char) in "WF" else .56 for char in token)
            if n + unit > cap and line:
                lines.append(line.rstrip())
                line, n = "", 0
            line += token
            n += unit
        lines.append(line)
    return lines


def paragraph(x, y, value, width, size=20, leading=30, fill=INK, weight=400):
    lines = wrap(value, width, size)
    for i, line in enumerate(lines):
        txt(x, y + i * leading, line, size, fill, weight)
    return y + len(lines) * leading


def section(y, number, title, subtitle=""):
    txt(72, y, number, 17, GREEN, 700)
    txt(124, y + 2, title, 32, INK, 700)
    if subtitle:
        txt(124, y + 36, subtitle, 18, MUTED)


def label(x, y, value, color=GREEN, width=None):
    width = width or len(value) * 18 + 26
    rect(x, y - 22, width, 32, color, color, 6)
    txt(x + 12, y, value, 16, "#fff", 600)


def link(x, y, value, href, size=18):
    txt(x, y, value, size, GREEN, 500)
    width = sum(1 if unicodedata.east_asian_width(char) in "WF" else .56 for char in value) * size
    add(f'<a href="{escape(href, quote=True)}" target="_blank" aria-label="{escape(value, quote=True)}"><rect x="{x}" y="{y-size}" width="{width}" height="{size+8}" fill="#fff" fill-opacity="0" pointer-events="all"/></a>')


add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title desc">')
add('<title id="title">可编程世界：从源库航拍到自己的交互作品</title>')
add('<desc id="desc">包含 napali 页内完整实时原作、六类候选扩展，以及独立制作的运河老街窗景和旧船坞车站的实际画面。功能报告、双场景视觉判断和正式首页切换分别固定；旧共享场景的范围纠正继续保留。资料日期2026年10月25日。</desc>')
add('<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#8ca79b"/></marker><pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="#203c36" stroke-opacity=".025"/></pattern></defs>')
add('<g font-family="Segoe UI,Microsoft YaHei,PingFang SC,sans-serif">')
rect(0, 0, WIDTH, HEIGHT, PAPER, PAPER, 0)

txt(72, 66, "014 / CREATIVE SYSTEMS / 2026.10.25", 18, MUTED, 600)
txt(72, 131, "把想象写成世界，再从世界里创作", 52, INK, 700)
txt(72, 176, "原作页内完整运行并可驾驶；延伸为老街窗景，与另一座可以启程的船坞车站。", 25, MUTED)
label(72, 221, "来源事实", GREEN)
label(222, 221, "我们的分析", BLUE)
label(390, 221, "候选扩展", AMBER)
txt(580, 221, "两个独立空间：实际交互、完整光照与分别视觉复核", 19, GREEN)

section(286, "01", "来源是什么：一个被精调的海岸世界", "来源 / Leonxlnx/napali · 固定 commit 4afb7c3a… · MIT / Leon Lin")
rect(72, 343, 808, 558)
label(96, 380, "页内原作 · 海岬 35 秒", GREEN, 246)
add(f'<image x="96" y="402" width="760" height="460" href="data:image/png;base64,{CAPTURE_DATA}" preserveAspectRatio="xMidYMid meet"/>')
txt(96, 884, "实时流实测帧 / 1440 × 902 / 100% 完整原作", 18, MUTED)
rect(904, 343, 824, 558, "#e8eee5")
label(928, 380, "来源事实", GREEN)
paragraph(928, 423, "纳帕利海岸 + 预设无人机路径。地形、海水、泡沫、树木、天空与光照由代码生成。作者说明经过 13 轮开发，并用参考照片对比。", 770, 22, 32)
label(928, 550, "页内实时已验收", GREEN, 190)
paragraph(928, 594, f"普通浏览器直接显示并控制原作。{len(REPORT['tests'])} 项通过：播放、暂停、35 / 75 / 128 秒机位、自由驾驶、画质、重启及切换页面时释放。", 770, 22, 32)
paragraph(928, 723, "100% / 1440 × 902，实测原作约 2.52 帧/秒；30fps 是调度上限。33 段模板含 GLSL 逐字不变。", 770, 21, 31)
link(928, 831, "打开完整实时原作与驾驶 ↗", "http://127.0.0.1:8796/projects/014-programmable-worlds/web/runtime/source-live.html", 19)
txt(928, 864, "历史另存：17 个机位 / 32 项旧首页检查。", 19, MUTED)
add('<g transform="translate(0 340)">')
pipeline = ["海岸轮廓 / 引导数据", "地形 / 侵蚀 / 植被", "材质 / 海浪 / 天空", "时间 / 光照 / 镜头", "实时画面 / 离线影片"]
for i, name in enumerate(pipeline):
    x = 72 + i * 335
    rect(x, 594, 315, 62, "#203c36", "#203c36", 8)
    txt(x + 16, 633, name, 20, "#f5f2e5", 500)
    if i < len(pipeline) - 1:
        add(f'<path d="M{x+318} 625h13" stroke="#8ca79b" stroke-width="2" marker-end="url(#arrow)"/>')

section(718, "02", "我们借鉴什么：场景、镜头与交互可以持续复用", "我们的分析 / 这是一种制作方法，尚不是输入任意地点即可生成的通用产品")
insights = [
    ("场景复用", "同一个空间可以反复取景，让时间、天气与镜头产生新作品。"),
    ("艺术选择", "构图、颜色、节奏和参考需要反复判断；可控不等于自动好看。"),
    ("观众行动", "停留、改氛围、选路线、触发事件，让场景成为可体验的作品。"),
]
for i, (title, body) in enumerate(insights):
    x = 72 + i * 560
    rect(x, 777, 536, 165, "#e7eee5")
    txt(x + 22, 817, title, 25, GREEN, 700)
    paragraph(x + 22, 855, body, 487, 21, 31)
txt(72, 977, "表达优先：后续可按需要组合模型、图片与声音；无需把“全部代码生成”设为固定创作门槛。", 21, MUTED)

section(1042, "03", "可往哪走：六条候选扩展路径", "先选一个有感受的小样，明确它带来的体验，再增加功能与场景")
directions = [
    ("01  自己的风景", "雨巷、雪夜车站、漂浮岛屿。", "首个样例：小场景 + 三个取景点。", "个人价值：积累自己的视觉世界。"),
    ("02  世界的变化", "雨停前后、风与空气变化。", "首个样例：同构图的两种氛围。", "个人价值：用变化表达情绪。"),
    ("03  观众进入", "坐船、沿河散步、窗前停留。", "首个样例：一条可停下的有限路线。", "个人价值：从观看扩展为体验。"),
    ("04  空间中的故事", "漂来的信、亮灯的窗、等待的人。", "首个样例：一个选择、两种结果。", "个人价值：延续角色与故事系列。"),
    ("05  看不见的旅程", "水滴、植物内部、机器的流程。", "首个样例：一段有标记的解释。", "边界：另行校核知识与物理机制。"),
    ("06  创作工作台", "预设、调氛围、镜头编辑、导出。", "首个样例：参数可保存且可重现。", "个人价值：减少重复制作劳动。"),
]
for i, (title, *rows) in enumerate(directions):
    x = 72 + (i % 3) * 560
    y = 1100 + (i // 3) * 211
    rect(x, y, 536, 191)
    txt(x + 22, y + 39, title, 25, GREEN, 700)
    for j, row in enumerate(rows):
        paragraph(x + 22, y + 79 + j * 34, row, 491, 20, 28, MUTED if j == 2 else INK)

section(1592, "04", "两个延续作品：老街窗景与旧船坞车站", "不同的几何布局、主体模型、光照数据与互动流程；下图分别绑定真实运行报告")
concepts = [
    (72, "一扇窗外的世界", "窗边近景 / 雨后放晴 / 水面反射 / 三维观察", [
        ("场景", "木窗、布帘、茶杯与旧书；对岸店铺、砖石与云层形成纵深。"),
        ("行动", "在窗边观察，走到河岸、店铺或自由驾驶；水面持续变化。"),
        ("验收", f"当前网页 {len(WINDOW['tests'])} 项通过：机位、驾驶、水流、窄屏与释放。"),
        ("延续", "动态壁纸、环境音、专注与场景收藏，均待后续实现。"),
    ]),
    (916, "旧船坞的下一班船", "独立船坞车站 / 呼船靠泊 / 真实登船 / 留在站台", [
        ("场景", "门吊与修理船，宽运河、工业钢桥和拱顶候船厅另成空间。"),
        ("行动", "呼船约22秒，靠泊后沿栈桥上船，或留下目送32秒离站。"),
        ("验收", f"独立运行 {len(STATION['tests'])} 项通过；功能与双场景视觉分别判断。"),
        ("延续", "下一班、另一处目的地、归来与季节；先做好一次真实出发。"),
    ]),
]
for x, title, subtitle, rows in concepts:
    rect(x, 1652, 812, 364, "#e5ece6")
    txt(x + 26, 1697, title, 31, INK, 700)
    txt(x + 26, 1734, subtitle, 20, GREEN, 600)
    yy = 1777
    for name, body in rows:
        txt(x + 26, yy, name, 19, GREEN, 700)
        paragraph(x + 88, yy, body, 687, 19, 27)
        yy += 56

for x, title, data, report, capture, destination in [
    (72, "运河老街窗边 / 实际运行", WINDOW_DATA, WINDOW, WINDOW_CAPTURE, "canal-real/index.html?experience=window&giSet=r5&probes=1&streetProbes=1"),
    (916, "旧船坞车站 / 独立实际运行", STATION_DATA, STATION, STATION_CAPTURE, "shipyard-station/index.html"),
]:
    rect(x, 2038, 812, 550, "#fafaf5")
    txt(x + 26, 2071, title, 23, GREEN, 700)
    add(f'<image x="{x+26}" y="2090" width="760" height="460" href="data:image/png;base64,{data}" preserveAspectRatio="xMidYMid meet"/>')
    txt(x + 26, 2571, f"{capture['width']} × {capture['height']} / 实际运行画布", 17, MUTED)
    link(x + 455, 2571, "进入当前实时作品 ↗", f"http://127.0.0.1:8796/projects/014-programmable-worlds/web/{destination}", 17)

# The original sections keep their verified wrapping and internal spacing.
# Insert the two full-size evidence images above and shift the remaining map.
add('<g transform="translate(0 560)">')
section(2082, "05", "从意图到作品：动作、产物、通过条件与失败回路", "先把一个有限体验做完整；通过后再扩大世界、增加模型调用或接入外部数据")
stages = [
    ("1  定义体验", "选情绪、受众与观看方式", "一句话意图 + 范围清单", "知道观众应感到或做到什么", "避免功能代替创作目标"),
    ("2  选择参考", "定构图、颜色、材质、声音", "小型参考板 + 两张构图稿", "风格和主次一致，可作对照", "知道好看具体好在哪里"),
    ("3  建世界", "拆场景层、参数与固定布局", "可重复出现的小场景", "切换参数后空间不散架", "积累可复用场景规则"),
    ("4  排镜头", "安排移动、停留、事件与选择", "三个分镜 + 可见状态", "观众能理解变化及操作", "用镜头与互动组织表达"),
    ("5  验证体验", "对照质感、实际驾驶与暂停", "实时出帧 + 操作结果记录", "画面达标，驾驶与选择有效", "分清运行成功与体验有效"),
    ("6  发布交付", "整理署名、资源与静态入口", "可分享页面 + 原始来源", "链接可达，素材和边界明确", "让别人低门槛看见作品"),
    ("7  真实复用", "邀请体验，记录停留与再打开", "反馈 + 下一件小作品", "有人愿意再次体验或继续创作", "以真实使用决定投入"),
]
cols = [(96, 170, "阶段"), (288, 332, "动作"), (648, 335, "产物"), (1009, 335, "通过条件"), (1370, 325, "个人用途")]
rect(72, 2143, 1656, 48, GREEN, GREEN, 8)
for x, _, title in cols:
    txt(x, 2175, title, 19, "#fff", 600)
for i, row in enumerate(stages):
    y = 2207 + i * 90
    rect(72, y, 1656, 78, "#fafaf5" if i % 2 == 0 else "#e9eee5", "#d1dbcf", 8)
    for j, value in enumerate(row):
        x, width, _ = cols[j]
        paragraph(x, y + 30, value, width, 19, 27, GREEN if j == 0 else INK, 600 if j == 0 else 400)
rect(72, 2854, 1656, 74, "#f1e7d8", "#dbbea0", 8)
paragraph(96, 2884, "失败回路：画面不成立 → 回到 2 / 3 调参考与场景；看不懂或不会操作 → 回到 4；运行阻断 → 先修 5 再发布；无人愿意复用 → 回到 1 重新选体验。", 1604, 20, 29, "#7a5730")

section(2992, "06", "证据怎么分：真实画面、实际操作与延续价值", "视觉、功能与光照分别记录；此前一套老街被算成两作品的范围错误保留，不覆盖原始记录")
evidence = [
    (72, "来源事实", "原库与 MIT 许可、作者原图、README 与固定 commit 可追溯。", GREEN),
    (632, "当前实测与边界", f"原作 {len(REPORT['tests'])} 项、窗景 {len(WINDOW['tests'])} 项、独立车站 {len(STATION['tests'])} 项通过。{HUB_CURRENT_LINE}", GREEN),
    (1192, "候选价值", "陪伴、叙事、教学与工具复用仍需实际体验；没有付费或市场结论。", BLUE),
]
for x, title, body, color in evidence:
    rect(x, 3053, 536, 190)
    txt(x + 22, 3093, title, 25, color, 700)
    paragraph(x + 22, 3134, body, 490, 20, 29)

section(3288, "07", "如果以后做成产品，再补齐使用者与价值验证", "可选分支 / 本次先完成真实运行与画面质量，不预设经营或付费目标")
rect(72, 3348, 1656, 182, "#e7eee5")
paragraph(98, 3389, "人群与重复场景 → 发现渠道 → 竞品与替代方式 → 一次体验的价值样例 → 最小产品 → 域名与部署 → 真实交付与复用 → 成本与收费。", 1594, 24, 35, GREEN, 600)
paragraph(98, 3470, "先问：谁愿意再打开？替代品是什么？靠什么找到第一批体验者？需要什么设备与制作成本？没有这些证据，就保留为个人作品，继续小规模创作。", 1594, 21, 32, MUTED)

section(3594, "08", "对个人最有用的积累", "把每一轮的场景规则、参数、镜头和反馈保留下来，成为下一件作品的起点")
paragraph(72, 3670, "选方向：喜欢停留 → 继续窗景；喜欢探索与选择 → 继续车站。控投入：先小场景、有限镜头和可见结果。\n看问题：分别判断美术、叙事、交互、性能与真实复用。可迁移：参考选择、参数化场景、分镜节奏、浏览器验证与清晰署名。", 1654, 23, 35)
add('<path d="M72 3754H1728" stroke="#bdcbbf"/>')
link(72, 3792, "源库：github.com/Leonxlnx/napali", "https://github.com/Leonxlnx/napali")
link(720, 3792, "原帖：x.com/LexnLin/status/2113720560920428685", "https://x.com/LexnLin/status/2113720560920428685")
link(1510, 3792, "页内原作 ↗", "http://127.0.0.1:8796/projects/014-programmable-worlds/web/runtime/source-live.html")
txt(72, 3828, "来源细节与逐项链接见研究正文；相关作者作品 shanshui / paper-fox / golden-temple 是独立案例。", 18, MUTED)
txt(72, 3862, "研究快照 2026-10-25 / 固定 commit 4afb7c3a1aad3d0203193100305c46607134d0f5 / 三维作品与上游分开存放", 17, MUTED)
add("</g></g></g></svg>")

content = "\n".join(parts)
ET.fromstring(content)
if args.output_dir:
    candidate_dir = (ROOT / args.output_dir).resolve()
    if not candidate_dir.is_relative_to(ROOT.resolve()):
        parser.error("Candidate output must stay inside the project")
    outputs = [candidate_dir / "programmable-worlds-guide.svg"]
else:
    outputs = [ROOT / "assets/programmable-worlds-guide.svg", ROOT / "web/assets/programmable-worlds-guide.svg"]
for out in outputs:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(content, encoding="utf-8")
print(f"Generated final guide: {WIDTH} x {HEIGHT}, {len(content):,} characters")
print(json.dumps({"source_live_run": REPORT["runId"], "window_run": WINDOW["runId"], "station_run": STATION["runId"],
                  "hub_run": HUB_CURRENT["runId"], "visual": EVIDENCE["visual"]["path"], "scope_correction_preserved": "notes/scope-correction-20261024.md",
                  "embedded_actual_captures": [CAPTURE.get("video") or CAPTURE.get("canvas"), WINDOW_CAPTURE["canvas"], STATION_CAPTURE["canvas"]]},
                 ensure_ascii=False))
