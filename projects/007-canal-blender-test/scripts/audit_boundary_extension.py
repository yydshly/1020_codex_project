import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from audit_v5 import file_hash, snapshot as base_snapshot, website_hashes
from audit_scene_extension import data_name, preserved_file_changes


PROJECT_DIR = SCRIPT_DIR.parent
SOURCE = PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-01.blend'
BASELINE = PROJECT_DIR / 'assets' / 'boundary-02-baseline.json'
PREFIX = 'EXT_B02_'
COLLECTION = 'EXT_Boundary02'


def snapshot(path):
    result = base_snapshot(path)
    scene = bpy.context.scene
    result['view_layers'] = sorted(layer.name for layer in scene.view_layers)
    result['layer_collection_flags'] = {}

    def capture_layer(group, path):
        current = path + '/' + group.name
        result['layer_collection_flags'][current] = {field: getattr(group, field) for field in ('exclude', 'hide_viewport', 'holdout', 'indirect_only')}
        for child in group.children:
            capture_layer(child, current)

    for layer in scene.view_layers:
        capture_layer(layer.layer_collection, layer.name)
    for obj in bpy.data.objects:
        result['objects'][obj.name]['view_layer_hidden'] = {layer.name: obj.hide_get(view_layer=layer) if obj.name in layer.objects else None for layer in scene.view_layers}
    return result


def preserved_file_hashes():
    return {path.relative_to(PROJECT_DIR).as_posix(): {'bytes': path.stat().st_size, 'sha256': file_hash(path)} for directory in ('artifacts', 'assets') for path in sorted((PROJECT_DIR / directory).rglob('*')) if path.is_file() and path != BASELINE}


def compare(baseline, candidate, websites, file_changes):
    original = baseline['snapshot']
    checks = {}
    violations = []

    def check(name, passed, detail=None):
        checks[name] = passed
        if not passed:
            violations.append({'check': name, 'detail': detail})

    check('source_extension_01_bytes_unchanged', SOURCE.is_file() and file_hash(SOURCE) == original['sha256'])
    check('all_old_artifacts_and_assets_bytes_unchanged', not file_changes, file_changes)
    check('web_and_built_site_007_unchanged', baseline['websites'] == websites)
    added = {}
    for category in ('objects', 'materials', 'node_groups'):
        before, after = original[category], candidate[category]
        missing = sorted(before.keys() - after.keys())
        changed = [name for name in sorted(before.keys() & after.keys()) if before[name] != after[name]]
        added[category] = sorted(after.keys() - before.keys())
        check('all_original_' + category + '_including_EXT_frozen', not missing and not changed, {'missing': missing, 'changed': changed})
        check('new_' + category + '_use_boundary_prefix', all(name.startswith(PREFIX) for name in added[category]), added[category])
    check('all_worlds_frozen', original['worlds'] == candidate['worlds'])
    before_scene, after_scene = original['locked_scene'], candidate['locked_scene']
    for field in before_scene:
        if field != 'collections':
            check('locked_scene_' + field, before_scene[field] == after_scene.get(field))
    old_collections, current_collections = before_scene['collections'], after_scene['collections']
    missing = sorted(old_collections.keys() - current_collections.keys())
    changed = [name for name in sorted(old_collections.keys() & current_collections.keys()) if old_collections[name] != current_collections[name]]
    check('old_collection_members_children_visibility_frozen', not missing and not changed, {'missing': missing, 'changed': changed})
    added['collections'] = sorted(current_collections.keys() - old_collections.keys())
    check('only_boundary_collection_added', set(added['collections']).issubset({COLLECTION}), added['collections'])
    old_data = {data_name(obj) for obj in original['objects'].values() if data_name(obj) is not None}
    for name in added['objects']:
        obj = candidate['objects'][name]
        identifier = data_name(obj)
        check('new_object_geometry_only:' + name, obj['type'] in {'MESH', 'CURVE'}, obj['type'])
        check('new_object_boundary_collection_only:' + name, obj['collections'] == [COLLECTION], obj['collections'])
        check('new_object_independent_boundary_data:' + name, identifier is not None and identifier.startswith(PREFIX) and identifier not in old_data, identifier)
    if COLLECTION in added['collections']:
        group = current_collections[COLLECTION]
        check('boundary_collection_has_no_old_objects_or_children', all(name in added['objects'] for name in group['objects']) and not group['children'], group)
    check('view_layer_names_frozen', original['view_layers'] == candidate['view_layers'])
    old_flags, current_flags = original['layer_collection_flags'], candidate['layer_collection_flags']
    check('old_layer_collection_visibility_frozen', all(name in current_flags and flags == current_flags[name] for name, flags in old_flags.items()))
    check('only_boundary_layer_collection_added', all(name.rsplit('/', 1)[-1] == COLLECTION for name in current_flags.keys() - old_flags.keys()))
    count_delta = {name: candidate['counts'][name] - value for name, value in original['counts'].items()}
    check('no_original_complexity_removed', all(value >= 0 for value in count_delta.values()), count_delta)
    check('no_camera_or_light_added', count_delta['cameras'] == 0 and count_delta['lights'] == 0)
    return {'passed': not violations, 'checks': checks, 'violations': violations, 'source_counts': original['counts'], 'candidate_counts': candidate['counts'], 'added_counts': count_delta, 'added_datablocks': added, 'active_camera': after_scene['camera']}


def run():
    parser = argparse.ArgumentParser(description='Read-only EXT_B02 boundary addition audit; no rendering or blend saving.')
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--candidate', type=Path)
    parser.add_argument('--output', type=Path)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if options.baseline == bool(options.candidate):
        parser.error('Choose exactly one of --baseline or --candidate PATH.')
    started = time.perf_counter()
    if options.baseline:
        if BASELINE.exists():
            raise RuntimeError('Boundary baseline already exists and cannot be overwritten.')
        report = {'schema_version': 1, 'created_utc': datetime.now(timezone.utc).isoformat(), 'source_file': SOURCE.relative_to(PROJECT_DIR).as_posix(), 'scope': 'All original objects, including previous EXT_ additions, remain frozen. Only independent EXT_B02_ geometry and materials in EXT_Boundary02 may be added. Original materials may be reused. No new camera or light; active camera is fixed.', 'allowed_render_setting_changes': ['render.filepath', 'render.resolution_x', 'render.resolution_y', 'render.resolution_percentage', 'cycles.samples', 'cycles.adaptive_threshold'], 'snapshot': snapshot(SOURCE), 'preserved_files': preserved_file_hashes(), 'websites': website_hashes()}
        output = BASELINE
    else:
        baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
        candidate_path = options.candidate.resolve()
        output = options.output or PROJECT_DIR / 'assets' / (candidate_path.stem + '-boundary-audit.json')
        if output.resolve() == BASELINE.resolve() or output.resolve().is_relative_to(PROJECT_DIR / 'web') or output.resolve().is_relative_to(PROJECT_DIR.parents[1] / '_site'):
            raise RuntimeError('Cannot overwrite the baseline or a website file.')
        if any(output.resolve() == (PROJECT_DIR / name).resolve() for name in baseline['preserved_files']):
            raise RuntimeError('Cannot overwrite an old artifact or asset.')
        candidate = snapshot(candidate_path)
        report = {'schema_version': 1, 'created_utc': datetime.now(timezone.utc).isoformat(), 'baseline': BASELINE.name, 'source_old_sha256': baseline['snapshot']['sha256'], 'candidate_file': candidate_path.name, 'candidate_sha256': candidate['sha256'], **compare(baseline, candidate, website_hashes(), preserved_file_changes(baseline['preserved_files']))}
    report['audit_seconds'] = round(time.perf_counter() - started, 3)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print('BOUNDARY_AUDIT', json.dumps({'report': output.name, 'passed': report.get('passed', True), 'seconds': report['audit_seconds'], 'violations': report.get('violations', []), 'counts': report.get('candidate_counts', report.get('snapshot', {}).get('counts'))}), flush=True)
    if report.get('passed') is False:
        raise RuntimeError('Boundary extension audit failed; inspect JSON violations.')


if __name__ == '__main__':
    run()
