from datetime import datetime, timezone
import json
from pathlib import Path
import sys

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from audit_boundary_extension import BASELINE, compare, snapshot
from audit_scene_extension import preserved_file_changes
from audit_v5 import file_hash, settings, website_hashes


PROJECT_DIR = SCRIPT_DIR.parent
DRAFT = PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-02.blend'
FINAL = PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-02-final.blend'
REPORT = PROJECT_DIR / 'assets' / 'boundary-02-seam-check.json'
TARGET = 'EXT_B02_ShopRearWallApron'
REFERENCE = 'EXT_Rear lane slab 3'


def coordinates(obj):
    return [tuple(vertex.co) for vertex in obj.data.vertices]


def world_coordinates(obj):
    return [tuple(obj.matrix_world @ vertex.co) for vertex in obj.data.vertices]


def render_settings():
    scene = bpy.context.scene
    return {'render': settings(scene.render), 'cycles': settings(scene.cycles)}


def run():
    if FINAL.exists() or REPORT.exists():
        raise RuntimeError('Final scene or seam report already exists; refusing to overwrite.')
    baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
    preserved = {
        path.relative_to(PROJECT_DIR).as_posix(): {'bytes': path.stat().st_size, 'sha256': file_hash(path)}
        for directory in ('artifacts', 'assets')
        for path in sorted((PROJECT_DIR / directory).rglob('*')) if path.is_file()
    }
    if preserved_file_changes(baseline['preserved_files']):
        raise RuntimeError('A frozen pre-boundary artifact changed before the seam repair.')
    before = snapshot(DRAFT)
    original_render_settings = render_settings()
    target = bpy.data.objects[TARGET]
    reference = bpy.data.objects[REFERENCE]
    if target.type != 'MESH' or reference.type != 'MESH' or target.data.users != 1:
        raise RuntimeError('Seam repair requires an independent target mesh and mesh reference.')
    before_coordinates = coordinates(target)
    before_world = world_coordinates(target)
    reference_boundary = min(point[1] for point in world_coordinates(reference))
    original_boundary = max(point[1] for point in before_world)
    if not 0 < original_boundary - reference_boundary < .002:
        raise RuntimeError('The draft does not contain the expected sub-2 mm apron overlap.')
    changed_indices = [index for index, point in enumerate(before_world) if point[1] == original_boundary]
    if len(changed_indices) != 4:
        raise RuntimeError('Unexpected maximum-Y vertex count; refusing a broader edit.')
    inverse = target.matrix_world.inverted()
    for index in changed_indices:
        point = target.matrix_world @ target.data.vertices[index].co
        point.y = reference_boundary
        target.data.vertices[index].co = inverse @ point
    target.data.update()
    bpy.context.view_layer.update()
    if max(point[1] for point in world_coordinates(target)) != reference_boundary:
        raise RuntimeError('Target edge did not match the actual lane boundary exactly.')
    if FINAL.exists():
        raise RuntimeError('Final scene appeared during validation; refusing to overwrite.')
    bpy.ops.wm.save_as_mainfile(filepath=str(FINAL), check_existing=True)
    after = snapshot(FINAL)
    repaired = bpy.data.objects[TARGET]
    after_coordinates = coordinates(repaired)
    after_world = world_coordinates(repaired)
    final_boundary = max(point[1] for point in after_world)
    actual_changes = [index for index, (old, new) in enumerate(zip(before_coordinates, after_coordinates)) if old != new]
    unchanged_target_fields = {
        name: value for name, value in before['objects'][TARGET].items() if name != 'data'
    } == {
        name: value for name, value in after['objects'][TARGET].items() if name != 'data'
    }
    unchanged_target_mesh = {
        name: value for name, value in before['objects'][TARGET]['data'].items() if name != 'coordinate_sha256'
    } == {
        name: value for name, value in after['objects'][TARGET]['data'].items() if name != 'coordinate_sha256'
    }
    object_changes = [name for name in before['objects'] if before['objects'][name] != after['objects'].get(name)]
    checks = {
        'draft_bytes_unchanged': file_hash(DRAFT) == before['sha256'],
        'all_existing_artifacts_assets_and_baseline_bytes_unchanged': not preserved_file_changes(preserved),
        'object_names_and_complexity_unchanged': before['objects'].keys() == after['objects'].keys() and before['counts'] == after['counts'],
        'only_target_object_changed': object_changes == [TARGET],
        'target_transform_modifiers_visibility_assignments_unchanged': unchanged_target_fields,
        'target_topology_attributes_materials_unchanged': unchanged_target_mesh,
        'only_four_maximum_y_vertices_changed': actual_changes == changed_indices,
        'changed_vertex_x_and_z_unchanged': all(before_coordinates[index][axis] == after_coordinates[index][axis] for index in changed_indices for axis in (0, 2)),
        'final_edge_exactly_matches_actual_lane_boundary': final_boundary == reference_boundary,
        'every_changed_vertex_matches_lane_boundary': all(after_world[index][1] == reference_boundary for index in changed_indices),
        'render_settings_unchanged': original_render_settings == render_settings(),
    }
    for category in ('materials', 'worlds', 'node_groups', 'locked_scene', 'view_layers', 'layer_collection_flags'):
        checks[category + '_unchanged_from_draft'] = before[category] == after[category]
    source_audit = compare(baseline, after, website_hashes(), preserved_file_changes(baseline['preserved_files']))
    report = {
        'schema_version': 1,
        'created_utc': datetime.now(timezone.utc).isoformat(),
        'draft': {'file': DRAFT.name, 'sha256': before['sha256']},
        'final': {'file': FINAL.name, 'sha256': after['sha256']},
        'target_object': TARGET,
        'reference_object': REFERENCE,
        'boundary_world_y': {'draft_apron_maximum': original_boundary, 'lane_actual_minimum': reference_boundary, 'final_apron_maximum': final_boundary, 'removed_overlap': original_boundary - final_boundary, 'remaining_gap_or_overlap': final_boundary - reference_boundary},
        'changed_vertex_count': len(actual_changes),
        'changed_vertex_indices': actual_changes,
        'unchanged_other_object_count': len(before['objects']) - 1,
        'draft_comparison_checks': checks,
        'old_source_full_audit': source_audit,
        'passed': all(checks.values()) and source_audit['passed'],
        'rendered': False,
        'preview_evidence': 'The two existing previews remain associated with the unchanged draft. This final file has only a four-vertex seam closure and was not rendered.',
    }
    with REPORT.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    print('BOUNDARY_SEAM_CHECK', json.dumps({'passed': report['passed'], 'final': FINAL.name, 'changed_vertices': len(actual_changes), 'remaining_gap_or_overlap': final_boundary - reference_boundary, 'rendered': False}), flush=True)
    if not report['passed']:
        raise RuntimeError('Final seam validation failed; inspect the new seam report.')


if __name__ == '__main__':
    run()
