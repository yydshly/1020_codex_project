import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from audit_landscape_extension import BASELINE, SOURCE, compare, preserved_file_changes, snapshot
from audit_v5 import file_hash, website_hashes
from extend_boundary import probe_edges, probe_local_connections
from extend_scene import check_routes


PROJECT_DIR = SCRIPT_DIR.parent
ASSETS = PROJECT_DIR / 'assets'
CANDIDATE = PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-03.blend'
LEDGER = ASSETS / 'landscape-03-render-ledger.json'
STATS = ASSETS / 'landscape-03-stats.json'
CAMERAS = ('EXT_Review_Overview', 'EXT_Review_ReverseRear')
PREFIX = 'EXT_L03_'


def write_json(path, value, replace=False):
    with path.open('w' if replace else 'x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')


def read_baseline():
    result = json.loads(BASELINE.read_text(encoding='utf-8'))
    if file_hash(SOURCE) != result['snapshot']['sha256']:
        raise RuntimeError('The frozen extension-02-final source has changed.')
    if preserved_file_changes(result['preserved_files']):
        raise RuntimeError('A preserved artifact or asset has changed.')
    if website_hashes() != result['websites']:
        raise RuntimeError('The website changed since this round began.')
    return result


def protected_rays():
    points = [(coordinate_x, coordinate_y) for coordinate_x in (-20, -18, -14, -11, -7, 0, 7, 10, 13) for coordinate_y in (-23, -20, -17, -13, -10, -6, -1, 2, 6, 8, 11)]
    points.extend([(30, 5.7), (43, 6), (39, -15), (56, -15), (77, -15), (19, 4), (36, 4), (45, -13), (67, -13)])
    scene = bpy.context.scene
    graph = bpy.context.evaluated_depsgraph_get()
    result = []
    for coordinate_x, coordinate_y in points:
        hit, position, normal, face_index, obj, matrix = scene.ray_cast(graph, Vector((coordinate_x, coordinate_y, 100)), Vector((0, 0, -1)), distance=200)
        result.append({'xy': [coordinate_x, coordinate_y], 'hit': hit, 'object': obj.name if hit else None, 'height': float(position.z) if hit else None})
    return result


def compare_protected(before, after):
    differences = []
    for previous, current in zip(before, after):
        same_hit = previous['hit'] == current['hit'] and previous['object'] == current['object']
        same_height = not previous['hit'] or (current['hit'] and abs(previous['height'] - current['height']) < .0001)
        if not same_hit or not same_height:
            differences.append({'before': previous, 'after': current})
    return {'sample_count': len(before), 'passed': not differences, 'differences': differences, 'scope': 'Vertical visibility samples over the existing block and background buildings/trees, not full geometric overlap certification.'}


def build():
    import landscape_banks
    import landscape_hills

    outputs = (CANDIDATE, STATS, LEDGER, ASSETS / 'landscape-03-audit.json', ASSETS / 'landscape-03-diagnostics.json')
    if any(path.exists() for path in outputs):
        raise RuntimeError('Existing landscape output will not be replaced.')
    baseline = read_baseline()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    protected_before = protected_rays()
    original_names = set(bpy.data.objects.keys())
    banks = landscape_banks.build()
    hills = landscape_hills.build()
    bpy.context.view_layer.update()
    protected = compare_protected(protected_before, protected_rays())
    routes = check_routes()
    holes = probe_edges()
    supports = probe_local_connections()
    channel = landscape_banks.check_channel()
    diagnostics = {'protected_scene_samples': protected, 'existing_route_sampling': routes, 'previous_hole_rays': holes, 'previous_local_support': supports, 'channel': channel}
    if not protected['passed']:
        raise RuntimeError('New landscape covers a protected scene sample: ' + str(protected['differences']))
    if not all(route['sampled_checks_passed'] for route in routes['routes'].values()):
        raise RuntimeError('New landscape obstructs an existing sampled route.')
    if not all(result['hit'] for result in holes.values()):
        raise RuntimeError('A previously closed background hole is exposed.')
    if not all(result['hit'] and .83 <= result['height'] <= .86 for result in supports.values()):
        raise RuntimeError('A previous local ground connection changed.')
    if not channel['passed']:
        raise RuntimeError('The new banks failed their continuous water-channel check.')
    added = [obj for obj in bpy.data.objects if obj.name not in original_names]
    vertices = sum(len(obj.data.vertices) for obj in added if obj.type == 'MESH')
    if len(added) > 6 or vertices > 6000 or any(obj.type != 'MESH' or not obj.name.startswith(PREFIX) for obj in added):
        raise RuntimeError('Only six bounded, low-detail landscape meshes may be added.')
    bpy.context.scene.render.filepath = str(ASSETS / 'landscape-03-manual.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(CANDIDATE), check_existing=True)
    candidate_snapshot = snapshot(CANDIDATE)
    audit = compare(baseline, candidate_snapshot, website_hashes(), preserved_file_changes(baseline['preserved_files']))
    write_json(ASSETS / 'landscape-03-audit.json', audit)
    write_json(ASSETS / 'landscape-03-diagnostics.json', diagnostics)
    if not audit['passed']:
        raise RuntimeError('Preservation audit failed: ' + str(audit['violations']))
    report = {
        'source': SOURCE.name,
        'candidate': CANDIDATE.name,
        'candidate_sha256': candidate_snapshot['sha256'],
        'source_objects_preserved': len(baseline['snapshot']['objects']),
        'additive_audit_passed': True,
        'added_counts': audit['added_counts'],
        'added_materials': audit['added_datablocks']['materials'],
        'banks': banks,
        'hills': hills,
        'review_cameras': list(CAMERAS),
        'rendered_previews': [],
        'scope': 'Additive bank contours and background relief only. Existing river, roads, buildings, scene lighting and all older additions stay unchanged.',
        'river_limitation': 'New banks partially cover the original straight water corridor; this is visible shoreline variation, not excavation, rerouting or a reconstructed natural river.',
        'website_updated': False,
        'finished_world': False,
    }
    write_json(STATS, report)
    print('LANDSCAPE_BUILD', json.dumps({'candidate': CANDIDATE.name, 'added': audit['added_counts'], 'protected_samples': protected['passed'], 'channel': channel['passed'], 'renders': 0}), flush=True)


def render(count):
    baseline = read_baseline()
    report = json.loads(STATS.read_text(encoding='utf-8'))
    if not CANDIDATE.is_file() or file_hash(CANDIDATE) != report['candidate_sha256']:
        raise RuntimeError('The candidate differs from the audited build.')
    ledger = json.loads(LEDGER.read_text(encoding='utf-8')) if LEDGER.exists() else {'maximum_attempts': 2, 'candidate': CANDIDATE.name, 'candidate_sha256': report['candidate_sha256'], 'attempts': []}
    if ledger['candidate_sha256'] != report['candidate_sha256'] or len(ledger['attempts']) + count > 2:
        raise RuntimeError('Cannot change the reviewed candidate or exceed two render attempts.')
    preferences = bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type = 'OPTIX'
    preferences.get_devices()
    for device in preferences.devices:
        device.use = device.type == 'OPTIX'
    if not any(device.use for device in preferences.devices):
        raise RuntimeError('OptiX device unavailable; no render started.')
    bpy.ops.wm.open_mainfile(filepath=str(CANDIDATE))
    scene = bpy.context.scene
    scene.render.resolution_x = 1104
    scene.render.resolution_y = 622
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 32
    scene.cycles.adaptive_threshold = .03
    for unused in range(count):
        index = len(ledger['attempts'])
        path = ASSETS / f'landscape-03-preview-{index + 1:02d}.png'
        if path.exists():
            raise RuntimeError('Refusing to replace an existing low-resolution preview.')
        scene.camera = bpy.data.objects[CAMERAS[index]]
        scene.render.filepath = str(path)
        attempt = {'camera': CAMERAS[index], 'image': path.name, 'status': 'started', 'started_utc': datetime.now(timezone.utc).isoformat(), 'resolution': [1104, 622], 'samples': 32, 'candidate_sha256': report['candidate_sha256']}
        ledger['attempts'].append(attempt)
        write_json(LEDGER, ledger, replace=LEDGER.exists())
        started = time.perf_counter()
        try:
            bpy.ops.render.render(write_still=True)
        except Exception as error:
            attempt.update(status='failed', error=str(error))
            write_json(LEDGER, ledger, replace=True)
            raise
        attempt.update(status='complete', seconds=round(time.perf_counter() - started, 3), sha256=file_hash(path))
        write_json(LEDGER, ledger, replace=True)
        report['rendered_previews'] = [entry for entry in ledger['attempts'] if entry['status'] == 'complete']
        write_json(STATS, report, replace=True)
    report['old_files_unchanged_after_render'] = not preserved_file_changes(baseline['preserved_files'])
    report['website_unchanged_after_render'] = website_hashes() == baseline['websites']
    report['saved_candidate_unchanged_after_render'] = file_hash(CANDIDATE) == report['candidate_sha256']
    write_json(STATS, report, replace=True)
    if not all(report[field] for field in ('old_files_unchanged_after_render', 'website_unchanged_after_render', 'saved_candidate_unchanged_after_render')):
        raise RuntimeError('A post-render preservation check failed.')
    print('LANDSCAPE_RENDER', json.dumps({'completed': len(report['rendered_previews']), 'attempted': len(ledger['attempts']), 'candidate': CANDIDATE.name, 'old_files_unchanged': report['old_files_unchanged_after_render']}), flush=True)


def run():
    parser = argparse.ArgumentParser(description='Additive landscape pass with a separately enforced two-preview budget.')
    parser.add_argument('action', choices=('build', 'render'))
    parser.add_argument('--count', type=int, choices=(1, 2), default=2)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if options.action == 'build':
        build()
    else:
        render(options.count)


if __name__ == '__main__':
    run()
