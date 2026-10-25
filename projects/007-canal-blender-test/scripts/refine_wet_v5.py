import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import time

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from audit_v5 import file_hash, plain, snapshot, website_hashes
from audit_wet_v5 import BASELINE, SOURCE, compare


PROJECT_DIR = SCRIPT_DIR.parent
LEDGER = PROJECT_DIR / 'assets' / 'v5-wet-render-ledger.json'
PRESETS = {
    1: {
        'paving': [
            ('Weathering Partial wet ground coverage', 'From Min', .38),
            ('Weathering Partial wet ground coverage', 'From Max', .58),
            ('Weathering Partial thin water film', 'To Max', .95),
        ],
        'water': [
            ('Small reflection breakup', 'Strength', .34),
            ('Small reflection breakup', 'Distance', .035),
        ],
    },
    2: {
        'paving': [
            ('Weathering Partial wet ground coverage', 'From Min', .34),
            ('Weathering Partial wet ground coverage', 'From Max', .56),
            ('Weathering Partial thin water film', 'To Max', .95),
            ('Weathering Smooth rainwater coat', 'To Min', .22),
            ('Weathering Wet stone darkening amount', 1, .80),
        ],
        'water': [
            ('Small reflection breakup', 'Strength', .34),
            ('Small reflection breakup', 'Distance', .035),
        ],
    },
}


def ledger_update(attempt=None, result=None):
    lock_path = LEDGER.with_suffix('.lock')
    with lock_path.open('x', encoding='utf-8') as stream:
        stream.write(str(os.getpid()))
    try:
        ledger = json.loads(LEDGER.read_text(encoding='utf-8')) if LEDGER.exists() else {'experiment': 'V5 frozen geometry, wet surface parameters only', 'maximum_attempts': 2, 'attempts': []}
        if attempt is not None:
            if len(ledger['attempts']) >= 2:
                raise RuntimeError('This wet-surface experiment has already used its two permitted render attempts.')
            ledger['attempts'].append(attempt)
        else:
            ledger['attempts'][-1].update(result)
        temporary = LEDGER.with_suffix('.pending.json')
        temporary.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(LEDGER)
    finally:
        lock_path.unlink()


def change_materials(preset):
    changes = []
    for material_name in ('paving', 'paving_alt', 'Canal water'):
        material = bpy.data.materials[material_name]
        updates = preset['water' if material_name == 'Canal water' else 'paving']
        for node_name, input_name, value in updates:
            socket = material.node_tree.nodes[node_name].inputs[input_name]
            if socket.is_linked:
                raise RuntimeError('Refusing to edit an ineffective connected default: ' + node_name + '/' + str(input_name))
            previous = plain(socket.default_value)
            socket.default_value = value
            changes.append({'material': material_name, 'node': node_name, 'input': input_name, 'before': previous, 'after': plain(socket.default_value)})
    return changes


def run():
    parser = argparse.ArgumentParser(description='At most two low-resolution wet-surface previews; no geometry, lighting, world or website edits.')
    parser.add_argument('--preview', type=int, choices=(1, 2), required=True)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if options.preview not in PRESETS:
        parser.error('This preview has no reviewed parameter preset yet.')
    if LEDGER.exists() and len(json.loads(LEDGER.read_text(encoding='utf-8'))['attempts']) >= 2:
        raise RuntimeError('Render budget exhausted; no third preview is permitted.')
    label = f'{options.preview:02d}'
    candidate = PROJECT_DIR / 'artifacts' / f'rainy-canal-v5-wet-preview-{label}.blend'
    image_path = PROJECT_DIR / 'assets' / f'v5-wet-preview-{label}.png'
    stats_path = PROJECT_DIR / 'assets' / f'v5-wet-preview-{label}-stats.json'
    audit_path = PROJECT_DIR / 'assets' / f'v5-wet-preview-{label}-audit.json'
    if any(path.exists() for path in (candidate, image_path, stats_path, audit_path)):
        raise RuntimeError('Refusing to overwrite an earlier candidate, image, audit or statistics file.')
    started = time.perf_counter()
    baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
    source_hash = file_hash(SOURCE)
    if source_hash != baseline['snapshot']['sha256']:
        raise RuntimeError('Frozen source no longer matches the recorded baseline.')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    changes = change_materials(PRESETS[options.preview])
    scene = bpy.context.scene
    scene.render.resolution_x = 1104
    scene.render.resolution_y = 622
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(image_path)
    scene.cycles.samples = 40
    scene.cycles.adaptive_threshold = .025
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate), check_existing=True)
    audit = {
        'source': SOURCE.name,
        'candidate': candidate.name,
        'candidate_sha256': file_hash(candidate),
        'baseline': BASELINE.name,
        'performed_before_render': True,
        **compare(baseline, snapshot(candidate), website_hashes()),
    }
    with audit_path.open('x', encoding='utf-8') as stream:
        stream.write(json.dumps(audit, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    if not audit['passed']:
        raise RuntimeError('Frozen-scene constraint audit failed; refusing to spend a render attempt: ' + str(audit['violations']))
    preferences = bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type = 'OPTIX'
    preferences.get_devices()
    for device in preferences.devices:
        device.use = device.type == 'OPTIX'
    devices = [device.name for device in preferences.devices if device.use]
    if not devices:
        raise RuntimeError('Expected existing OptiX GPU was not available; not starting a slower unbounded render.')
    setup_seconds = time.perf_counter() - started
    ledger_update(attempt={'preview': options.preview, 'candidate': candidate.name, 'image': image_path.name, 'started_at': datetime.now(timezone.utc).isoformat(), 'status': 'started'})
    render_started = time.perf_counter()
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as error:
        ledger_update(result={'status': 'failed', 'error': str(error), 'finished_at': datetime.now(timezone.utc).isoformat()})
        raise
    render_seconds = time.perf_counter() - render_started
    source_unchanged = file_hash(SOURCE) == source_hash
    report = {
        'experiment': 'Frozen V5 geometry: wet pavement and water reflection only',
        'source': SOURCE.name,
        'source_sha256': source_hash,
        'source_unchanged': source_unchanged,
        'candidate': candidate.name,
        'candidate_sha256': file_hash(candidate),
        'image': image_path.name,
        'image_sha256': file_hash(image_path),
        'audit': audit_path.name,
        'constraint_audit_passed': audit['passed'],
        'complexity': audit['candidate_counts'],
        'material_parameter_changes': changes,
        'resolution': [1104, 622],
        'samples_max': 40,
        'devices': devices,
        'blender': bpy.app.version_string,
        'reopened_and_audited_before_render': True,
        'setup_seconds': round(setup_seconds, 3),
        'render_seconds': round(render_seconds, 3),
        'total_run_seconds': round(time.perf_counter() - started, 3),
        'limits': ['No geometry, light, camera, world, compositor, color management or non-wet material changes.', 'No new shader nodes, links, objects, lights, modifiers or textures.', 'Material parameters cannot reproduce absent reflected sources or missing background detail.'],
    }
    with stats_path.open('x', encoding='utf-8') as stream:
        stream.write(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    ledger_update(result={'status': 'complete', 'finished_at': datetime.now(timezone.utc).isoformat(), 'render_seconds': report['render_seconds']})
    if not source_unchanged:
        raise RuntimeError('Frozen source changed while rendering.')
    print('V5_WET_PREVIEW', json.dumps({'image': image_path.name, 'audit_passed': audit['passed'], 'render_seconds': report['render_seconds'], 'parameter_changes': len(changes)}), flush=True)


if __name__ == '__main__':
    run()
