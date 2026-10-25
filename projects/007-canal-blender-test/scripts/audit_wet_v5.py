import argparse
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from audit_v5 import file_hash, snapshot, website_hashes


PROJECT_DIR = SCRIPT_DIR.parent
SOURCE = PROJECT_DIR / 'artifacts' / 'rainy-canal-v5-preview-02.blend'
BASELINE = PROJECT_DIR / 'assets' / 'v5-wet-baseline.json'
ALLOWED_MATERIALS = {'paving', 'paving_alt', 'Canal water'}


def value_shape(value):
    if isinstance(value, list):
        return {'allowed_value_shape': [value_shape(item) for item in value]}
    return {'allowed_value_type': type(value).__name__}


def locked_wet_material(material):
    result = deepcopy(material)
    tree = result['nodes']
    if tree is None:
        return result
    for node in tree['nodes'].values():
        for direction in ('inputs', 'outputs'):
            for socket in node[direction]:
                socket['default'] = value_shape(socket['default'])
        ramp = node['properties'].get('color_ramp')
        if ramp is not None:
            for element in ramp.get('elements', []):
                for field in ('color', 'alpha', 'position'):
                    if field in element:
                        element[field] = value_shape(element[field])
            for field in ('interpolation', 'hue_interpolation', 'color_mode'):
                if field in ramp:
                    ramp[field] = value_shape(ramp[field])
    return result


def differences(before, after, path=''):
    if before == after:
        return []
    if isinstance(before, dict) and isinstance(after, dict) and before.keys() == after.keys():
        return [change for key in before for change in differences(before[key], after[key], f'{path}.{key}' if path else key)]
    if isinstance(before, list) and isinstance(after, list) and len(before) == len(after):
        return [change for index, values in enumerate(zip(before, after)) for change in differences(*values, f'{path}[{index}]')]
    return [{'path': path, 'before': before, 'after': after}]


def graph_counts(scene_snapshot):
    return {name: {'nodes': len(material['nodes']['nodes']), 'links': len(material['nodes']['links'])} for name, material in scene_snapshot['materials'].items() if material['nodes'] is not None}


def compare(baseline, candidate, websites):
    original = baseline['snapshot']
    violations = []
    checks = {}

    def check(name, passed, detail=None):
        checks[name] = passed
        if not passed:
            violations.append({'check': name, 'detail': detail})

    check('frozen_v5_source_hash_unchanged', file_hash(SOURCE) == original['sha256'])
    check('project_web_and_built_site_007_unchanged', websites == baseline['websites'])
    check('complexity_counts_unchanged', candidate['counts'] == original['counts'])
    check('object_set_unchanged', candidate['objects'].keys() == original['objects'].keys())
    for name in sorted(original['objects'].keys() & candidate['objects'].keys()):
        before, after = original['objects'][name], candidate['objects'][name]
        if before != after:
            check('frozen_object:' + name, False, {'changed_fields': [field for field in before if before[field] != after.get(field)]})
    check('all_geometry_transforms_visibility_modifiers_lights_cameras_frozen', original['objects'] == candidate['objects'])
    for category in ('worlds', 'node_groups', 'locked_scene'):
        check(category + '_unchanged', original[category] == candidate[category])
    check('material_set_unchanged', candidate['materials'].keys() == original['materials'].keys())
    check('all_material_node_link_counts_unchanged', graph_counts(original) == graph_counts(candidate))
    allowed_changes = []
    for name in sorted(original['materials'].keys() & candidate['materials'].keys()):
        before, after = original['materials'][name], candidate['materials'][name]
        if name not in ALLOWED_MATERIALS:
            check('non_wet_material_frozen:' + name, before == after)
            continue
        check('wet_material_graph_and_non_parameter_properties_frozen:' + name, locked_wet_material(before) == locked_wet_material(after))
        changed = differences(before, after)
        if changed:
            allowed_changes.append({'material': name, 'changes': changed})
    return {'passed': not violations, 'checks': checks, 'violations': violations, 'wet_material_parameter_changes': allowed_changes, 'baseline_counts': original['counts'], 'candidate_counts': candidate['counts'], 'baseline_material_graph_counts': graph_counts(original), 'candidate_material_graph_counts': graph_counts(candidate)}


def run():
    parser = argparse.ArgumentParser(description='Read-only audit for bounded V5 wet-material parameter changes; never renders or saves a blend.')
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--candidate', type=Path)
    parser.add_argument('--output', type=Path)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if options.baseline == bool(options.candidate):
        parser.error('Choose exactly one of --baseline or --candidate PATH.')
    started = time.perf_counter()
    if options.baseline:
        output = BASELINE
        if output.exists():
            raise RuntimeError('Frozen baseline already exists; refusing to overwrite it.')
        source_hash = file_hash(SOURCE)
        source_snapshot = snapshot(SOURCE)
        missing = ALLOWED_MATERIALS - source_snapshot['materials'].keys()
        if missing:
            raise RuntimeError('Expected wet materials missing: ' + ', '.join(sorted(missing)))
        if file_hash(SOURCE) != source_hash:
            raise RuntimeError('Frozen V5 source changed during read-only baseline inspection.')
        report = {
            'schema_version': 1,
            'created_utc': datetime.now(timezone.utc).isoformat(),
            'source': SOURCE.name,
            'scope': 'Every object and all geometry remain frozen. Only existing defaults and color-ramp parameters in three named wet materials may change; graph nodes, links and ramp element counts cannot change.',
            'allowed_materials': sorted(ALLOWED_MATERIALS),
            'allowed_material_changes': ['Existing node input/output socket default values without changing socket shape', 'Existing color-ramp element color, alpha and position', 'Color-ramp interpolation, hue_interpolation and color_mode'],
            'allowed_render_setting_changes': ['resolution_x', 'resolution_y', 'resolution_percentage', 'filepath', 'cycles.samples', 'cycles.adaptive_threshold'],
            'snapshot': source_snapshot,
            'websites': website_hashes(),
        }
    else:
        baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
        candidate_path = options.candidate.resolve(strict=True)
        output = options.output or PROJECT_DIR / 'assets' / (candidate_path.stem + '-wet-constraint-audit.json')
        if output.exists():
            raise RuntimeError('Audit report already exists; choose a new output path.')
        report = {
            'schema_version': 1,
            'created_utc': datetime.now(timezone.utc).isoformat(),
            'baseline': BASELINE.name,
            'source': SOURCE.name,
            'source_baseline_sha256': baseline['snapshot']['sha256'],
            'source_current_sha256': file_hash(SOURCE),
            'candidate': candidate_path.name,
            'candidate_sha256': file_hash(candidate_path),
            **compare(baseline, snapshot(candidate_path), website_hashes()),
        }
    report['audit_seconds'] = round(time.perf_counter() - started, 3)
    with output.open('x', encoding='utf-8') as stream:
        stream.write(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    print('V5_WET_AUDIT', json.dumps({'report': output.name, 'passed': report.get('passed', True), 'seconds': report['audit_seconds'], 'violations': report.get('violations', []), 'counts': report.get('baseline_counts', report.get('snapshot', {}).get('counts')), 'allowed_materials': sorted(ALLOWED_MATERIALS)}), flush=True)
    if report.get('passed') is False:
        raise RuntimeError('Wet V5 constraints failed; inspect the new audit report.')


if __name__ == '__main__':
    run()
