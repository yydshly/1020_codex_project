"""Publish selected research evidence without changing the original local records.

Run from any directory. This copies only the explicit evidence selection below and
docs/*.md into new research-evidence paths; it does not scan arbitrary user data,
execute downloaded code, or change historical scene/web files.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


PROJECT = Path(__file__).resolve().parents[1]
PUBLIC = PROJECT / "web" / "research-evidence"
CATALOG = PROJECT / "web" / "research-data" / "evidence-catalog.json"
OMITTED_PATH = "[local path omitted]"
OMITTED_SECRET = "[sensitive value omitted]"

# Explicit selection avoids unpublished assets, raw models, source downloads,
# incomplete intermediate reports, browser storage, and huge preservation dumps.
GROUPS = [
    ("reference-selection", "reference-options", "三种历史生成入口与预算选题记录；仅最终最简单方案进入实际建模，不作为三次建模能力对照", "assets", [
        "reference-options.json",
    ]),
    ("reference-alignment", "V1–V4", "早期建模、相机对齐与网页预览的本地记录", "assets", [
        "scene-checks.json", "render-stats.json", "render-v2-stats.json",
        "render-v3-stats.json", "render-v4-stats.json", "alignment-v4.json",
        "viewer-source-audit.json",
    ]),
    ("bounded-experiment", "V5", "V5 两张低清小样的差距计划、结论、预算账本及约束验证", "assets", [
        "v5-gap-plan.json", "v5-review.json", "v5-render-ledger.json",
        "v5-audit-self-check.json", "v5-preview-01-stats.json", "v5-preview-02-stats.json",
        "rainy-canal-v5-preview-01-constraint-audit.json",
        "rainy-canal-v5-preview-02-constraint-audit.json",
    ]),
    ("bounded-experiment", "V5-wet", "冻结 V5 几何的湿路与水面实验；保留未正式接受的结论和局限", "assets", [
        "v5-wet-review.json", "v5-wet-render-ledger.json", "v5-wet-postcheck.json",
        "v5-wet-preview-01-audit.json", "v5-wet-preview-02-audit.json",
        "v5-wet-preview-01-stats.json", "v5-wet-preview-02-stats.json",
    ]),
    ("scene-extension", "extension-01", "增量补齐场景的计划、验收与渲染预算", "assets", [
        "extension-plan.json", "extension-01-review.json", "extension-01-postcheck.json",
        "extension-01-audit.json", "extension-render-ledger.json", "extension-audit-self-check.json",
    ]),
    ("scene-extension", "boundary-02", "远景边界与地面衔接的结论、接缝核对及预算", "assets", [
        "boundary-02-review.json", "boundary-02-postcheck.json", "boundary-02-seam-check.json",
        "boundary-02-selfcheck.json", "boundary-02-render-ledger.json",
    ]),
    ("scene-extension", "landscape-03", "河道与远景自然衔接的结论、验收及预算", "assets", [
        "landscape-03-review.json", "landscape-03-postcheck.json", "landscape-03-audit.json",
        "landscape-03-selfcheck.json", "landscape-03-render-ledger.json",
    ]),
    ("roaming", "roam", "最初漫游及街道样板的浏览器和保护检查", "assets", [
        "roam-01-review.json", "roam-01-browser-check.json", "roam-01-preservation-check.json",
        "roam-refine-01-review.json", "roam-refine-01-browser-check.json",
        "shop-study-01-ground-check.json", "shop-study-01-browser-check.json",
        "shop-study-01-links-syntax-check.json",
    ]),
    ("cat-experiment", "cat-v3–v8", "猫形体、表情、头颈与步态阶段保留的最终检查；不等于真实感目标已达成", "assets", [
        "cat-v3-review.json", "cat-v3-asset-browser-check.json", "cat-v3-gait-check.json",
        "cat-v4-attention-visual-review.json", "cat-v4-attention-matrix-check.json",
        "cat-v5-face-final-browser-check.json", "cat-v5-preservation-final-check.json",
        "cat-v5-eye-landmarks-final.json", "cat-v6-face-final-visual-review.json",
        "cat-v6-face-final-browser-check.json", "cat-v6-face-matrix-check.json",
        "cat-v7-head-final-visual-review.json", "cat-v7-head-final-browser-check.json",
        "cat-v7-head-final-side-walking-check.json", "cat-v8-gait-final-visual-review.json",
        "cat-v8-gait-final-browser-check.json", "cat-v8-gait-check.json",
    ]),
    ("cat-experiment", "cat-v9–v12", "走跑、头尾与全身联动最终保留记录；检查通过不代表用户视觉认可", "assets", [
        "cat-v9-final-browser-check.json", "cat-v9-final-motion-quality-check.json",
        "cat-v9-surface-final-visual-review.json", "cat-v9-release-motion-quality-check.json",
        "cat-v9-preservation-check.json", "cat-v10-release-stable-motion-quality-check.json",
        "cat-v10-release-ui-check.json", "cat-v10-release-touch-check.json",
        "cat-v10-preservation-check.json", "cat-v11-secondary-motion-audit.json",
        "cat-v11-rig-probe-audit.json", "cat-v11-preservation-check.json",
        "cat-v12-liveness-audit.json", "cat-v12-motion-quality-check.json",
        "cat-v12-preservation-check.json",
    ]),
    ("cat-source-license", "cat-A", "成熟猫模型原始来源、作者署名及原包 CC BY 3.0 许可记录", "artifacts/cat-a", [
        "source/source-provenance.json", "source/original/86110 - LICENSE.html",
        "source/original-inspection.json", "materials/material-adaptation.json",
        "export-report.json", "glb-audit.json", "bake-verification.json",
        "rig-cycle-audit.json", "preservation-after.json",
    ]),
    ("cat-integration", "cat-A-street", "成熟猫模型接入街区与起停、站姿、联动验证", "artifacts", [
        "cat-a-street/validation.json", "cat-a-street/preservation-after.json",
        "cat-a-street-v2/validation.json", "cat-a-street-v2/idle-liveness-review.json",
        "cat-a-street-v2/idle-blend-review.json", "cat-a-street-v2/stand-pose-review.json",
        "cat-a-street-v2/stop-actual-rig-review.json", "cat-a-street-v2/preservation-after.json",
    ]),
]

SCENES = {
    "01": ("整街区空间补齐", ["ground-build-audit.json", "web-validation.json"], ["space-01-buildings-audit.json", "space-01-postcheck.json"]),
    "02": ("地形与全街材质统一", ["terrain-build-audit.json", "web-validation.json"], ["space-02-postcheck.json"]),
    "03": ("对岸门窗屋顶精修与门槛收口", ["roof-build-audit.json", "web-validation.json"], ["space-03-postcheck-final-r2.json"]),
    "04": ("对岸材质与光照修正", ["runtime-validation-final.json", "web-validation.json"], []),
    "05": ("可进出巷口小院与手动漫游", ["courtyard-build-audit.json", "courtyard-route-audit.json", "navigation-validation.json", "web-validation.json"], ["space-05-postcheck-final.json"]),
    "06": ("完整街区两岸背街和绿地", ["landscape-build-audit.json", "landscape-floor-check.json", "navigation-validation.json", "web-validation.json"], ["space-06-postcheck-final.json", "space-06-layout.json"]),
    "07": ("整街夜间灯具与窗光", ["lamps-module-validation.json", "runtime-validation-final.json", "web-validation.json"], []),
    "08": ("房屋组团重排与院落通达", ["buildings-build-audit.json", "ground-build-audit.json", "ground-navigation-validation.json", "navigation-validation-final.json", "runtime-validation-final-r2.json", "web-validation.json"], ["space-08-postcheck-final.json", "space-08-layout.json"]),
    "09": ("全区视觉统一与材质校正", ["landscape-module-validation.json", "runtime-validation-accepted.json", "visual-direction.json", "web-validation.json"], []),
    "10": ("房屋轮廓差异与有用途的外围地块", ["build-validation.json", "buildings-build-audit.json", "navigation-validation.json", "plots-module-validation.json", "runtime-validation-final.json", "scene-validation-final.json", "visual-direction.json", "web-validation.json"], ["space-10-layout.json"]),
    "11": ("外围远景自然衔接与最终阴影修正", ["landscape-module-validation.json", "runtime-validation-accepted.json", "runtime-validation-final-r2.json", "shadow-validation-final.json", "visual-direction.json", "web-validation.json"], []),
}

REVISION_NOTES = {
    "assets/reference-options.json": (
        "reference-selection-recovery",
        "公开整理时恢复的初始、高复杂度及最终采用图来源与哈希；不改写原始实验结果。",
    ),
    "artifacts/scene-space-11/runtime-validation-accepted.json": (
        "historical-intermediate",
        "历史中间验收（03:21）；其后存在 final-r2 与最终阴影复核，不作为 SPACE11 最新结论。",
    ),
    "artifacts/scene-space-11/runtime-validation-final-r2.json": (
        "final-geometry-runtime",
        "SPACE11 最终完整几何与运行验收 r2（03:28）；后续阴影修正另见 shadow-validation-final。",
    ),
    "artifacts/scene-space-11/shadow-validation-final.json": (
        "final-shadow-followup",
        "SPACE11 最终阴影修正复核，几何与通行检查沿用完整 r2 证据。",
    ),
    "artifacts/scene-space-11/web-validation.json": (
        "final-browser-review",
        "SPACE11 最终浏览器观察与视觉验收记录。",
    ),
}

SECRET_KEYS = {
    "password", "passwd", "pwd", "apikey", "accesskey", "secretkey", "secret",
    "accesstoken", "refreshtoken", "idtoken", "bearertoken", "authorization",
    "cookie", "cookies", "sessioncookie", "credentials", "privatekey",
    "clientsecret", "authtoken", "oauth", "token",
}
DETAIL_KEYS = {
    "vertices", "vertexpositions", "positions", "indices", "normals", "uvs",
    "faces", "rawgeometry", "geometryarrays", "samples", "points", "grid",
    "support", "raftimes", "frames", "shoulders", "surfacecells",
}
BASELINE_KEYS = {"preservedfiles", "baselinefiles", "filehashes", "originalfiles", "protectedfiles"}
WINDOWS_PATH = re.compile(r"(?<![A-Za-z0-9])(?:file:/+)?[A-Za-z]:[\\/][^\n\r`\"<>|]*")
POSIX_PATH = re.compile(r"(?<![A-Za-z0-9:/])(?:/(?:Users|home|tmp|private|mnt|workspace|root)/|/var/folders/)[^\n\r`\"<>|]*")
UNC_PATH = re.compile(r"(?<!\\)\\\\[A-Za-z0-9_.-]+\\[^\n\r`\"<>|]*")
URL = re.compile(r"https?://[^\s<>\"`]+")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def sensitive_key(key: str) -> bool:
    c = canonical(key)
    return c in SECRET_KEYS or c.endswith(("password", "apikey", "clientsecret", "privatekey"))


class Sanitizer:
    def __init__(self) -> None:
        self.counts: Counter = Counter()
        self.omissions: list[dict] = []

    def text(self, value: str) -> str:
        # Protect genuine source URLs while sanitizing text around them. Query
        # credentials in a URL are redacted rather than considered attribution.
        urls = []

        def protect_url(match):
            url = match.group()
            clean = re.sub(r"([?&](?:token|api_key|access_token|password|secret)=)[^&#\s]*", r"\1[redacted]", url, flags=re.I)
            if clean != url:
                self.counts["sensitive_url_parameters"] += 1
            urls.append(clean)
            return f"@@EVIDENCE_URL_{len(urls)-1}@@"

        out = URL.sub(protect_url, value)
        root = str(PROJECT).replace("\\", "/")
        # Exact project prefix conversion works in prose and path-valued keys.
        pattern = re.compile(r"(?:file:/+)?" + re.escape(root).replace("/", r"[\\/]") + r"[\\/]?", re.I)
        out, count = pattern.subn("", out)
        self.counts["project_absolute_paths_to_relative"] += count
        if count:
            # Normalize path separators only on path-looking fragments, leaving
            # Markdown and literal escapes elsewhere unchanged.
            out = re.sub(r"(?:artifacts|assets|docs|scripts|tests|web)(?:\\[^\s`\"<>|]+)+", lambda m: m.group().replace("\\", "/"), out)
        for pattern in (WINDOWS_PATH, POSIX_PATH, UNC_PATH):
            out, count = pattern.subn(OMITTED_PATH, out)
            self.counts["nonproject_absolute_paths_omitted"] += count
        out, count = re.subn(r"(?i)((?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*)[^\s,;`\"<>]+", r"\1[sensitive value omitted]", out)
        self.counts["sensitive_text_assignments"] += count
        for i, url in enumerate(urls):
            out = out.replace(f"@@EVIDENCE_URL_{i}@@", url)
        return out

    def omit_array(self, value: list, path: str, reason: str) -> dict:
        # Conclusions, failure counts, and up to 30 explicitly failed samples
        # remain readable; raw frame-by-frame data stay in local originals.
        failures = [x for x in value if isinstance(x, dict) and any(x.get(k) is False for k in ("passed", "pass", "ok", "valid", "walkable", "clear", "matched"))]
        self.omissions.append({"field": path, "reason": reason, "original_items": len(value), "explicit_failure_items": len(failures)})
        result = {
            "_public_excerpt": True,
            "_reason": reason,
            "_original_item_count": len(value),
            "_original_data_retained_locally": True,
            "_explicit_failure_item_count": len(failures),
            "_first_item": self.walk(value[0], path + "[first]") if value else None,
            "_last_item": self.walk(value[-1], path + "[last]") if len(value) > 1 else None,
        }
        if failures:
            result["_explicit_failures"] = [self.walk(x, path + "[failure]") for x in failures[:30]]
            result["_additional_failure_items_retained_locally"] = max(0, len(failures) - 30)
        return result

    def walk(self, value, path: str = "$", key: str = ""):
        if isinstance(value, str):
            return self.text(value)
        if isinstance(value, dict):
            if canonical(key) in BASELINE_KEYS and len(value) > 24:
                self.omissions.append({"field": path, "reason": "large preservation hash inventory", "original_items": len(value)})
                return {"_public_excerpt": True, "_original_item_count": len(value), "_reason": "large preservation hash inventory; aggregate checks retained in report", "_original_data_retained_locally": True}
            result = {}
            for k, v in value.items():
                safe_key = self.text(str(k))
                if safe_key in result:
                    # Several redacted machine paths must not silently collapse
                    # distinct evidence fields into a single dictionary entry.
                    base_key, number = safe_key, 2
                    while safe_key in result:
                        safe_key = f"{base_key} [entry {number}]"
                        number += 1
                if sensitive_key(str(k)):
                    result[safe_key] = OMITTED_SECRET
                    self.counts["sensitive_fields_omitted"] += 1
                else:
                    result[safe_key] = self.walk(v, path + "." + safe_key, str(k))
            return result
        if isinstance(value, list):
            c = canonical(key)
            if c in DETAIL_KEYS and len(value) > 24:
                return self.omit_array(value, path, "large per-point/frame/geometry array")
            if len(value) > 128:
                return self.omit_array(value, path, "long repeated evidence array")
            return [self.walk(x, path + f"[{i}]") for i, x in enumerate(value)]
        return value


def selection():
    chosen = []
    for path in sorted((PROJECT / "docs").glob("*.md")):
        chosen.append((path.relative_to(PROJECT).as_posix(), "documentation", path.stem, "阶段说明原文；与对应验收报告一起阅读"))
    for category, stage, description, base, files in GROUPS:
        chosen.extend((f"{base}/{name}", category, stage, description) for name in files)
    for number, (description, reports, assets) in SCENES.items():
        chosen.extend((f"artifacts/scene-space-{number}/{name}", "scene-validation", f"SPACE{number}", description + "：构建或运行验收证据") for name in reports)
        chosen.extend((f"assets/{name}", "scene-validation", f"SPACE{number}", description + "：布局或独立实体验收证据") for name in assets)
    if len({x[0] for x in chosen}) != len(chosen):
        raise RuntimeError("Duplicate evidence selection")
    return chosen


def status_summary(data):
    if not isinstance(data, dict):
        return {}
    result = {}
    for key in ("passed", "stage", "scope", "limitations", "timing_scope", "reference_origin"):
        if key in data and not isinstance(data[key], dict):
            result[key] = data[key]
    for group in ("result", "decision", "constraints"):
        section = data.get(group)
        if isinstance(section, dict):
            for key in ("accepted_as_final", "promoted_to_website", "preferred_review_candidate", "stop_reason", "low_resolution_render_attempts", "render_attempt_limit"):
                if key in section:
                    result[f"{group}.{key}"] = section[key]
    checks = data.get("checks")
    if isinstance(checks, dict):
        result["check_counts"] = {"true": sum(v is True for v in checks.values()), "false": sum(v is False for v in checks.values()), "other": sum(not isinstance(v, bool) for v in checks.values())}
        result["failed_checks"] = [k for k, v in checks.items() if v is False]
    return result


def self_check():
    s = Sanitizer()
    sample = {"path": str(PROJECT / "assets" / "reference.png"), "outside": r"D:\private\person\secret.txt", "posix": "/home/user/private.txt", "link": "https://github.com/sixtysevenlf/dsh-blender-plugin", "token_count": 1580, "api_key": "never-publish", "samples": [{"passed": i != 4, "n": i} for i in range(40)]}
    out = s.walk(sample)
    assert out["path"] == "assets/reference.png"
    assert out["outside"] == out["posix"] == OMITTED_PATH
    assert out["link"] == sample["link"] and out["token_count"] == 1580
    assert out["api_key"] == OMITTED_SECRET
    assert out["samples"]["_explicit_failure_item_count"] == 1
    assert out["samples"]["_explicit_failures"][0]["n"] == 4
    assert s.text("https://example.com/item?token=private") == "https://example.com/item?token=[redacted]"


def assert_no_local_paths(value, source: str):
    # Inspect decoded JSON strings/keys; serialized relative backslashes are
    # escaped twice and must not be mistaken for UNC network paths.
    if isinstance(value, dict):
        for key, item in value.items():
            assert_no_local_paths(key, source)
            assert_no_local_paths(item, source)
    elif isinstance(value, list):
        for item in value:
            assert_no_local_paths(item, source)
    elif isinstance(value, str):
        for forbidden in (WINDOWS_PATH, POSIX_PATH, UNC_PATH):
            if forbidden.search(URL.sub("", value)):
                raise RuntimeError(f"Unsanitized local path remains in {source}")


def main():
    self_check()
    chosen = selection()
    missing = [rel for rel, *_ in chosen if not (PROJECT / rel).is_file()]
    if missing:
        raise FileNotFoundError("Missing selected evidence: " + ", ".join(missing))
    entries = []
    originals = {}
    for rel, category, stage, description in chosen:
        source = PROJECT / rel
        raw = source.read_bytes()
        originals[rel] = digest(raw)
        text = raw.decode("utf-8-sig")
        sanitizer = Sanitizer()
        suffix = source.suffix.lower()
        if suffix == ".json":
            public_data = sanitizer.walk(json.loads(text))
            public_text = json.dumps(public_data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
            summary = status_summary(public_data)
            kind = "json-reference-options" if source.name == "reference-options.json" else "json-report" if "layout" not in source.stem else "json-layout"
        else:
            public_text = sanitizer.text(text)
            summary = {}
            kind = "markdown-document" if suffix == ".md" else "html-license"
        public_bytes = public_text.encode("utf-8")
        # Audit actual public text independently of the recursive walker. URLs
        # are exempt only as sources, not local filesystem paths.
        assert_no_local_paths(public_data if suffix == ".json" else public_text, rel)
        dest = PUBLIC / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(public_bytes)
        if suffix == ".json":
            json.loads(dest.read_text(encoding="utf-8"))
        revision_role, revision_note = REVISION_NOTES.get(rel, ("retained-evidence", ""))
        entries.append({
            "id": re.sub(r"[^a-z0-9]+", "-", rel.lower()).strip("-"),
            "source_path": rel,
            "public_url": "research-evidence/" + quote(rel, safe="/"),
            "category": category,
            "stage": stage,
            "kind": kind,
            "description": description + ("；" + revision_note if revision_note else ""),
            "revision_role": revision_role,
            "revision_note": revision_note,
            "source_sha256": digest(raw),
            "public_sha256": digest(public_bytes),
            "source_bytes": len(raw),
            "public_bytes": len(public_bytes),
            "sanitized": True,
            "content_changed": raw != public_bytes,
            "sanitization": {"changes": {k: v for k, v in sanitizer.counts.items() if v}, "omissions": sanitizer.omissions},
            "status_summary": summary,
        })
    changed = [rel for rel, sha in originals.items() if digest((PROJECT / rel).read_bytes()) != sha]
    if changed:
        raise RuntimeError("Original evidence changed during packaging: " + ", ".join(changed))
    catalog = {
        "schema_version": 1,
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "title": "007 研究证据归档",
        "scope": "Public research publication. Selected sanitized evidence copies; all original local evidence remains unchanged. Deployment status is verified and recorded separately.",
        "notes": [
            "本目录是研究材料的公开副本索引，不是所有原始工程文件的备份；原始报告仍保存在 source_path。",
            "sanitized=true 表示经过路径与敏感字段净化；content_changed 和双 SHA 可识别是否与源文件逐字一致。",
            "大规模逐帧、逐点、几何与保护哈希数组以带原数量的摘要替代；摘要字段含 _public_excerpt。保留明确失败样本数量及最多 30 项明细，完整细节仍在原始本地报告。",
            "JSON 原有结论、checks、失败项和 limitations 优先保留；自动验收通过不表示猫真实感、参考图对齐或最终视觉目标已经达成。",
            "V5 和湿面实验仍保留 accepted_as_final=false 等原结论。render_seconds 不含诊断、试验和人工复核总耗时。",
            "猫 A 的来源与许可单列；源站帖子原媒体的溯源另见 research-media/source/provenance.json。本包不复制源帖全文。",
            "未包含 Blender/GLB 原模型、完整 baseline 快照、账号缓存、原始模型下载包或未选入的中间失败报告。",
            "文档正文中的 assets/、artifacts/、web/ 等反引号路径是原项目根目录下的证据位置，不应相对归档 docs 目录自动改成链接；可通过本索引 source_path 查找对应公开副本。",
            "SPACE11 的 accepted 报告作为历史中间记录保留；最终组合是 runtime-validation-final-r2、shadow-validation-final 与 web-validation。",
            "三种历史生成入口已恢复并追加选题来源记录；实际建模选择最终最简单一档，其他两张仅为入口方案，不增加47个实验条目，也不构成三个复杂度的建模实测。",
            "本轮资料用于公开研究发布；原始报告中 local-only 或当时缺口说明按历史保留，当前恢复与发布说明另行追加，不把旧失败或未接受结果追认为成功。",
        ],
        "selection_policy": "All docs/*.md including current publication explanations; recovered reference-options provenance; explicit V1–V5/wet/extension review and render ledgers; retained final cat checks and source license; final available SPACE01–11 build/runtime/navigation/web evidence. Accepted/final revisions preferred over earlier drafts. Historical conclusions remain intact.",
        "validation": {"original_source_files_unchanged": True, "all_json_parse": True, "no_local_absolute_paths_in_public_text": True, "sanitizer_self_checks": True},
        "counts": {"files": len(entries), "by_kind": dict(Counter(x["kind"] for x in entries)), "by_category": dict(Counter(x["category"] for x in entries)), "source_bytes": sum(x["source_bytes"] for x in entries), "public_bytes": sum(x["public_bytes"] for x in entries), "excerpted_fields": sum(len(x["sanitization"]["omissions"]) for x in entries)},
        "entries": entries,
    }
    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    # Verify catalog destinations and the bytes actually written, not just memory.
    for entry in catalog["entries"]:
        data = (PUBLIC / entry["source_path"]).read_bytes()
        assert digest(data) == entry["public_sha256"]
    print(json.dumps({"catalog": CATALOG.relative_to(PROJECT).as_posix(), "counts": catalog["counts"], "validation": catalog["validation"]}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
