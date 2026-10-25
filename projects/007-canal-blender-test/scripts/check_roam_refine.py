"""Bounded real-browser review of the independent street/cat refinement.

All outputs have a new prefix.  This script never writes the previous prototype.
The screenshots are visual evidence, not an automatic realism score.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time

from playwright.sync_api import sync_playwright


PROJECT = Path(__file__).resolve().parents[1]
ASSETS = PROJECT / "assets"
PREFIX = "roam-refine-01"


def write_report(name, value):
    (ASSETS / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def verify_preservation():
    baseline = json.loads((ASSETS / f"{PREFIX}-baseline.json").read_text(encoding="utf-8-sig"))
    results = []
    for entry in baseline["files"]:
        path = PROJECT / entry["path"]
        actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
        results.append({"path": entry["path"], "unchanged": actual == entry["sha256"], "sha256": actual})
    result = {"checked_utc": datetime.now(timezone.utc).isoformat(), "passed": all(item["unchanged"] for item in results), "count": len(results), "files": results}
    write_report(f"{PREFIX}-preservation.json", result)
    return result


def run(url, record=True):
    started = time.perf_counter()
    errors, observations, checks = [], {}, {}

    def state(page):
        return page.evaluate("window.__canalRoam.getState()")

    def monitor(page, label):
        def capture(error):
            errors.append(error)
            print("BROWSER_ERROR", json.dumps(error, ensure_ascii=False)[:5000], flush=True)
        page.on("pageerror", lambda error: capture({"page": label, "message": str(error), "stack": error.stack}))
        page.on("console", lambda message: capture({"page": label, "message": message.text, "location": message.location}) if message.type == "error" and "favicon" not in message.location.get("url", "") else None)
        page.set_default_timeout(15000)

    def ready(page):
        page.goto(url, wait_until="networkidle")
        page.locator("#start").click()
        page.wait_for_function("window.__canalRoam?.getState().loaded && window.__canalRoam.getState().frames > 3", timeout=90000)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--enable-webgl", "--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=d3d11"])
        desktop = browser.new_context(viewport={"width": 1152, "height": 720}, device_scale_factor=1)
        page = desktop.new_page()
        monitor(page, "desktop")
        ready(page)
        initial = state(page)
        print("DESKTOP_READY", json.dumps(initial, ensure_ascii=False), flush=True)
        observations["renderer"] = page.evaluate("""() => {
          const canvas=document.querySelector('#world canvas'); const gl=canvas.getContext('webgl2');
          const info=gl.getExtension('WEBGL_debug_renderer_info');
          return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        }""")
        print("RENDERER", observations["renderer"], flush=True)
        checks["independent_refine_entry"] = initial.get("version") == "refine-01"
        checks["same_scene_asset_no_expansion"] = initial["asset"] == "roam-02.glb"
        checks["loaded_cat_starts_on_walkable_street"] = initial["walkable"] and initial["mode"] == "follow"
        camera = initial.get("camera", {})
        camera_position = camera.get("position", {})
        checks["camera_is_closer_to_street_height"] = .6 < camera_position.get("y", 100) - initial["position"]["y"] < 1.8
        page.screenshot(path=str(ASSETS / f"{PREFIX}-desktop-a.png"))
        print("DESKTOP_A", state(page)["frames"], flush=True)

        # A second actual orbit, rather than a second rendered scene or image edit.
        page.mouse.move(610, 350)
        page.mouse.down()
        page.mouse.move(440, 350, steps=2)
        page.mouse.up()
        before = state(page)["frames"]
        page.wait_for_function("(n) => window.__canalRoam.getState().frames > n + 2", arg=before, timeout=20000)
        page.screenshot(path=str(ASSETS / f"{PREFIX}-desktop-b.png"))
        print("DESKTOP_B", state(page)["frames"], flush=True)
        observations["second_view"] = state(page)
        page.locator("#reset").click()
        page.keyboard.down("w")
        page.wait_for_function("(n) => window.__canalRoam.getState().distance > n + .15", arg=initial["distance"], timeout=20000)
        moved = state(page)
        print("DESKTOP_MOVED", moved["frames"], moved["distance"], flush=True)
        checks["keyboard_moves_cat_with_collision"] = moved["walkable"] and moved["distance"] > initial["distance"] + .1
        checks["walk_speed_bounded"] = 0 < moved.get("speed", 100) <= .74
        # Pause while a movement key is held.  Pausing must also clear momentum.
        page.locator("#pause").click()
        page.keyboard.up("w")
        paused = state(page)
        page.wait_for_timeout(350)
        still = state(page)
        checks["pause_stops_frames_and_position"] = paused["paused"] and paused["frames"] == still["frames"] and paused["position"] == still["position"]
        checks["pause_clears_velocity"] = all(abs(value) < 1e-8 for value in paused.get("velocity", {"missing": 1}).values())
        page.locator("#resume").click()
        page.wait_for_timeout(350)
        resumed = state(page)
        checks["resume_does_not_keep_held_input"] = resumed["position"] == paused["position"] and not resumed["paused"]
        page.locator("#reset").click()
        reset = state(page)
        checks["reset_restores_entry_and_zero_velocity"] = reset["position"] == initial["position"] and all(abs(v) < 1e-8 for v in reset["velocity"].values())
        page.locator("#tour").click()
        tour_start = state(page)
        page.wait_for_function("(n) => window.__canalRoam.getState().distance > n + .15", arg=tour_start["distance"], timeout=20000)
        tour = state(page)
        checks["sample_street_tour_moves"] = tour["tour"] and tour["walkable"] and -7 <= tour["position"]["x"] <= 3
        page.locator("#tour").click()
        page.locator("#reset").click()
        checks["desktop_no_horizontal_overflow"] = page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        print("DESKTOP_CONTROLS_CHECKED", state(page)["frames"], flush=True)

        if record:
            clip_start = state(page)
            clip_started = time.perf_counter()
            page.evaluate("""() => {
              const canvas = document.querySelector('#world canvas');
              const stream = canvas.captureStream(24);
              const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
              const recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 2200000});
              const chunks = [];
              window.__refineRecording = {recorder, stream, chunks, done: new Promise(resolve => {
                recorder.ondataavailable = e => {if(e.data.size) chunks.push(e.data);};
                recorder.onstop = async () => {
                  stream.getTracks().forEach(track => track.stop());
                  const blob = new Blob(chunks, {type: mimeType});
                  const reader = new FileReader();
                  reader.onloadend = () => resolve({data:reader.result, bytes:blob.size,mimeType});
                  reader.readAsDataURL(blob);
                };
              })};
              recorder.start(250);
            }""")
            page.locator("#tour").click()
            page.wait_for_timeout(6000)
            page.locator("#tour").click()
            page.wait_for_timeout(1000)
            clip = page.evaluate("async () => {window.__refineRecording.recorder.stop(); return await window.__refineRecording.done;}")
            clip_end = state(page)
            clip_seconds = time.perf_counter() - clip_started
            video_path = ASSETS / f"{PREFIX}-walk.webm"
            video_path.write_bytes(base64.b64decode(clip["data"].split(",", 1)[1]))
            checks["actual_canvas_walk_recorded"] = clip["bytes"] > 10000
            observations["clip"] = {"file": video_path.name, "bytes": clip["bytes"], "seconds_requested": 7, "seconds_wall": round(clip_seconds, 3), "rendered_frames": clip_end["frames"] - clip_start["frames"], "travel_metres": round(clip_end["distance"] - clip_start["distance"], 3), "mime_type": clip["mimeType"], "content": "Live browser canvas: walk along the sampled street, then settle. No generated/interpolated frames. Frame count describes this headless verification session only."}
            print("WALK_RECORDED", clip["bytes"], flush=True)

        observations["desktop"] = {"initial": initial, "moved": moved, "paused": paused, "tour": tour, "final": state(page)}
        desktop.close()
        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
        page = mobile.new_page()
        monitor(page, "mobile")
        ready(page)
        print("MOBILE_READY", state(page)["frames"], flush=True)
        mobile_initial = state(page)
        checks["mobile_loads_same_refined_entry"] = mobile_initial.get("version") == "refine-01" and mobile_initial["walkable"]
        button = page.locator('[data-move="forward"]').bounding_box()
        checks["mobile_controls_are_visible"] = page.locator("#touch-pad").is_visible() and button["x"] >= 0 and button["y"] + button["height"] <= 844
        page.mouse.move(button["x"] + button["width"] / 2, button["y"] + button["height"] / 2)
        page.mouse.down()
        try:
            page.wait_for_function("(n) => window.__canalRoam.getState().distance > n + .12", arg=mobile_initial["distance"], timeout=20000)
        finally:
            page.mouse.up()
        mobile_moved = state(page)
        checks["mobile_pointer_moves_cat"] = mobile_moved["walkable"] and mobile_moved["distance"] > mobile_initial["distance"] + .1
        checks["mobile_no_horizontal_overflow"] = page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.locator("#reset").click()
        page.wait_for_timeout(400)
        page.screenshot(path=str(ASSETS / f"{PREFIX}-mobile-qa.png"))
        observations["mobile"] = {"initial": mobile_initial, "moved": mobile_moved, "final": state(page)}
        mobile.close()
        browser.close()

    checks["no_browser_or_shader_errors"] = not errors
    preserved = verify_preservation()
    checks["all_previous_project_files_preserved"] = preserved["passed"]
    report = {"checked_utc": datetime.now(timezone.utc).isoformat(), "url": url, "passed": all(checks.values()), "checks": checks, "observations": observations, "errors": errors, "seconds": round(time.perf_counter() - started, 3), "scope": "Real Chromium, same existing scene, independent refinement entry. Functional assertions do not establish realism; two street views and a live canvas walk are visual review evidence. No Cycles render or full-scene expansion."}
    write_report(f"{PREFIX}-browser-check.json", report)
    print(json.dumps({"passed": report["passed"], "checks": checks, "errors": errors, "preserved_files": preserved["count"], "seconds": report["seconds"]}, ensure_ascii=False), flush=True)
    if not report["passed"]:
        raise RuntimeError("Refinement browser checks failed; see the new report.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8062/roam-refine.html")
    parser.add_argument("--no-video", action="store_true")
    parser.add_argument("--preservation-only", action="store_true")
    args = parser.parse_args()
    if args.preservation_only:
        result = verify_preservation()
        print(json.dumps({"passed": result["passed"], "count": result["count"]}))
        if not result["passed"]:
            raise SystemExit(1)
    else:
        run(args.url, not args.no_video)
