"""Read-only additive space-01 verification. Never saves or renders a scene."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector


sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from audit_boundary_extension import snapshot
from audit_v5 import file_hash
from export_viewer import read_glb
from extend_scene import PLAN, check_routes, route_height

ROOT = SCRIPT_DIR.parent
SOURCE = ROOT / 'artifacts/rainy-canal-roam-02.blend'
CANDIDATE = ROOT / 'artifacts/rainy-canal-space-01.blend'
GLB = ROOT / 'web/models/space-01.glb'
OUTPUT = ROOT / 'assets/space-01-postcheck.json'
OLD_MANIFEST = ROOT / 'web/models/roam-02-manifest.json'
CORE_GROUPS = {'01 Cafe', '02 Bookshop', '03 Pottery shop', 'Bridge', 'Bridge railings', 'EXT_OppositeBuildings'}
VIEWS = {
    'opposite_bank': ((-4, -13.5, 2.5), (-4, 3, 3.0), 67),
    'rear_lane': ((10.9, 8, 2.5), (-10, 7.4, 2.5), 67),
    'stone_bridge': ((9.4, -6.1, 3.9), (-7, 1, 3), 67),
    'return_bridge': ((-18, -6.1, 3.0), (1, -6.1, 2.0), 67),
}


def route_samples():
    for name, waypoints in PLAN['routes'].items():
        points = []
        for start, end in zip(waypoints[:-1], waypoints[1:]):
            count = math.ceil(math.dist(start, end) / .28)
            points.extend([[start[a] + (end[a] - start[a]) * i / count for a in range(2)] for i in range(count)])
        points.append(waypoints[-1])
        for i, (point, next_point) in enumerate(zip(points[:-1], points[1:])):
            expected = route_height(name, point)
            direction = Vector((*[next_point[a] - point[a] for a in range(2)], route_height(name, next_point) - expected))
            if direction.length == 0:
                continue
            yield name, i, point, expected, direction


def width_probes():
    scene, deps = bpy.context.scene, bpy.context.evaluated_depsgraph_get()
    obstruction, unsupported = {}, {}
    for name, index, point, expected, direction in route_samples():
        lateral = Vector((-direction.y, direction.x, 0)).normalized()
        for side in (-.5, -.35, .35, .5):
            start = Vector((*point, expected)) + lateral * side
            key = f'{name}:{index}:{side}'
            hit, pos, normal, face, obj, matrix = scene.ray_cast(deps, start + Vector((0, 0, .25)), Vector((0, 0, -1)), distance=.6)
            if not hit or abs(pos.z - expected) > .17:
                unsupported[key] = {'route': name, 'point': list(start), 'side': side, 'object': obj.name if obj else None, 'actual_z': pos.z if hit else None}
            for height in (.4, 1.0, 1.65):
                hit, pos, normal, face, obj, matrix = scene.ray_cast(deps, start + Vector((0, 0, height)), direction.normalized(), distance=direction.length)
                if hit:
                    obstruction[key + ':' + str(height)] = {'route': name, 'point': list(start), 'side': side, 'height': height, 'object': obj.name}
    return {'obstructions': obstruction, 'unsupported': unsupported}


def view_rays():
    camera = bpy.context.scene.camera
    rays = {}
    if camera is not None:
        corners = camera.data.view_frame(scene=bpy.context.scene)
        left, right = min(v.x for v in corners), max(v.x for v in corners)
        bottom, top = min(v.y for v in corners), max(v.y for v in corners)
        z = corners[0].z
        rays['original_camera'] = [(camera.matrix_world.translation.copy(), (camera.matrix_world.to_quaternion() @ Vector((left + (right-left)*(x+.5)/48, bottom+(top-bottom)*(y+.5)/28, z))).normalized()) for y in range(28) for x in range(48)]
    for name, (origin, target, fov) in VIEWS.items():
        origin, target = Vector(origin), Vector(target)
        forward = (target-origin).normalized()
        right = forward.cross(Vector((0, 0, 1))).normalized()
        up = right.cross(forward).normalized()
        half = math.tan(math.radians(fov/2))
        rays[name] = [(origin.copy(), (forward+right*((2*(x+.5)/48-1)*half)+up*((2*(y+.5)/28-1)*half*28/48)).normalized()) for y in range(28) for x in range(48)]
    return rays


def ray_hits(rays):
    scene, deps = bpy.context.scene, bpy.context.evaluated_depsgraph_get()
    result = {}
    for name, values in rays.items():
        hits = []
        for origin, direction in values:
            hit, pos, normal, face, obj, matrix = scene.ray_cast(deps, origin, direction, distance=250)
            hits.append({'object': obj.name, 'distance': (pos-origin).length} if hit else None)
        result[name] = hits
    return result


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.output.exists():
        raise RuntimeError('Refusing to overwrite existing report: '+str(args.output))
    for path in (SOURCE, CANDIDATE, GLB):
        if not path.is_file():
            raise RuntimeError('Required artifact missing: '+str(path))
    started = time.perf_counter()
    old_manifest = json.loads(OLD_MANIFEST.read_text(encoding='utf-8'))
    before = snapshot(SOURCE)
    base_routes = check_routes()
    base_width = width_probes()
    rays = view_rays()
    base_hits = ray_hits(rays)
    after = snapshot(CANDIDATE)
    routes = check_routes()
    width = width_probes()
    hits = ray_hits(rays)
    checks = {}
    changes = {}
    additions = {}
    for category in ('objects', 'materials', 'node_groups'):
        previous, current = before[category], after[category]
        missing = sorted(previous.keys()-current.keys())
        changed = {name: [key for key in previous[name] if previous[name][key] != current[name].get(key)] for name in previous.keys() & current.keys() if previous[name] != current[name]}
        changes[category] = {'missing': missing, 'changed': changed}
        additions[category] = sorted(current.keys()-previous.keys())
        checks['old_'+category+'_preserved'] = not missing and not changed
    for category in ('worlds', 'view_layers'):
        checks[category+'_preserved'] = before[category] == after[category]
    old_groups, groups = before['locked_scene']['collections'], after['locked_scene']['collections']
    changes['collections'] = {'missing': sorted(old_groups.keys()-groups.keys()), 'changed': [name for name in old_groups.keys() & groups.keys() if old_groups[name] != groups[name]]}
    additions['collections'] = sorted(groups.keys()-old_groups.keys())
    checks['old_collections_preserved'] = not changes['collections']['missing'] and not changes['collections']['changed']
    checks['old_layer_flags_preserved'] = all(after['layer_collection_flags'].get(name) == flags for name, flags in before['layer_collection_flags'].items())
    checks['source_hash_matches_previous_manifest'] = file_hash(SOURCE) == old_manifest['integrated_blend']['sha256']
    checks['old_glb_hash_matches_previous_manifest'] = file_hash(ROOT/'web/models/roam-02.glb') == old_manifest['sha256']
    checks['original_routes_still_522_samples'] = sum(row['sample_count'] for row in routes['routes'].values()) == 522
    checks['original_routes_pass'] = all(row['sampled_checks_passed'] for row in routes['routes'].values())
    checks['old_route_test_count_unchanged'] = {key: row['sample_count'] for key,row in base_routes['routes'].items()} == {key: row['sample_count'] for key,row in routes['routes'].items()}
    checks['only_independent_new_collections'] = all(set(after['objects'][name]['collections']).issubset(additions['collections']) for name in additions['objects'])
    checks['new_objects_use_space01_prefix'] = all(name.startswith('SPACE01_') for name in additions['objects'])
    wider = {key: {'baseline_count': len(base_width[key]), 'candidate_count': len(width[key]), 'new': [row for name,row in width[key].items() if name not in base_width[key]], 'resolved_count': len(base_width[key].keys()-width[key].keys())} for key in width}
    core = {name for name,obj in before['objects'].items() if CORE_GROUPS.intersection(obj['collections'])}
    added = set(additions['objects'])
    occlusion = {}
    for name, values in base_hits.items():
        masked = [(i, prior, now) for i,(prior,now) in enumerate(zip(values,hits[name])) if prior and prior['object'] in core and now and now['object'] in added and now['distance']+.03 < prior['distance']]
        core_rays = sum(prior is not None and prior['object'] in core for prior in values)
        occlusion[name] = {'rays': len(values), 'original_core_surface_rays': core_rays, 'newly_masked_core_rays': len(masked), 'fraction_of_original_core_rays': round(len(masked)/core_rays,4) if core_rays else None, 'occluding_objects': dict(Counter(now['object'] for _,prior,now in masked)), 'occluded_original_objects': dict(Counter(prior['object'] for _,prior,now in masked))}
    document, glb_counts = read_glb(GLB)
    checks['glb_header_and_content_readable'] = bool(document)
    checks['read_only_source_hash_unchanged'] = before['sha256'] == file_hash(SOURCE)
    checks['read_only_candidate_hash_unchanged'] = after['sha256'] == file_hash(CANDIDATE)
    report = {'schema_version':1, 'checked_utc':datetime.now(timezone.utc).isoformat(), 'passed':all(checks.values()), 'checks':checks, 'source':{'file':SOURCE.name,'sha256':before['sha256'],'counts':before['counts']}, 'candidate':{'file':CANDIDATE.name,'sha256':after['sha256'],'counts':after['counts']}, 'old_data_changes':changes, 'added_data':additions, 'routes':routes, 'additional_width_diagnostics':wider, 'view_occlusion_diagnostics':occlusion, 'glb':{'file':GLB.name,'sha256':file_hash(GLB),'bytes':GLB.stat().st_size,**glb_counts}, 'seconds':round(time.perf_counter()-started,3), 'limitations':['No scene mutation, save or render is performed. Existing bytes are independently checked against the prior roam-02 manifest.','522 original centerline samples and 0.48m-wide body rays are route regressions, not a full-area navigation or physics guarantee.','Additional 0.7m/1m-width tests and sparse visual rays are diagnostics, not automatic failures: newly placed wall bases and trims may intentionally cover old surfaces.','No original-camera pixel comparison, reference fidelity judgment, browser material/rendering review or arbitrary viewpoint certification is performed.']}
    with args.output.open('x',encoding='utf-8') as stream:
        json.dump(report,stream,ensure_ascii=False,indent=2,allow_nan=False)
        stream.write('\n')
    print('SPACE01_POSTCHECK',json.dumps({'passed':report['passed'],'failed':[name for name,ok in checks.items() if not ok],'report':str(args.output),'old_objects':before['counts']['objects'],'new_objects':len(additions['objects']),'route_samples':sum(row['sample_count'] for row in routes['routes'].values()),'new_wide_obstructions':len(wider['obstructions']['new']),'new_wide_unsupported':len(wider['unsupported']['new']),'seconds':report['seconds']},ensure_ascii=False),flush=True)
    if not report['passed']:
        raise RuntimeError('Space-01 independent postcheck failed; inspect report.')


if __name__ == '__main__':
    run()
