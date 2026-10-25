import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import audit_boundary_extension as boundary_audit
from audit_scene_extension import preserved_file_changes
from audit_v5 import file_hash, website_hashes


PROJECT_DIR = SCRIPT_DIR.parent
SOURCE = PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-02-final.blend'
BASELINE = PROJECT_DIR / 'assets' / 'landscape-03-baseline.json'
PREFIX = 'EXT_L03_'
COLLECTION = 'EXT_Landscape03'
snapshot = boundary_audit.snapshot


def preserved_file_hashes():
    return {path.relative_to(PROJECT_DIR).as_posix(): {'bytes': path.stat().st_size, 'sha256': file_hash(path)} for directory in ('artifacts', 'assets') for path in sorted((PROJECT_DIR / directory).rglob('*')) if path.is_file() and path != BASELINE}


def compare(baseline, candidate, websites, file_changes):
    original_parameters = boundary_audit.SOURCE, boundary_audit.PREFIX, boundary_audit.COLLECTION
    try:
        boundary_audit.SOURCE, boundary_audit.PREFIX, boundary_audit.COLLECTION = SOURCE, PREFIX, COLLECTION
        result = boundary_audit.compare(baseline, candidate, websites, file_changes)
    finally:
        boundary_audit.SOURCE, boundary_audit.PREFIX, boundary_audit.COLLECTION = original_parameters

    def label(name):
        return name.replace('source_extension_01_bytes_unchanged', 'source_extension_02_final_bytes_unchanged').replace('boundary', 'landscape')

    result['checks'] = {label(name): passed for name, passed in result['checks'].items()}
    for violation in result['violations']:
        violation['check'] = label(violation['check'])
    result['checks']['no_new_node_groups'] = not result['added_datablocks']['node_groups']
    if not result['checks']['no_new_node_groups']:
        result['violations'].append({'check': 'no_new_node_groups', 'detail': result['added_datablocks']['node_groups']})
    result['passed'] = not result['violations']
    return result


def run():
    parser = argparse.ArgumentParser(description='Read-only additive EXT_L03 landscape audit; never renders or saves a blend.')
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--candidate', type=Path)
    parser.add_argument('--output', type=Path)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if options.baseline == bool(options.candidate):
        parser.error('Choose exactly one of --baseline or --candidate PATH.')
    started = time.perf_counter()
    if options.baseline:
        if BASELINE.exists():
            raise RuntimeError('Landscape baseline already exists and cannot be overwritten.')
        source_snapshot = snapshot(SOURCE)
        if source_snapshot['counts']['objects'] != 2260:
            raise RuntimeError('Expected the approved 2260-object final scene as the frozen source.')
        report = {
            'schema_version': 1,
            'created_utc': datetime.now(timezone.utc).isoformat(),
            'source_file': SOURCE.relative_to(PROJECT_DIR).as_posix(),
            'scope': 'Freeze all 2260 source objects, including earlier EXT_ and EXT_B02_ additions. Only independent EXT_L03_ mesh/curve objects and materials may be added in EXT_Landscape03. Existing materials may be reused. No new cameras, lights or node groups. Active camera, world, material graphs, original collection membership and visibility remain fixed.',
            'scope_limitations': 'The audit verifies preservation, geometry types, names and isolation. Whether new geometry is landscape rather than decorative props still requires reviewing its construction and intended use.',
            'allowed_render_setting_changes': ['render.filepath', 'render.resolution_x', 'render.resolution_y', 'render.resolution_percentage', 'cycles.samples', 'cycles.adaptive_threshold'],
            'snapshot': source_snapshot,
            'preserved_files': preserved_file_hashes(),
            'websites': website_hashes(),
        }
        output = BASELINE
    else:
        baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
        candidate_path = options.candidate.resolve()
        output = options.output or PROJECT_DIR / 'assets' / (candidate_path.stem + '-landscape-audit.json')
        if output.resolve() == BASELINE.resolve() or output.resolve().is_relative_to(PROJECT_DIR / 'web') or output.resolve().is_relative_to(PROJECT_DIR.parents[1] / '_site'):
            raise RuntimeError('Cannot overwrite the baseline or a website file.')
        if any(output.resolve() == (PROJECT_DIR / name).resolve() for name in baseline['preserved_files']):
            raise RuntimeError('Cannot overwrite any old artifact or asset.')
        candidate = snapshot(candidate_path)
        report = {'schema_version': 1, 'created_utc': datetime.now(timezone.utc).isoformat(), 'baseline': BASELINE.name, 'source_old_sha256': baseline['snapshot']['sha256'], 'candidate_file': candidate_path.name, 'candidate_sha256': candidate['sha256'], **compare(baseline, candidate, website_hashes(), preserved_file_changes(baseline['preserved_files']))}
    report['audit_seconds'] = round(time.perf_counter() - started, 3)
    with output.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    print('LANDSCAPE_AUDIT', json.dumps({'report': output.name, 'passed': report.get('passed', True), 'seconds': report['audit_seconds'], 'violations': report.get('violations', []), 'counts': report.get('candidate_counts', report.get('snapshot', {}).get('counts'))}), flush=True)
    if report.get('passed') is False:
        raise RuntimeError('Landscape extension audit failed; inspect the new report.')


if __name__ == '__main__':
    run()
