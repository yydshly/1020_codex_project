"""Validate the terrain edit in memory; never save a Blender file or export."""
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / 'scripts'))
from soften_space_02_terrain import build, TARGETS
from extend_scene import check_routes

SOURCE = PROJECT / 'artifacts/rainy-canal-space-01.blend'

def file_hash(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        while chunk := source.read(1048576):
            result.update(chunk)
    return result.hexdigest()

def scene_signature(exclude_targets=True):
    result = hashlib.sha256()
    for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name):
        result.update(repr((obj.name, obj.type, tuple(tuple(row) for row in obj.matrix_world),
                            tuple(c.name for c in obj.users_collection), obj.hide_render,
                            obj.hide_viewport)).encode())
        if exclude_targets and obj.name in TARGETS:
            continue
        if obj.type == 'MESH':
            for vertex in obj.data.vertices:
                result.update(struct.pack('<3f', *vertex.co))
            for face in obj.data.polygons:
                result.update(repr((tuple(face.vertices), face.material_index, face.use_smooth)).encode())
            result.update(repr(tuple(m.name if m else None for m in obj.data.materials)).encode())
        elif obj.data:
            result.update(repr((obj.data.as_pointer(), obj.data.name)).encode())
    return result.hexdigest()

def supports(points):
    graph = bpy.context.evaluated_depsgraph_get()
    output = {}
    for label, (x, y) in points.items():
        hit, position, normal, face, obj, matrix = bpy.context.scene.ray_cast(
            graph, Vector((x, y, 1.08)), Vector((0, 0, -1)), distance=.8)
        output[label] = {'hit': bool(hit), 'z': position.z if hit else None,
                         'object': obj.name if hit else None}
    return output

before_file_hash = file_hash(SOURCE)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE), use_scripts=False)
bpy.context.view_layer.update()
before_signature = scene_signature()
before_routes = check_routes()
points = {
    'rear_lane_west': (-12.8, 8), 'rear_lane_mid': (0, 8), 'rear_lane_east': (11.5, 8),
    'near_west_bridge': (-18, -1.4), 'far_west_bridge': (-18, -10.9),
    'near_east_bridge': (9.4, -1.4), 'far_east_bridge': (9.4, -10.9),
    'west_quay_terminal_north': (-35, 1.6), 'east_quay_terminal_south': (34, -16.2),
    'north_new_house_land': (-3.0, 22.8), 'south_new_house_land': (-8, -33.2),
}
before_supports = supports(points)
build_report = build()
after_signature = scene_signature()
after_routes = check_routes()
after_supports = supports(points)
unchanged_supports = before_supports == after_supports
report = {
    'build': build_report,
    'all_non_target_objects_signature_unchanged': before_signature == after_signature,
    'route_checks': after_routes,
    'route_checks_identical_to_source': before_routes == after_routes,
    'support_probes': {'before': before_supports, 'after': after_supports, 'identical': unchanged_supports},
    'source_disk_sha256_before': before_file_hash,
    'source_disk_sha256_after': file_hash(SOURCE),
    'no_blend_saved_no_glb_exported': True,
}
output = PROJECT / 'artifacts/scene-space-02/terrain-build-audit.json'
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
assert report['all_non_target_objects_signature_unchanged']
assert report['route_checks_identical_to_source']
assert unchanged_supports
assert report['source_disk_sha256_before'] == report['source_disk_sha256_after']
assert all(item['sampled_checks_passed'] for item in after_routes['routes'].values())
print(json.dumps({'result': 'PASS', 'objects': {name: {
    'changed_z_vertices': detail['changed_z_vertices'],
    'before_near_bank_gradient': detail['before']['maximum_near_bank_gradient_0_6_to_10m'],
    'after_near_bank_gradient': detail['after']['maximum_near_bank_gradient_0_6_to_10m'],
} for name, detail in build_report['objects'].items()},
    'route_samples': sum(r['sample_count'] for r in after_routes['routes'].values()),
    'unchanged_support_probes': len(points), 'report': str(output)}, ensure_ascii=False))
