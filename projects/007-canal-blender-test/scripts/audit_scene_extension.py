import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from audit_v5 import file_hash, snapshot, website_hashes


PROJECT_DIR = SCRIPT_DIR.parent
SOURCE = PROJECT_DIR / 'artifacts' / 'rainy-canal-v5-wet-preview-02.blend'
BASELINE = PROJECT_DIR / 'assets' / 'extension-baseline.json'
PREFIX = 'EXT_'


def preserved_file_hashes():
    return {path.relative_to(PROJECT_DIR).as_posix(): {'bytes': path.stat().st_size, 'sha256': file_hash(path)} for directory in ('artifacts', 'assets') for path in sorted((PROJECT_DIR / directory).rglob('*')) if path.is_file() and path != BASELINE}


def preserved_file_changes(record):
    changes = []
    for relative, expected in record.items():
        path = PROJECT_DIR / relative
        if not path.is_file():
            changes.append({'file': relative, 'change': 'missing'})
        elif path.stat().st_size != expected['bytes'] or file_hash(path) != expected['sha256']:
            changes.append({'file': relative, 'change': 'content changed'})
    return changes


def data_name(obj):
    data = obj['data']
    if data is None:
        return None
    return data.get('name', data.get('properties', {}).get('name'))


def compare(baseline, candidate, websites, file_changes):
    original = baseline['snapshot']
    violations = []
    checks = {}

    def check(name, passed, detail=None):
        checks[name] = passed
        if not passed:
            violations.append({'check': name, 'detail': detail})

    check('frozen_source_bytes_unchanged', SOURCE.is_file() and file_hash(SOURCE) == original['sha256'])
    check('old_artifacts_and_assets_bytes_unchanged', not file_changes, file_changes)
    check('web_and_built_site_007_unchanged', baseline['websites'] == websites)
    added = {}
    for category in ('objects', 'materials', 'node_groups'):
        before = original[category]
        after = candidate[category]
        missing = sorted(before.keys() - after.keys())
        changed = [name for name in sorted(before.keys() & after.keys()) if before[name] != after[name]]
        added[category] = sorted(after.keys() - before.keys())
        check('all_original_' + category + '_preserved', not missing and not changed, {'missing': missing, 'changed': changed})
        check('new_' + category + '_use_EXT_prefix', all(name.startswith(PREFIX) for name in added[category]), added[category])
    check('worlds_completely_unchanged', original['worlds'] == candidate['worlds'])
    before_scene = original['locked_scene']
    after_scene = candidate['locked_scene']
    for field in before_scene:
        if field not in {'camera', 'collections'}:
            check('locked_scene_' + field, before_scene[field] == after_scene.get(field))
    old_collections = before_scene['collections']
    new_collections = after_scene['collections']
    missing_collections = sorted(old_collections.keys() - new_collections.keys())
    changed_collections = [name for name in sorted(old_collections.keys() & new_collections.keys()) if old_collections[name] != new_collections[name]]
    check('old_collection_members_children_visibility_unchanged', not missing_collections and not changed_collections, {'missing': missing_collections, 'changed': changed_collections})
    added['collections'] = sorted(new_collections.keys() - old_collections.keys())
    check('new_collections_use_EXT_prefix', all(name.startswith(PREFIX) for name in added['collections']), added['collections'])
    old_data_names = {data_name(obj) for obj in original['objects'].values() if data_name(obj) is not None}
    for name in added['objects']:
        obj = candidate['objects'][name]
        check('new_object_independent_collections:' + name, bool(obj['collections']) and all(group in added['collections'] for group in obj['collections']), obj['collections'])
        identifier = data_name(obj)
        check('new_object_independent_data:' + name, identifier is None or (identifier.startswith(PREFIX) and identifier not in old_data_names), identifier)
    for name in added['collections']:
        group = new_collections[name]
        check('new_collection_only_contains_extension:' + name, all(obj in added['objects'] for obj in group['objects']) and all(child in added['collections'] for child in group['children']), group)
    camera = after_scene['camera']
    check('active_camera_is_original_or_new_review_camera', camera == before_scene['camera'] or (camera in added['objects'] and candidate['objects'][camera]['type'] == 'CAMERA' and camera.startswith(PREFIX)), camera)
    count_delta = {name: candidate['counts'][name] - amount for name, amount in original['counts'].items()}
    check('scene_complexity_not_reduced', all(amount >= 0 for amount in count_delta.values()), count_delta)
    return {'passed': not violations, 'checks': checks, 'violations': violations, 'source_counts': original['counts'], 'candidate_counts': candidate['counts'], 'added_counts': count_delta, 'added_datablocks': added, 'active_camera': camera}


def run():
    parser = argparse.ArgumentParser(description='Read-only additive scene audit; never renders or writes a blend.')
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--candidate', type=Path)
    parser.add_argument('--output', type=Path)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if options.baseline == bool(options.candidate):
        parser.error('Choose exactly one of --baseline or --candidate PATH.')
    started = time.perf_counter()
    if options.baseline:
        if BASELINE.exists():
            raise RuntimeError('Existing extension baseline is immutable; refusing to overwrite.')
        report = {
            'schema_version': 1,
            'created_utc': datetime.now(timezone.utc).isoformat(),
            'source_file': SOURCE.relative_to(PROJECT_DIR).as_posix(),
            'scope': 'Additive EXT_ objects, collections, independent geometry/camera/light data, materials and node groups only. Existing materials may be reused. All original object data, transforms, modifiers, assignments and collection memberships remain fixed.',
            'allowed_scene_setting_changes': ['scene.camera to a new EXT_ camera', 'render.filepath', 'render.resolution_x', 'render.resolution_y', 'render.resolution_percentage', 'cycles.samples', 'cycles.adaptive_threshold'],
            'snapshot': snapshot(SOURCE),
            'preserved_files': preserved_file_hashes(),
            'websites': website_hashes(),
        }
        output = BASELINE
    else:
        baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
        candidate_path = options.candidate.resolve()
        output = options.output or PROJECT_DIR / 'assets' / (candidate_path.stem + '-extension-audit.json')
        if output.resolve() == BASELINE.resolve() or output.resolve().is_relative_to(PROJECT_DIR / 'web') or output.resolve().is_relative_to(PROJECT_DIR.parents[1] / '_site'):
            raise RuntimeError('Audit output cannot replace a protected baseline or website file.')
        if any(output.resolve() == (PROJECT_DIR / relative).resolve() for relative in baseline['preserved_files']):
            raise RuntimeError('Audit output cannot replace any old artifact or asset.')
        candidate = snapshot(candidate_path)
        report = {'schema_version': 1, 'created_utc': datetime.now(timezone.utc).isoformat(), 'baseline': BASELINE.name, 'source_old_sha256': baseline['snapshot']['sha256'], 'candidate_file': candidate_path.name, 'candidate_sha256': candidate['sha256'], **compare(baseline, candidate, website_hashes(), preserved_file_changes(baseline['preserved_files']))}
    report['audit_seconds'] = round(time.perf_counter() - started, 3)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print('EXTENSION_AUDIT', json.dumps({'report': output.name, 'passed': report.get('passed', True), 'seconds': report['audit_seconds'], 'violations': report.get('violations', []), 'counts': report.get('candidate_counts', report.get('snapshot', {}).get('counts'))}), flush=True)
    if report.get('passed') is False:
        raise RuntimeError('Scene extension audit failed; inspect JSON violations.')


if __name__ == '__main__':
    run()
