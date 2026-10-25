from datetime import datetime, timezone
import json
from pathlib import Path
import struct
import sys
import time

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from audit_boundary_extension import BASELINE, compare, preserved_file_hashes, snapshot
from audit_scene_extension import preserved_file_changes
from audit_v5 import file_hash, settings, website_hashes
from extend_boundary import check_routes, probe_edges, probe_local_connections


PROJECT_DIR = SCRIPT_DIR.parent
ASSETS = PROJECT_DIR / 'assets'
DRAFT = PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-02.blend'
FINAL = PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-02-final.blend'
OUTPUT = ASSETS / 'boundary-02-postcheck.json'
TARGET = 'EXT_B02_ShopRearWallApron'
REFERENCE = 'EXT_Rear lane slab 3'


def read_json(name):
    return json.loads((ASSETS / name).read_text(encoding='utf-8'))


def coordinates(obj, world=False):
    return [tuple(obj.matrix_world @ vertex.co if world else vertex.co) for vertex in obj.data.vertices]


def render_settings():
    return {'render': settings(bpy.context.scene.render), 'cycles': settings(bpy.context.scene.cycles)}


def run():
    if OUTPUT.exists():
        raise RuntimeError('Existing postcheck will not be overwritten.')
    started = time.perf_counter()
    baseline = read_json(BASELINE.name)
    preserved_before = preserved_file_hashes()
    baseline_hash = file_hash(BASELINE)
    stats = read_json('boundary-02-stats.json')
    ledger = read_json('boundary-02-render-ledger.json')
    saved_audit = read_json('boundary-02-audit.json')
    seam_report = read_json('boundary-02-seam-check.json')
    draft = snapshot(DRAFT)
    draft_coordinates = coordinates(bpy.data.objects[TARGET])
    draft_world = coordinates(bpy.data.objects[TARGET], True)
    draft_render = render_settings()
    final = snapshot(FINAL)
    final_coordinates = coordinates(bpy.data.objects[TARGET])
    final_world = coordinates(bpy.data.objects[TARGET], True)
    reference_y = min(point[1] for point in coordinates(bpy.data.objects[REFERENCE], True))
    websites = website_hashes()
    old_file_changes = preserved_file_changes(baseline['preserved_files'])
    independent_audit = compare(baseline, final, websites, old_file_changes)
    changed_objects = [name for name in draft['objects'] if draft['objects'][name] != final['objects'].get(name)]
    changed_vertices = [index for index, values in enumerate(zip(draft_coordinates, final_coordinates)) if values[0] != values[1]]
    before_fields = {key: value for key, value in draft['objects'][TARGET].items() if key != 'data'}
    after_fields = {key: value for key, value in final['objects'][TARGET].items() if key != 'data'}
    before_mesh = {key: value for key, value in draft['objects'][TARGET]['data'].items() if key != 'coordinate_sha256'}
    after_mesh = {key: value for key, value in final['objects'][TARGET]['data'].items() if key != 'coordinate_sha256'}
    holes = probe_edges()
    supports = probe_local_connections()
    routes = check_routes()
    previews = []
    for attempt in ledger['attempts']:
        path = ASSETS / attempt['image']
        content = path.read_bytes()
        previews.append({'file': path.name, 'bytes': len(content), 'sha256': file_hash(path), 'resolution': list(struct.unpack_from('>II', content, 16)), 'status': attempt['status'], 'matches_ledger': file_hash(path) == attempt['sha256'], 'valid_png_header': content[:8] == b'\x89PNG\r\n\x1a\n', 'corresponds_to': DRAFT.name})
    checks = {
        'draft_and_final_exist': DRAFT.is_file() and FINAL.is_file(),
        'draft_hash_matches_preview_stats_and_seam_report': draft['sha256'] == stats['candidate_sha256'] == seam_report['draft']['sha256'],
        'final_hash_matches_seam_report': final['sha256'] == seam_report['final']['sha256'],
        'saved_draft_audit_passed': saved_audit['passed'] is True and not saved_audit['violations'] and all(saved_audit['checks'].values()),
        'independent_final_freeze_audit_passed': independent_audit['passed'],
        'baseline_old_files_unchanged': not old_file_changes,
        'websites_unchanged': websites == baseline['websites'],
        'ledger_exactly_two_completed': ledger['maximum_attempts'] == 2 and len(ledger['attempts']) == 2 and all(attempt['status'] == 'complete' for attempt in ledger['attempts']),
        'stats_previews_match_ledger': stats['rendered_previews'] == ledger['attempts'],
        'preview_hashes_and_resolution_match_ledger': all(preview['matches_ledger'] and preview['valid_png_header'] and preview['resolution'] == attempt['resolution'] for preview, attempt in zip(previews, ledger['attempts'])),
        'draft_to_final_objects_and_counts_unchanged': draft['objects'].keys() == final['objects'].keys() and draft['counts'] == final['counts'],
        'only_apron_coordinate_data_changed': changed_objects == [TARGET] and before_fields == after_fields and before_mesh == after_mesh,
        'exactly_four_max_y_vertices_adjusted_only_in_y': len(changed_vertices) == 4 and len(draft_coordinates) == len(final_coordinates) and all(draft_world[index][1] == max(point[1] for point in draft_world) and all(draft_coordinates[index][axis] == final_coordinates[index][axis] for axis in (0, 2)) for index in changed_vertices),
        'correction_is_about_one_millimetre': all(.0009 < draft_world[index][1] - final_world[index][1] < .0011 for index in changed_vertices),
        'final_apron_edge_exactly_matches_old_lane': max(point[1] for point in final_world) == reference_y and all(final_world[index][1] == reference_y for index in changed_vertices),
        'draft_to_final_render_settings_unchanged': draft_render == render_settings(),
        'seven_known_hole_rays_now_hit_geometry': len(holes) == 7 and all(result['hit'] for result in holes.values()),
        'nine_local_ground_samples_have_support': len(supports) == 9 and all(result['hit'] and .83 <= result['height'] <= .86 for result in supports.values()),
        'two_original_sampled_routes_pass': set(routes['routes']) == {'both_banks_loop', 'rear_lane_loop'} and all(route['sampled_checks_passed'] and not route['unsupported_samples'] and not route['body_ray_obstructions'] for route in routes['routes'].values()),
    }
    for category in ('materials', 'worlds', 'node_groups', 'locked_scene', 'view_layers', 'layer_collection_flags'):
        checks['draft_to_final_' + category + '_unchanged'] = draft[category] == final[category]
    checks['all_files_present_before_postcheck_remain_unchanged'] = not preserved_file_changes(preserved_before) and file_hash(BASELINE) == baseline_hash
    evidence_names = [BASELINE.name, 'boundary-02-stats.json', 'boundary-02-audit.json', 'boundary-02-diagnostics.json', 'boundary-02-render-ledger.json', 'boundary-02-seam-check.json']
    report = {
        'schema_version': 1, 'checked_utc': datetime.now(timezone.utc).isoformat(), 'passed': all(checks.values()),
        'method': 'Read-only reopening of draft and final; independent freeze audit, exact vertex comparison, SHA256 verification, and repeated existing ray/route checks. No build, save or render operations.',
        'checks': checks,
        'source': {'file': baseline['source_file'], 'sha256': baseline['snapshot']['sha256'], 'frozen_objects': baseline['snapshot']['counts']['objects']},
        'draft': {'file': DRAFT.name, 'sha256': draft['sha256'], 'rendered_preview_count': 2},
        'final': {'file': FINAL.name, 'bytes': FINAL.stat().st_size, 'sha256': final['sha256'], 'rendered': False, 'visual_render_validation': 'Not performed. Existing previews correspond to the unchanged draft, not this final file.'},
        'preservation': {'baseline_old_files_checked': len(baseline['preserved_files']), 'changed_old_files': old_file_changes, 'website_files_checked': {name: len(site['files']) for name, site in websites.items()}, 'audit_check_count': len(independent_audit['checks']), 'violations': independent_audit['violations']},
        'candidate_counts': final['counts'], 'added_counts': independent_audit['added_counts'],
        'draft_to_final_difference': {'changed_objects': changed_objects, 'changed_vertices': changed_vertices, 'apron_world_y_before': max(point[1] for point in draft_world), 'apron_world_y_after': max(point[1] for point in final_world), 'old_lane_boundary_world_y': reference_y, 'maximum_displacement_metres': max(abs(draft_world[index][1] - final_world[index][1]) for index in changed_vertices) if changed_vertices else 0, 'remaining_gap_or_overlap_metres': max(point[1] for point in final_world) - reference_y},
        'render_budget': {'maximum_attempts': 2, 'attempts': len(ledger['attempts']), 'completed': sum(attempt['status'] == 'complete' for attempt in ledger['attempts']), 'previews': previews, 'new_renders_during_postcheck': 0},
        'final_geometry_retests': {'known_hole_rays': holes, 'local_ground_samples': supports, 'original_route_samples': routes},
        'limitations': ['Final has only the independently verified four-vertex, approximately 1 mm apron-edge adjustment, but no final render was produced or visually validated.', 'The seven hole rays and nine floor samples only cover the named diagnostics, not every possible viewpoint or terrain boundary.', 'Route samples do not constitute a navmesh, continuous collision certification, an implemented walking controller or playable roaming.'],
        'evidence_sha256': {name: file_hash(ASSETS / name) for name in evidence_names},
        'postcheck_seconds': round(time.perf_counter() - started, 3),
    }
    with OUTPUT.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    print('BOUNDARY_FINAL_POSTCHECK', json.dumps({'passed': report['passed'], 'report': OUTPUT.name, 'failed_checks': [name for name, passed in checks.items() if not passed], 'old_files': len(baseline['preserved_files']), 'changed_vertices': changed_vertices, 'hole_rays': len(holes), 'floor_samples': len(supports), 'completed_renders': report['render_budget']['completed'], 'seconds': report['postcheck_seconds']}), flush=True)
    if not report['passed']:
        raise RuntimeError('Boundary final postcheck failed; inspect the new report.')


if __name__ == '__main__':
    run()
