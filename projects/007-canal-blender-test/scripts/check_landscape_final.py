from datetime import datetime, timezone
import json
from pathlib import Path
import struct
import sys
import time

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(SCRIPT_DIR))

from audit_landscape_extension import BASELINE, SOURCE, compare, preserved_file_changes, preserved_file_hashes, snapshot
from audit_v5 import file_hash, website_hashes
from extend_boundary import probe_edges, probe_local_connections
from extend_landscape import CAMERAS, compare_protected, protected_rays
from extend_scene import check_routes
from landscape_banks import check_channel
from landscape_hills import protection_checks, world_bvh


PROJECT_DIR = SCRIPT_DIR.parent
ASSETS = PROJECT_DIR / 'assets'
CANDIDATE = PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-03.blend'
OUTPUT = ASSETS / 'landscape-03-postcheck.json'
EXPECTED_SHA256 = 'be430f38e6bcf2b9be54cebbebb111a868f2046fc6fe60ec77723c4d1ed05a50'
EXPECTED_ADDED = {'objects': 6, 'mesh_objects': 6, 'curve_objects': 0, 'vertices': 4854, 'faces': 7224, 'curve_points': 0, 'modifiers': 0, 'lights': 0, 'cameras': 0}


def read_json(name):
    return json.loads((ASSETS / name).read_text(encoding='utf-8'))


def run():
    if OUTPUT.exists():
        raise RuntimeError('Existing landscape postcheck will not be overwritten.')
    started = time.perf_counter()
    baseline = read_json(BASELINE.name)
    baseline_hash = file_hash(BASELINE)
    preserved_before = preserved_file_hashes()
    stats = read_json('landscape-03-stats.json')
    ledger = read_json('landscape-03-render-ledger.json')
    saved_audit = read_json('landscape-03-audit.json')
    saved_diagnostics = read_json('landscape-03-diagnostics.json')
    source = snapshot(SOURCE)
    protected_before = protected_rays()
    candidate = snapshot(CANDIDATE)
    protected_after = protected_rays()
    protected = compare_protected(protected_before, protected_after)
    websites = website_hashes()
    old_file_changes = preserved_file_changes(baseline['preserved_files'])
    independent_audit = compare(baseline, candidate, websites, old_file_changes)
    channel = check_channel()
    routes = check_routes()
    holes = probe_edges()
    supports = probe_local_connections()
    hill_objects = {bank: bpy.data.objects['EXT_L03_' + bank.title() + 'RollingTerrain'] for bank in ('north', 'south')}
    hill_sources = {bank: world_bvh(bpy.data.objects[name]) for bank, name in (('north', 'EXT_B02_NearBankContinuousGround'), ('south', 'EXT_B02_FarBankContinuousGround'))}
    hills = protection_checks(hill_objects, hill_sources)
    previews = []
    for attempt in ledger['attempts']:
        path = ASSETS / attempt['image']
        if path.resolve().parent != ASSETS.resolve():
            raise RuntimeError('Preview path must refer to a direct asset file.')
        content = path.read_bytes()
        digest = file_hash(path)
        valid_header = len(content) >= 33 and content[:8] == b'\x89PNG\r\n\x1a\n' and content[8:16] == b'\x00\x00\x00\rIHDR'
        resolution = list(struct.unpack_from('>II', content, 16)) if valid_header else None
        previews.append({'file': path.name, 'bytes': len(content), 'sha256': digest, 'resolution': resolution, 'valid_png_header': valid_header, 'matches_ledger_sha256': digest == attempt.get('sha256'), 'matches_ledger_resolution': resolution == attempt.get('resolution'), 'candidate_sha256': attempt.get('candidate_sha256'), 'camera': attempt.get('camera'), 'samples': attempt.get('samples')})
    attempts = ledger['attempts']
    checks = {
        'source_and_candidate_exist': SOURCE.is_file() and CANDIDATE.is_file(),
        'reopened_source_snapshot_matches_frozen_baseline': source == baseline['snapshot'],
        'candidate_hash_matches_expected_stats_and_ledger': candidate['sha256'] == EXPECTED_SHA256 == stats['candidate_sha256'] == ledger['candidate_sha256'],
        'candidate_names_match_stats_and_ledger': CANDIDATE.name == stats['candidate'] == ledger['candidate'],
        'saved_build_audit_passed': saved_audit['passed'] is True and not saved_audit['violations'] and all(saved_audit['checks'].values()),
        'independent_full_preservation_audit_passed': independent_audit['passed'],
        'saved_audit_matches_independent_counts': saved_audit['source_counts'] == source['counts'] and saved_audit['candidate_counts'] == candidate['counts'] and saved_audit['added_counts'] == independent_audit['added_counts'],
        'all_2260_source_objects_and_old_materials_world_camera_frozen': source['counts']['objects'] == 2260 and independent_audit['passed'],
        'exactly_six_landscape_meshes_and_expected_complexity_added': independent_audit['added_counts'] == EXPECTED_ADDED == stats['added_counts'],
        'no_new_material_or_node_group': not independent_audit['added_datablocks']['materials'] and not independent_audit['added_datablocks']['node_groups'] and not stats['added_materials'],
        'baseline_old_files_unchanged': not old_file_changes,
        'websites_unchanged': websites == baseline['websites'],
        'ledger_exactly_two_completed_attempts': ledger['maximum_attempts'] == 2 and len(attempts) == 2 and all(attempt['status'] == 'complete' for attempt in attempts),
        'both_previews_bound_to_same_audited_candidate': all(attempt['candidate_sha256'] == candidate['sha256'] for attempt in attempts),
        'two_expected_distinct_review_images_and_cameras': [attempt['image'] for attempt in attempts] == ['landscape-03-preview-01.png', 'landscape-03-preview-02.png'] and [attempt['camera'] for attempt in attempts] == list(CAMERAS),
        'stats_completed_previews_match_ledger': stats['rendered_previews'] == [attempt for attempt in attempts if attempt['status'] == 'complete'],
        'preview_png_hashes_and_low_resolution_verified': all(preview['valid_png_header'] and preview['matches_ledger_sha256'] and preview['matches_ledger_resolution'] and preview['resolution'] == [1104, 622] and preview['samples'] == 32 for preview in previews),
        'protected_108_scene_samples_unchanged_from_source': len(protected_before) == len(protected_after) == protected['sample_count'] == 108 and [item['xy'] for item in protected_before] == [item['xy'] for item in protected_after] and protected['passed'],
        'channel_155_sections_meet_width_and_overlap_requirements': channel['passed'] and channel['section_count'] == 155 and not channel['failed_sections'] and channel['minimum_sampled_water_width'] >= 5.0 and channel['minimum_adjacent_water_overlap'] >= 4.5,
        'seven_known_hole_rays_hit_geometry': len(holes) == 7 and all(result['hit'] for result in holes.values()),
        'nine_ground_connection_samples_supported': len(supports) == 9 and all(result['hit'] and .83 <= result['height'] <= .86 for result in supports.values()),
        'two_original_sampled_routes_pass': set(routes['routes']) == {'both_banks_loop', 'rear_lane_loop'} and all(route['sampled_checks_passed'] and not route['unsupported_samples'] and not route['body_ray_obstructions'] for route in routes['routes'].values()),
        'hill_210_protected_strip_and_quay_samples_pass': hills['passed'] and hills['sample_count'] == 210,
        'saved_diagnostics_match_independent_retests': saved_diagnostics == {'protected_scene_samples': protected, 'existing_route_sampling': routes, 'previous_hole_rays': holes, 'previous_local_support': supports, 'channel': channel},
        'saved_hill_protection_matches_independent_retest': stats['hills']['protection_checks'] == hills,
    }
    checks['all_files_present_before_postcheck_remain_unchanged'] = not preserved_file_changes(preserved_before) and file_hash(BASELINE) == baseline_hash
    checks['websites_still_unchanged_after_retests'] = website_hashes() == baseline['websites']
    evidence_names = [BASELINE.name, 'landscape-03-stats.json', 'landscape-03-audit.json', 'landscape-03-diagnostics.json', 'landscape-03-render-ledger.json']
    report = {
        'schema_version': 1,
        'checked_utc': datetime.now(timezone.utc).isoformat(),
        'passed': all(checks.values()),
        'method': 'Read-only source and candidate snapshots, independent freeze comparison, SHA256 and PNG header verification, repeated existing ray/route/channel checks and hill BVH clearance checks. No build, save or render operations.',
        'checks': checks,
        'source': {'file': SOURCE.name, 'sha256': source['sha256'], 'frozen_objects': source['counts']['objects']},
        'candidate': {'file': CANDIDATE.name, 'bytes': CANDIDATE.stat().st_size, 'sha256': candidate['sha256'], 'active_camera': candidate['locked_scene']['camera']},
        'preservation': {'baseline_old_files_checked': len(baseline['preserved_files']), 'all_preexisting_asset_artifact_files_checked': len(preserved_before), 'changed_old_files': old_file_changes, 'website_files_checked': {name: len(site['files']) for name, site in websites.items()}, 'independent_audit': independent_audit},
        'candidate_counts': candidate['counts'],
        'added_counts': independent_audit['added_counts'],
        'render_budget': {'maximum_attempts': 2, 'attempts': len(attempts), 'completed': sum(attempt['status'] == 'complete' for attempt in attempts), 'previews': previews, 'new_renders_during_postcheck': 0},
        'geometry_retests': {'protected_scene_samples': protected, 'channel': channel, 'known_hole_rays': holes, 'local_ground_samples': supports, 'original_route_samples': routes, 'hill_protection': hills},
        'limitations': ['Verification binds both preview files to the same saved candidate through the recorded SHA256 ledger; it does not independently recreate or visually judge a render.', 'New bank meshes partly occlude the frozen straight water corridor. The tests certify sampled visible surface continuity, not excavation, a rerouted river or hydrodynamic correctness.', 'Visibility, channel and hill checks are discrete samples, not exhaustive intersection or every-view certification.', 'Route samples are not a navmesh, continuous collision certification, an implemented walking controller or playable roaming.'],
        'evidence_sha256': {name: file_hash(ASSETS / name) for name in evidence_names},
        'postcheck_seconds': round(time.perf_counter() - started, 3),
    }
    with OUTPUT.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    print('LANDSCAPE_FINAL_POSTCHECK', json.dumps({'passed': report['passed'], 'report': OUTPUT.name, 'failed_checks': [name for name, passed in checks.items() if not passed], 'old_files': len(baseline['preserved_files']), 'completed_renders': report['render_budget']['completed'], 'channel_sections': channel['section_count'], 'hill_samples': hills['sample_count'], 'seconds': report['postcheck_seconds']}), flush=True)
    if not report['passed']:
        raise RuntimeError('Landscape final postcheck failed; inspect the new report.')


if __name__ == '__main__':
    run()
