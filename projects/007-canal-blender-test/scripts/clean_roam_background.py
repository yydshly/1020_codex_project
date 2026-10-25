from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import build_roam_scene
from export_viewer import digest
from extend_scene import check_routes


PROJECT_DIR = SCRIPT_DIR.parent
SOURCE = PROJECT_DIR / 'artifacts' / 'rainy-canal-roam-01.blend'
CANDIDATE = PROJECT_DIR / 'artifacts' / 'rainy-canal-roam-02.blend'
DESTINATION = PROJECT_DIR / 'web' / 'models' / 'roam-02.glb'
MANIFEST = PROJECT_DIR / 'web' / 'models' / 'roam-02-manifest.json'
PARENT_MANIFEST = PROJECT_DIR / 'web' / 'models' / 'roam-01-manifest.json'
TREE_PREFIX = 'Distant tree 0 '


def run():
    started = time.perf_counter()
    if any(path.exists() for path in (CANDIDATE, DESTINATION, MANIFEST)):
        raise RuntimeError('A roam-02 output already exists; refusing to overwrite it.')
    parent = json.loads(PARENT_MANIFEST.read_text(encoding='utf-8'))
    protected = [SOURCE, PARENT_MANIFEST, PROJECT_DIR / 'web' / 'models' / 'roam-01.glb', PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-03.blend']
    protected_hashes = {path: digest(path) for path in protected}
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    removed = [obj for obj in bpy.data.objects if obj.name.startswith(TREE_PREFIX)]
    if len(removed) != 102 or any([group.name for group in obj.users_collection] != ['Background planting'] for obj in removed):
        raise RuntimeError('The selected background tree does not match the audited 102-object group.')
    main_tree = {obj.name: tuple(value for row in obj.matrix_world for value in row) for obj in bpy.data.collections['Tree'].objects}
    original_names = set(bpy.data.objects.keys())
    graph = bpy.context.evaluated_depsgraph_get()
    all_points = []
    root_minimum = None
    trunk_minimum = None
    for obj in removed:
        evaluated = obj.evaluated_get(graph)
        data = evaluated.to_mesh()
        points = [obj.matrix_world @ vertex.co for vertex in data.vertices]
        all_points.extend(tuple(point) for point in points)
        minimum = min(point.z for point in points)
        if 'exposed root' in obj.name:
            root_minimum = minimum if root_minimum is None else min(root_minimum, minimum)
        if obj.name == TREE_PREFIX + 'Riverside tree tapered trunk':
            trunk_minimum = minimum
        evaluated.to_mesh_clear()
    terrain = bpy.data.objects['ROAM01_North continuous terrain']
    terrain_tree = BVHTree.FromObject(terrain, graph)
    ground_samples = []
    for coordinate_x, coordinate_y in ((18.98, 4.2), (18.98, 4.9), (19.1, 4.6)):
        origin = terrain.matrix_world.inverted() @ Vector((coordinate_x, coordinate_y, 10))
        position, normal, face, distance = terrain_tree.ray_cast(origin, Vector((0, 0, -1)), 20)
        if position is None:
            raise RuntimeError('Expected terrain support was not found before cleanup.')
        ground_samples.append({'xy': [coordinate_x, coordinate_y], 'z': float((terrain.matrix_world @ position).z)})
    removed_names = sorted(obj.name for obj in removed)
    for obj in removed:
        bpy.data.objects.remove(obj, do_unlink=True)
    remaining = set(bpy.data.objects.keys())
    if original_names - remaining != set(removed_names) or remaining - original_names:
        raise RuntimeError('Cleanup affected objects outside the single audited background tree.')
    if main_tree != {obj.name: tuple(value for row in obj.matrix_world for value in row) for obj in bpy.data.collections['Tree'].objects}:
        raise RuntimeError('The main bridge-side tree was affected.')
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(CANDIDATE), check_existing=True)
    candidate_hash = digest(CANDIDATE)
    bpy.ops.wm.open_mainfile(filepath=str(CANDIDATE))
    routes = check_routes()
    water = build_roam_scene.verify_background_water()
    if not all(route['sampled_checks_passed'] for route in routes['routes'].values()) or not water['passed']:
        raise RuntimeError('Reopened cleanup scene failed existing route or water checks.')
    integrated_count = len(bpy.data.objects)
    build_roam_scene.DESTINATION = DESTINATION
    exported = build_roam_scene.export_compact_scene()
    if any(digest(path) != expected for path, expected in protected_hashes.items()) or digest(CANDIDATE) != candidate_hash:
        raise RuntimeError('A preserved file changed during cleanup or export.')
    report = {
        **parent,
        'created_utc': datetime.now(timezone.utc).isoformat(),
        'asset': DESTINATION.name, 'bytes': DESTINATION.stat().st_size, 'sha256': digest(DESTINATION),
        'source': {'file': SOURCE.name, 'sha256': protected_hashes[SOURCE], 'object_count': len(original_names), 'bytes_unchanged': True},
        'original_extension_source': parent['source'],
        'integrated_blend': {'file': CANDIDATE.name, 'sha256': candidate_hash, 'object_count': integrated_count},
        'sampled_route_checks': routes, 'background_water_checks': water,
        'scene_changes_in_new_copy_only': {
            'operation': 'Remove one isolated 102-part background tree for visual clarity only.',
            'removed_objects': removed_names,
            'main_bridge_tree_objects_preserved': len(main_tree),
            'other_scene_geometry_unchanged': True,
            'parent_compaction': parent['scene_changes_in_new_copy_only'],
        },
        'visual_cleanup_evidence': {
            'reason': 'The overview made this isolated background tree appear detached. Its geometry was already grounded; this is visual cleanup, not correction of measured floating roots.',
            'source_tree_world_bounds': {
                'min': [min(point[axis] for point in all_points) for axis in range(3)],
                'max': [max(point[axis] for point in all_points) for axis in range(3)],
            },
            'trunk_minimum_world_z': trunk_minimum,
            'root_minimum_world_z': root_minimum,
            'ground_samples': ground_samples,
            'tree_was_already_partly_embedded': trunk_minimum < min(sample['z'] for sample in ground_samples),
            'outside_active_walking_routes': True,
        },
        **exported,
        'preserved_parent_files': [{'file': path.relative_to(PROJECT_DIR).as_posix(), 'sha256': expected, 'unchanged': True} for path, expected in protected_hashes.items()],
        'reopen_verified': True, 'rendered': False, 'published': False,
        'elapsed_seconds': round(time.perf_counter() - started, 3),
    }
    with MANIFEST.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    print('ROAM_CLEANUP_RESULT', json.dumps({'asset': DESTINATION.name, 'bytes': report['bytes'], 'removed_objects': len(removed_names), 'saved_objects': integrated_count, 'main_tree_preserved': len(main_tree), 'geometry': exported['geometry'], 'grounded_before_cleanup': report['visual_cleanup_evidence']['tree_was_already_partly_embedded'], 'parent_files_unchanged': True, 'seconds': report['elapsed_seconds']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    run()
