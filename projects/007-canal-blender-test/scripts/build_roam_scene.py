from collections import defaultdict
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import time

import bmesh
import bpy
from mathutils import Matrix, Vector


sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from export_viewer import digest, gltf_vector, preview_material, read_glb, scene_bounds
from extend_scene import PLAN, check_routes
from scene_utils import mesh


PROJECT_DIR = SCRIPT_DIR.parent
SOURCE = PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-03.blend'
CANDIDATE = PROJECT_DIR / 'artifacts' / 'rainy-canal-roam-01.blend'
DESTINATION = PROJECT_DIR / 'web' / 'models' / 'roam-01.glb'
MANIFEST = PROJECT_DIR / 'web' / 'models' / 'roam-01-manifest.json'
PREFIX = 'ROAM01_'
RIVER = [
    (-125, 41, 10.5), (-105, 35, 11.0), (-85, 22, 11.0),
    (-65, 6, 10.4), (-45, -3, 9.2), (-28, -6.15138, 8.74812),
    (0, -6.15138, 8.74812), (24, -6.15138, 8.74812),
    (42, -10, 9.6), (65, -22, 10.5), (90, -27, 11.0), (120, -36, 11.0),
]
REPLACED_NAMES = {
    'Continuous canal with real ripple geometry',
    'Continuous opposite bank terrain',
    'Continuous solid ground behind shop row',
    'EXT_B02_EastCanalContinuation', 'EXT_B02_WestCanalContinuation',
    'EXT_B02_NearBankContinuousGround', 'EXT_B02_FarBankContinuousGround',
    'EXT_B02_EastNearBankExtension', 'EXT_B02_EastFarBankExtension',
    'EXT_B02_WestNearBankExtension', 'EXT_B02_WestFarBankExtension',
}
CLIPPED_NAMES = {
    'Coursed waterside retaining stones', 'Individually worn wet quay paving',
    'Quayside foundation 00', 'Quayside foundation 01',
    'Retaining wall mortar 00', 'Retaining wall mortar 01',
    'Rounded quay coping stones',
}
CORE_COLLECTIONS = {
    '01 Cafe', '02 Bookshop', '03 Pottery shop', 'Bridge', 'Bridge railings',
    'EXT_OppositeBuildings', 'EXT_PathsAndEdges', 'EXT_RearDetails',
    'EXT_ReturnFootbridge', 'Bicycle', 'Cafe furniture', 'Street lamps', 'Tree',
}


def smooth(value):
    bounded = min(1.0, max(0.0, value))
    return bounded * bounded * (3.0 - 2.0 * bounded)


def river_section(coordinate_x):
    for first, second in zip(RIVER[:-1], RIVER[1:]):
        if first[0] <= coordinate_x <= second[0]:
            fraction = smooth((coordinate_x - first[0]) / (second[0] - first[0]))
            return tuple(first[axis] + (second[axis] - first[axis]) * fraction for axis in (1, 2))
    raise ValueError('River sample is outside the finite landscape.')


def object_bounds(obj):
    return scene_bounds([list(obj.matrix_world @ Vector(point)) for point in obj.bound_box])


def clip_long_mesh(obj):
    working = bmesh.new()
    working.from_mesh(obj.data)
    working.transform(obj.matrix_world)
    for coordinate_x, normal in ((-26.0, (1, 0, 0)), (24.0, (-1, 0, 0))):
        bmesh.ops.bisect_plane(
            working, geom=list(working.verts) + list(working.edges) + list(working.faces),
            dist=.00001, plane_co=(coordinate_x, 0, 0), plane_no=normal,
            clear_inner=True, clear_outer=False,
        )
    boundary_edges = [edge for edge in working.edges if edge.is_boundary]
    if boundary_edges:
        bmesh.ops.holes_fill(working, edges=boundary_edges, sides=0)
    working.normal_update()
    replacement = bpy.data.meshes.new(PREFIX + obj.data.name)
    for material in obj.data.materials:
        replacement.materials.append(material)
    working.to_mesh(replacement)
    working.free()
    obj.data = replacement
    obj.matrix_world = Matrix.Identity(4)
    replacement.update()


def compact_original():
    removed = []
    clipped = []
    core_names = {obj.name for obj in bpy.data.objects if CORE_COLLECTIONS.intersection(group.name for group in obj.users_collection)}
    core_state = {name: (bpy.data.objects[name].data.as_pointer(), tuple(value for row in bpy.data.objects[name].matrix_world for value in row)) for name in core_names}
    for obj in list(bpy.data.objects):
        if obj.name in REPLACED_NAMES or obj.name.startswith('EXT_L03_'):
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        if obj.name in CLIPPED_NAMES:
            clip_long_mesh(obj)
            clipped.append(obj.name)
            continue
        if obj.type not in {'MESH', 'CURVE', 'SURFACE', 'FONT'} or obj.name in core_names:
            continue
        bounds = object_bounds(obj)
        center = bounds['center']
        if not (-28 <= center[0] <= 22 and -26 <= center[1] <= 14):
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    preserved = all(
        name in bpy.data.objects and state == (bpy.data.objects[name].data.as_pointer(), tuple(value for row in bpy.data.objects[name].matrix_world for value in row))
        for name, state in core_state.items()
    )
    if not preserved:
        raise RuntimeError('A protected core object changed during scene compaction.')
    return {'removed_background_objects_in_new_copy': removed, 'cropped_long_quay_meshes': clipped, 'preserved_core_object_count': len(core_names), 'core_data_and_transforms_preserved': preserved}


def terrain_height(coordinate_x, coordinate_y):
    distance = math.hypot(max(-30 - coordinate_x, coordinate_x - 27, 0), max(-28 - coordinate_y, coordinate_y - 16, 0))
    lift = smooth((distance - 7) / 60)
    variation = 5.3 + 2.3 * math.sin(coordinate_x * .047 + coordinate_y * .025) + 1.2 * math.sin(coordinate_y * .071 - coordinate_x * .029)
    return .69 + lift * max(2.0, variation)


def build_compact_landscape():
    section_count = 123
    coordinates_x = [-125 + 245 * index / section_count for index in range(section_count + 1)]
    coordinates_x = sorted(set(coordinates_x + [point[0] for point in RIVER] + [-26, 24]))
    water_vertices = []
    across_count = 12
    for coordinate_x in coordinates_x:
        center_y, width = river_section(coordinate_x)
        for across in range(across_count + 1):
            coordinate_y = center_y + width * (across / across_count - .5)
            height = .008 * math.sin(coordinate_x * 1.9 + coordinate_y * 3.7) + .004 * math.sin(coordinate_x * 4.1 - coordinate_y * 2.2)
            water_vertices.append((coordinate_x, coordinate_y, height))
    water_faces = []
    stride = across_count + 1
    for row in range(len(coordinates_x) - 1):
        for across in range(across_count):
            start = row * stride + across
            water_faces.append((start, start + stride, start + stride + 1, start + 1))
    water = mesh(PREFIX + 'Curving canal water', water_vertices, water_faces, bpy.data.materials['Canal water'], PREFIX + 'Landscape')
    for polygon in water.data.polygons:
        polygon.use_smooth = True
    ground = bpy.data.materials['EXT_B02_DampMineralGround']
    distances = [0, .6, 2, 5, 10, 18, 30, 48, 75, 110, 140]
    banks = []
    for side in (-1, 1):
        vertices = []
        for coordinate_x in coordinates_x:
            center_y, width = river_section(coordinate_x)
            for distance in distances:
                coordinate_y = center_y + side * (width / 2 + distance)
                height = terrain_height(coordinate_x, coordinate_y)
                if distance == 0:
                    height = -.10
                elif distance <= .6:
                    height = .69
                vertices.append((coordinate_x, coordinate_y, height))
        faces = []
        stride = len(distances)
        for row in range(len(coordinates_x) - 1):
            for across in range(stride - 1):
                start = row * stride + across
                face = (start, start + stride, start + stride + 1, start + 1)
                faces.append(face if side > 0 else tuple(reversed(face)))
        bank = mesh(PREFIX + ('North continuous terrain' if side > 0 else 'South continuous terrain'), vertices, faces, ground, PREFIX + 'Landscape')
        for polygon in bank.data.polygons:
            polygon.use_smooth = True
        banks.append(bank.name)
    bpy.context.view_layer.update()
    return {'water_object': water.name, 'bank_objects': banks, 'river_controls_x_center_y_width': RIVER, 'core_canal_y': [-10.52544, -1.77732], 'water_level': 0, 'background_only_outside_core': True}


def export_compact_scene():
    scene = bpy.context.scene
    for obj in scene.objects:
        for modifier in obj.modifiers:
            if modifier.type in {'BEVEL', 'SUBSURF', 'WEIGHTED_NORMAL'}:
                modifier.show_viewport = False
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    batches = {}
    source_objects = list(scene.objects)
    for obj in source_objects:
        if obj.type not in {'MESH', 'CURVE', 'SURFACE', 'FONT'} or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(graph)
        source_mesh = evaluated.to_mesh()
        if source_mesh is None:
            continue
        source_mesh.calc_loop_triangles()
        maps = {}
        for triangle in source_mesh.loop_triangles:
            slot = triangle.material_index
            material = source_mesh.materials[slot] if slot < len(source_mesh.materials) else None
            key = material.name if material else 'Unassigned'
            batch = batches.setdefault(key, {'vertices': [], 'faces': [], 'smooth': [], 'material': material})
            vertex_map = maps.setdefault(key, {})
            face = []
            for vertex_index in triangle.vertices:
                if vertex_index not in vertex_map:
                    vertex_map[vertex_index] = len(batch['vertices'])
                    batch['vertices'].append(tuple(obj.matrix_world @ source_mesh.vertices[vertex_index].co))
                face.append(vertex_map[vertex_index])
            if obj.matrix_world.determinant() < 0:
                face.reverse()
            batch['faces'].append(face)
            batch['smooth'].append(source_mesh.polygons[triangle.polygon_index].use_smooth)
        evaluated.to_mesh_clear()
    export_scene = bpy.data.scenes.new(PREFIX + 'Disposable GLB export')
    bpy.context.window.scene = export_scene
    material_info = []
    for key, batch in batches.items():
        material, info = preview_material(batch['material'])
        material.name = PREFIX + 'PBR / ' + key
        data = bpy.data.meshes.new(PREFIX + 'Mesh / ' + key)
        data.from_pydata(batch['vertices'], [], batch['faces'])
        data.materials.append(material)
        data.update()
        for polygon, smooth_face in zip(data.polygons, batch['smooth']):
            polygon.use_smooth = smooth_face
        obj = bpy.data.objects.new(PREFIX + ('Water' if key == 'Canal water' else 'Surface / ' + key), data)
        export_scene.collection.objects.link(obj)
        obj.select_set(True)
        shader = material.node_tree.nodes.get('Principled BSDF')
        if key not in {'Canal water', 'glass', 'warm_glow'}:
            attribute = data.color_attributes.new(name='RoamColor', type='BYTE_COLOR', domain='POINT')
            color_values = []
            base = info['base_color_linear']
            strength = .13 if key in {'stone', 'stone_light', 'paving', 'paving_alt', 'EXT_B02_DampMineralGround'} else .065
            for coordinate_x, coordinate_y, height in batch['vertices']:
                signal = .6 * math.sin(coordinate_x * 2.17 + coordinate_y * 3.21 + height * 1.7) + .4 * math.sin(coordinate_x * 6.3 - coordinate_y * 4.7 + height * 5.4)
                factor = 1 + strength * signal
                color_values.extend([min(1.0, max(0.0, base[channel] * factor)) for channel in range(3)] + [1])
            attribute.data.foreach_set('color', color_values)
            vertex_color = material.node_tree.nodes.new('ShaderNodeVertexColor')
            vertex_color.layer_name = 'RoamColor'
            material.node_tree.links.new(vertex_color.outputs['Color'], shader.inputs['Base Color'])
            info['static_vertex_color_variation'] = True
        material_info.append(info)
    bpy.context.view_layer.update()
    bounds = scene_bounds([gltf_vector(obj.matrix_world @ Vector(point)) for obj in export_scene.objects for point in obj.bound_box])
    bpy.ops.export_scene.gltf(
        filepath=str(DESTINATION), export_format='GLB', use_selection=True, use_active_scene=True,
        export_cameras=False, export_lights=False, export_animations=False, export_extras=False,
        export_yup=True, export_apply=False, export_normals=True, export_texcoords=False,
        export_tangents=False, export_materials='EXPORT', export_vertex_color='ACTIVE',
    )
    document, counts = read_glb(DESTINATION)
    counts['nodes'] = len(document.get('nodes', []))
    counts['materials'] = len(document.get('materials', []))
    counts['meshes_with_vertex_color'] = sum('COLOR_0' in primitive['attributes'] for entry in document['meshes'] for primitive in entry['primitives'])
    if max(bounds['size']) > 450 or document.get('cameras') or document.get('extensions', {}).get('KHR_lights_punctual'):
        raise RuntimeError('Export contains unexpected giant geometry, cameras or lights.')
    return {'geometry': counts, 'bounds': bounds, 'materials': material_info, 'water_mesh_name': PREFIX + 'Water'}


def verify_background_water():
    scene = bpy.context.scene
    graph = bpy.context.evaluated_depsgraph_get()
    failures = []
    count = 0
    for index in range(124):
        coordinate_x = -124.95 + 244.9 * index / 123
        if -28 <= coordinate_x <= 24:
            continue
        center_y, width = river_section(coordinate_x)
        for lateral_fraction in (-.35, 0, .35):
            coordinate_y = center_y + width * lateral_fraction
            hit, position, normal, face, obj, matrix = scene.ray_cast(
                graph, Vector((coordinate_x, coordinate_y, 25)), Vector((0, 0, -1)), distance=27,
            )
            count += 1
            if not hit or obj.name != PREFIX + 'Curving canal water':
                failures.append({'x': coordinate_x, 'y': coordinate_y, 'object': obj.name if hit else None})
    return {
        'passed': not failures, 'ray_count': count, 'failures': failures,
        'outer_endpoint_inset_m': .05,
        'scope': 'Sampled finite background water surface only; no navigation or hydrodynamic claim.',
    }


def run():
    started = time.perf_counter()
    if any(path.exists() for path in (CANDIDATE, DESTINATION, MANIFEST)):
        raise RuntimeError('A roam-01 output already exists; refusing to overwrite it.')
    source_hash = digest(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    source_count = len(bpy.data.objects)
    changes = compact_original()
    landscape = build_compact_landscape()
    routes = check_routes()
    if not all(route['sampled_checks_passed'] for route in routes['routes'].values()):
        raise RuntimeError('An original sampled walking route failed after integration: ' + json.dumps(routes))
    integrated_count = len(bpy.context.scene.objects)
    bpy.ops.wm.save_as_mainfile(filepath=str(CANDIDATE), check_existing=True)
    candidate_hash = digest(CANDIDATE)
    bpy.ops.wm.open_mainfile(filepath=str(CANDIDATE))
    routes = check_routes()
    background_water = verify_background_water()
    if not all(route['sampled_checks_passed'] for route in routes['routes'].values()) or not background_water['passed']:
        raise RuntimeError('Saved scene reopen verification failed.')
    exported = export_compact_scene()
    if digest(SOURCE) != source_hash or digest(CANDIDATE) != candidate_hash:
        raise RuntimeError('A preserved source or saved integrated scene changed during export.')
    report = {
        'schema_version': 1, 'created_utc': datetime.now(timezone.utc).isoformat(),
        'asset': DESTINATION.name, 'bytes': DESTINATION.stat().st_size, 'sha256': digest(DESTINATION),
        'source': {'file': SOURCE.name, 'sha256': source_hash, 'object_count': source_count, 'bytes_unchanged': True},
        'integrated_blend': {'file': CANDIDATE.name, 'sha256': candidate_hash, 'object_count': integrated_count},
        'axis_mapping': 'Blender (x,y,z) -> glTF/Three (x,z,-y); meters; Y-up in glTF.',
        'core_bounds_blender_xy': [-28, -26, 22, 14],
        'walkable_policy': {'shop_interiors': 'Closed; no indoor navigation.', 'outside_marked_routes': 'Visual background or unverified ground, not automatically walkable.', 'physics': 'Original route centerline and body rays sampled; browser collision/controller are separate.'},
        'walk_routes_blender_xy': PLAN['routes'], 'sampled_route_checks': routes,
        'reopen_verified': True, 'background_water_checks': background_water,
        'scene_changes_in_new_copy_only': changes, 'landscape': landscape,
        **exported,
        'rendered': False, 'published': False,
        'limitations': ['Constant PBR plus static vertex-color variation, not Cycles appearance or baked GI.', 'Export omits source lamps, cameras, compositor haze and detailed bevel/subdivision modifiers.', 'Far landscape is a finite designed extension; not recovered geography or a complete open world.'],
        'elapsed_seconds': round(time.perf_counter() - started, 3),
    }
    with MANIFEST.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    print('ROAM_EXPORT_RESULT', json.dumps({'asset': DESTINATION.name, 'bytes': report['bytes'], 'geometry': report['geometry'], 'bounds': report['bounds'], 'core_preserved': changes['core_data_and_transforms_preserved'], 'source_unchanged': True, 'seconds': report['elapsed_seconds']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    run()
