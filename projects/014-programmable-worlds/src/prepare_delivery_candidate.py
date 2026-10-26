"""Prepare pending delivery records from actual reports. Never publishes or accepts."""

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "notes/delivery-candidate"
WINDOW_MODEL = "819b849b252ff22970c66e6349cf9eb4f470ad1ec775260e355ab2480c7da227"
WINDOW_LIGHT = "80836c3f6f8529ef088136e9628e75e100a820760c3c27c148ade87356a01b34"
STATION_LIGHT = "62d64e53da7ccf5775e19ee4c704a2c3c105a7dafa9bae52fbc8cce8d889610c"
STATION_REVISION = "shipyard-oak2048-aftdeck-2"
STATION_MANIFEST = "web/shipyard-station/baked-r1/manifest-oak2048.json"
SPECS = {
    "source": ("notes/source-live-acceptance.d3d11.json", 15,
               ["original-renderer-live-track-decoded-in-ordinary-page", "page-drives-real-original-camera"], "04-headland-35"),
    "window": ("notes/canal-real-window-functional.d3d11.json", 13,
               ["drive-moves-actual-camera", "water-time-changes-actual-rendered-pixels", "task-owned-renderer-disposes"], "01-window"),
    "station": ("notes/station-functional.d3d11.json", 15,
                ["own-independent-geometry-and-complete-lighting", "real-passenger-launch-pause-holds",
                 "whole-approach-moors-and-opens-physical-gangway", "complete-boarding-and-departure-carries-camera",
                 "complete-shore-outcome-keeps-view-and-departs-boat", "own-independent-renderer-disposes"], "01-platform"),
    "hub": ("notes/hub-two-worlds-acceptance.d3d11.json", 13,
            ["original-window-and-independent-station-entry-map", "independent-station-three-actual-view-buttons",
             "independent-station-call-pause-and-redundant-visible-message",
             "two-actual-authored-worlds-have-independent-models-and-lighting",
             "single-live-world-through-source-window-independent-station-window"], None),
    "hub_mobile": ("notes/hub-two-worlds-mobile-acceptance.d3d11.json", 8,
                   ["mobile-station-actual-approach-reaches-docked-choices",
                    "single-live-independent-station-during-mobile-supplement"], None),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def visit(value):
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from visit(item)
    elif isinstance(value, list):
        for item in value:
            yield from visit(item)


def station_resource(report, require_accepted=False):
    for state in visit(report):
        light = state.get("lighting") or {}
        if not isinstance(light, dict):
            continue
        oak = next((x for x in light.get("sampling", []) if x.get("key") == "ShipyardGI_Station_oiled_oak"), {})
        if (state.get("sceneId") == "shipyard-station" and state.get("runtimeRevision") == STATION_REVISION
                and light.get("mode") == "full-diffuse" and light.get("bound", 0) > 0
                and light.get("model") == "shipyard-lightmapped.glb" and light.get("modelSha256") != WINDOW_MODEL
                and re.fullmatch(r"[0-9a-f]{64}", light.get("modelSha256") or "")
                and light.get("lightingFingerprint") == STATION_LIGHT
                and re.fullmatch(r"[0-9a-f]{64}", light.get("manifestSha256") or "")
                and str(light.get("manifestURL", "")).endswith("/shipyard-station/baked-r1/manifest-oak2048.json")
                and oak.get("samples") == 2048 and (not require_accepted or light.get("accepted") is True)):
            return state
    return None


def inspect_report(key, spec):
    name, minimum, required, capture = spec
    entry = {"path": name, "sha256": None, "minimumChecks": minimum, "requiredChecks": required}
    if capture:
        entry["capture"] = capture
    path = ROOT / name
    if not path.is_file():
        return entry, {"status": "pending", "reason": "Actual report has not been recorded"}, None
    report = json.loads(path.read_text(encoding="utf-8"))
    entry["sha256"] = digest(path)
    tests = report.get("tests", [])
    names = {t.get("name") for t in tests if t.get("passed") is True}
    passed = (report.get("status") == "passed" and not report.get("errors")
              and len(tests) >= minimum and all(t.get("passed") is True for t in tests)
              and set(required) <= names)
    reasons = []
    if not passed:
        reasons.append("Required actual checks are incomplete or failed")
    if key == "station":
        if report.get("scene") != "shipyard-station" or report.get("exporting") is not False:
            passed = False
            reasons.append("Only the full independent-station functional run is eligible")
        if station_resource(report) is None:
            passed = False
            reasons.append("Actual complete station model/lighting/oak2048 manifest identity is absent")
    if key.startswith("hub"):
        if report.get("candidateOverride") is not False:
            passed = False
            reasons.append("A candidate override is not a production-entry acceptance")
        if key == "hub" and station_resource(report, require_accepted=True) is None:
            passed = False
            reasons.append("Later official hub must show the visually accepted same-resource station")
        if key == "hub_mobile":
            samples = report.get("mobileLayoutSamples", [])
            required_layouts = {(width, phase) for width in [375, 390] for phase in ["idle", "docked"]}
            actual_layouts = {(x.get("requestedViewport", {}).get("width"), x.get("stage")) for x in samples}
            if not required_layouts <= actual_layouts:
                passed = False
                reasons.append("Actual idle and docked mobile layouts are incomplete")
    observation = {"status": "passed" if passed else "pending", "runId": report.get("runId"),
                   "actualStatus": report.get("status"), "checks": len(tests), "reasons": reasons,
                   "scope": report.get("scope"), "presentation": report.get("presentation")}
    return entry, observation, report


def prepare():
    reports, observations, actual = {}, {}, {}
    specs = dict(SPECS)
    hub_path = ROOT / specs["hub"][0]
    if hub_path.is_file():
        combined = json.loads(hub_path.read_text(encoding="utf-8"))
        layouts = {(x.get("requestedViewport", {}).get("width"), x.get("stage"))
                   for x in combined.get("mobileLayoutSamples", [])}
        if {(width, stage) for width in [375, 390] for stage in ["idle", "docked"]} <= layouts:
            specs["hub_mobile"] = (specs["hub"][0], specs["hub"][1],
                                   ["mobile-station-actual-approach-reaches-docked-choices",
                                    "single-live-world-through-source-window-independent-station-window"], None)
    for key, spec in specs.items():
        reports[key], observations[key], actual[key] = inspect_report(key, spec)
    station_identity = {"sceneId": "shipyard-station", "modelSha256": None, "lightingFingerprint": STATION_LIGHT,
                        "runtimeRevision": STATION_REVISION, "manifestSha256": None,
                        "giManifest": {"path": STATION_MANIFEST, "sha256": None}}
    functional_state = station_resource(actual["station"])
    if functional_state:
        light = functional_state["lighting"]
        station_identity.update(modelSha256=light["modelSha256"], lightingFingerprint=light["lightingFingerprint"],
                                manifestSha256=light["manifestSha256"], runtimeRevision=functional_state["runtimeRevision"],
                                giManifest={"path": STATION_MANIFEST, "sha256": light["manifestSha256"]})
        hub_state = station_resource(actual["hub"], require_accepted=True)
        if hub_state and any(hub_state["lighting"].get(field) != light.get(field)
                             for field in ["modelSha256", "lightingFingerprint", "manifestSha256"]):
            observations["hub"]["status"] = "pending"
            observations["hub"].setdefault("reasons", []).append("Official hub resources differ from the complete functional run")
    if station_identity["modelSha256"] == WINDOW_MODEL:
        raise RuntimeError("Old city model cannot identify the independent second scene")
    visual_name = "notes/visual-acceptance-independent.md"
    visual_path = ROOT / visual_name
    visual = {"path": visual_name, "sha256": digest(visual_path) if visual_path.is_file() else None,
              "status": "pending", "sceneIds": ["canal-street", "shipyard-station"]}
    identities = {"window": {"sceneId": "canal-street", "modelSha256": WINDOW_MODEL, "lightingFingerprint": WINDOW_LIGHT},
                  "station": station_identity}
    generated = datetime.now(timezone.utc).isoformat()
    guide = {"schema": "programmable-worlds-final-guide-v1", "status": "pending", "generatedAt": generated,
             "sceneIds": ["canal-street", "shipyard-station"], "reports": reports, "visual": visual,
             "identities": identities, "observations": observations,
             "notes": "Pending candidate only. This script never accepts artwork, publishes files or changes delivery status. "
                      "Station identity is taken only from an actual full station-functional report. Old shared-story/hub "
                      "composites, capture-only previews and CPU checks cannot accept the second work. Pin final visual, "
                      "mobile and explicit production hub evidence, then review before creating notes/guide-final-evidence.json. "
                      "Functional accepted=false is preserved: final visual judgement follows that run; the later official hub "
                      "must report accepted=true for the same model, light, runtime revision and actual manifest SHA."}
    delivery = {"schema": "programmable-worlds-delivery-v3", "status": "pending", "recorded_at": generated,
                "display_timezone": "Asia/Shanghai", "production_delivery_status_unchanged": "scope-reopened",
                "artwork_quality_accepted": False, "independent_works_accepted": False,
                "sceneIds": guide["sceneIds"], "world_identities": identities,
                "reports": {key: {**reports[key], **observations[key]} for key in reports},
                "visual_review": visual, "guide_evidence": "notes/delivery-candidate/guide-final-evidence.template.json",
                "acceptance_pending": ["Final station full functional evidence", "Independent two-world visual judgement",
                                       "Actual production source/window/station/window lifecycle", "Actual station mobile idle/docked layouts",
                                       "Pinned final guide evidence and final entry review"],
                "history": {"scope_correction": "notes/scope-correction-20261024.md",
                            "previous_delivery_record": "notes/delivery-acceptance.json",
                            "old_shared_story_counts_as_second_work": False},
                "execution_policy": {"hidden_own_windows_only": True, "desktop_input_used": False,
                                     "user_tab_navigated": False, "visible_entry_auto_launched": False},
                "evidence_policy": "Pending metadata preparation only. Each report keeps its actual status/run/hash. "
                                   "Functional and visual acceptance remain separate: do not alter the full functional report's "
                                   "accepted=false or replay both journeys merely to turn that value true. Final external visual SHA "
                                   "and the later production hub's accepted=true must bind the same resources. Historical source/window "
                                   "success does not transfer acceptance to the independent station."}
    OUT.mkdir(parents=True, exist_ok=True)
    for name, value in [("guide-final-evidence.template.json", guide), ("delivery-acceptance.v3.template.json", delivery)]:
        (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return observations


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    print(json.dumps({"status": "pending", "scope": "CPU metadata only; production files untouched", "reports": prepare()}, ensure_ascii=False))
