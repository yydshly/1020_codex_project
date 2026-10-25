import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from audit_boundary_extension import BASELINE, COLLECTION, SOURCE, compare, snapshot
from audit_scene_extension import preserved_file_changes
from audit_v5 import file_hash, website_hashes
from extend_scene import check_routes
from scene_utils import mesh, rgb


PROJECT_DIR = SCRIPT_DIR.parent
CANDIDATE = PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-02.blend'
LEDGER = PROJECT_DIR / 'assets' / 'boundary-02-render-ledger.json'
PREFIX = 'EXT_B02_'
CAMERAS = ('EXT_Review_Overview', 'EXT_Review_ReverseRear')
EXTENT = 1600.0
EDGE_PROBES = {
    'overview_blue_strip_01': (CAMERAS[0], (-29.28, -1.96, .67)),
    'overview_blue_strip_02': (CAMERAS[0], (-27.40, -2.00, .67)),
    'overview_blue_strip_03': (CAMERAS[0], (-26.07, -1.87, .67)),
    'reverse_missing_bank_01': (CAMERAS[1], (-56.5, .35, .67)),
    'reverse_missing_bank_02': (CAMERAS[1], (-89.0, -.77, .67)),
    'reverse_missing_canal': (CAMERAS[1], (-116.8, -6.37, .67)),
    'reverse_missing_bank_03': (CAMERAS[1], (-139.8, -.23, .67)),
}


def write_json(name, value):
    path = PROJECT_DIR / 'assets' / name
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def new_mesh(name, vertices, faces, material):
    obj = mesh(PREFIX + name, vertices, faces, material, COLLECTION)
    obj['boundary_only_addition'] = True
    return obj


def ground_material():
    material = bpy.data.materials.new(PREFIX + 'DampMineralGround')
    material.use_nodes = True
    material.diffuse_color = rgb('7C8070')
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .9
    shader.inputs['Specular IOR Level'].default_value = .24
    geometry = nodes.new('ShaderNodeNewGeometry')
    variation = nodes.new('ShaderNodeTexNoise')
    variation.inputs['Scale'].default_value = .32
    variation.inputs['Detail'].default_value = 3
    links.new(geometry.outputs['Position'], variation.inputs['Vector'])
    colors = nodes.new('ShaderNodeValToRGB')
    colors.color_ramp.elements[0].position = .23
    colors.color_ramp.elements[0].color = rgb('626B5F')
    colors.color_ramp.elements[1].position = .78
    colors.color_ramp.elements[1].color = rgb('8D8875')
    links.new(variation.outputs['Fac'], colors.inputs['Fac'])
    links.new(colors.outputs['Color'], shader.inputs['Base Color'])
    grain = nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 28
    grain.inputs['Detail'].default_value = 2
    links.new(geometry.outputs['Position'], grain.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .16
    bump.inputs['Distance'].default_value = .018
    links.new(grain.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return material


def grid_surface(name, coordinates_x, coordinates_y, height, material, smooth=False):
    vertices = [(coordinate_x, coordinate_y, height(coordinate_x, coordinate_y)) for coordinate_y in coordinates_y for coordinate_x in coordinates_x]
    faces = []
    stride = len(coordinates_x)
    for row in range(len(coordinates_y) - 1):
        for column in range(stride - 1):
            start = row * stride + column
            faces.append((start, start + 1, start + stride + 1, start + stride))
    obj = new_mesh(name, vertices, faces, material)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def profile_prism(name, minimum_x, maximum_x, top_profile, material, bottom=.66):
    profile = [(top_profile[0][0], bottom), *top_profile, (top_profile[-1][0], bottom)]
    count = len(profile)
    vertices = [(coordinate_x, coordinate_y, height) for coordinate_x in (minimum_x, maximum_x) for coordinate_y, height in profile]
    faces = [tuple(range(count)), tuple(range(count * 2 - 1, count - 1, -1))]
    for index in range(count):
        successor = (index + 1) % count
        faces.append((index, index + count, successor + count, successor))
    return new_mesh(name, vertices, faces, material)


def terrain_height(coordinate_x, coordinate_y):
    distance = max(coordinate_y - 42, -coordinate_y - 54, 0)
    variation = .72 + .16 * math.sin(coordinate_x * .019) + .12 * math.sin(coordinate_x * .047 + .8)
    return .69 + 9 * (1 - math.exp(-distance / 65)) * variation


def build_terrain(material):
    coordinates_x = [-EXTENT, -800, -300, -160, -110, -75, -50, -30, -21, -14, 0, 14, 25, 45, 75, 130, 240, 500, 825, 1100, EXTENT]
    near_rows = [1.2, 10.5, 22, 42, 55, 70, 100, 150, 250, 450, 800, EXTENT]
    far_rows = [-EXTENT, -800, -450, -250, -150, -100, -70, -54, -35, -24, -15.5]
    grid_surface('NearBankContinuousGround', coordinates_x, near_rows, terrain_height, material, True)
    grid_surface('FarBankContinuousGround', coordinates_x, far_rows, terrain_height, material, True)


def build_local_connections(material):
    paving = bpy.data.materials['paving']
    rear_lane = bpy.data.objects['EXT_Rear lane slab 3']
    rear_lane_start = min((rear_lane.matrix_world @ vertex.co).y for vertex in rear_lane.data.vertices)
    profile_prism('ShopRearWallApron', -11.9, 10.6, [(6.599, .85), (rear_lane_start, .85)], paving)
    profile_prism('ShopWestSideInfill', -11.9, -9.9, [(1.195, .815), (1.6, .85), (6.599, .85)], material)
    profile_prism('ShopEastSideInfill', 7.9, 10.6, [(1.195, .815), (1.6, .85), (6.599, .85)], material)
    profile_prism('RearLaneBoundaryShoulder', -14.16, 12.86, [(9.02, .85), (10.23, .84), (10.47, .84), (11.5, .69)], material)
    profile_prism('OppositeBuildingsContinuousSupport', -20.8, 12.8, [(-22.45, .85), (-16.05, .85), (-15.85, .85), (-15.485, .815)], paving)
    profile_prism('OppositeBoundaryOuterShoulder', -20.8, 12.8, [(-24, .69), (-22.47, .85), (-22.45, .85)], material)


def build_canal_edges():
    material = bpy.data.materials['stone']
    near_profile = [(-2.03, -.08), (-1.62, .82), (1.20, .82)]
    far_profile = [(-15.5, .82), (-10.79, .82), (-10.40, -.08)]
    for side, minimum_x, maximum_x in [('West', -EXTENT, -25.0), ('East', 229.2, EXTENT)]:
        profile_prism(side + 'NearBankExtension', minimum_x, maximum_x, near_profile, material, -.65)
        profile_prism(side + 'FarBankExtension', minimum_x, maximum_x, far_profile, material, -.65)


def build_canal_water():
    source = bpy.data.objects['Continuous canal with real ripple geometry']
    points = [source.matrix_world @ vertex.co for vertex in source.data.vertices]
    extremes = min(point.x for point in points), max(point.x for point in points)
    material = bpy.data.materials['Canal water']
    for side, coordinate_x in zip(('West', 'East'), extremes):
        edge = sorted([point for point in points if abs(point.x - coordinate_x) < .001], key=lambda point: point.y)
        if len(edge) < 2:
            raise RuntimeError('Could not identify the preserved canal edge.')
        coordinates_x = [-EXTENT, -800, -300, -160, -80, coordinate_x] if side == 'West' else [coordinate_x, 900, 1200, EXTENT]
        vertices = [(position_x, point.y, point.z) for point in edge for position_x in coordinates_x]
        stride = len(coordinates_x)
        faces = []
        for row in range(len(edge) - 1):
            for column in range(stride - 1):
                start = row * stride + column
                faces.append((start, start + 1, start + stride + 1, start + stride))
        obj = new_mesh(side + 'CanalContinuation', vertices, faces, material)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return {'source_edge_x': list(extremes), 'new_outer_edge_x': [-EXTENT, EXTENT], 'seam': 'New first/last vertex row matches original water boundary coordinates exactly; original water is unchanged.'}


def probe_edges():
    scene = bpy.context.scene
    graph = bpy.context.evaluated_depsgraph_get()
    results = {}
    for name, (camera_name, point) in EDGE_PROBES.items():
        origin = bpy.data.objects[camera_name].matrix_world.translation
        direction = (Vector(point) - origin).normalized()
        hit, position, normal, face_index, obj, matrix = scene.ray_cast(graph, origin, direction, distance=3000)
        results[name] = {'hit': hit, 'object': obj.name if hit else None, 'position': list(position) if hit else None}
    return results


def probe_local_connections():
    points = {'rear_cafe': (-7, 6.85), 'rear_bookshop': (0, 6.85), 'rear_pottery': (5, 6.85), 'west_side': (-11, 4), 'east_side': (9, 4), 'rear_boundary': (0, 9.6), 'far_house_01_front': (-11, -16.15), 'far_house_02_front': (-3, -16.15), 'far_house_03_front': (4.8, -16.15)}
    scene = bpy.context.scene
    graph = bpy.context.evaluated_depsgraph_get()
    results = {}
    for name, (coordinate_x, coordinate_y) in points.items():
        hit, position, normal, face_index, obj, matrix = scene.ray_cast(graph, Vector((coordinate_x, coordinate_y, 1.08)), Vector((0, 0, -1)), distance=.7)
        results[name] = {'hit': hit, 'height': position.z if hit else None, 'object': obj.name if hit else None}
    return results


def render_review(camera_name, index):
    ledger = json.loads(LEDGER.read_text(encoding='utf-8')) if LEDGER.exists() else {'maximum_attempts': 2, 'attempts': []}
    if len(ledger['attempts']) >= 2:
        raise RuntimeError('The two low-resolution render attempts have been consumed.')
    path = PROJECT_DIR / 'assets' / f'boundary-02-preview-{index:02d}.png'
    if path.exists():
        raise RuntimeError('Existing preview will not be overwritten.')
    scene = bpy.context.scene
    scene.camera = bpy.data.objects[camera_name]
    scene.render.resolution_x = 1104
    scene.render.resolution_y = 622
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 32
    scene.cycles.adaptive_threshold = .03
    scene.render.filepath = str(path)
    attempt = {'camera': camera_name, 'image': path.name, 'status': 'started', 'started_utc': datetime.now(timezone.utc).isoformat(), 'resolution': [1104, 622], 'samples': 32}
    ledger['attempts'].append(attempt)
    write_json(LEDGER.name, ledger)
    started = time.perf_counter()
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as error:
        attempt.update(status='failed', error=str(error))
        write_json(LEDGER.name, ledger)
        raise
    attempt.update(status='complete', seconds=round(time.perf_counter() - started, 3), sha256=file_hash(path))
    write_json(LEDGER.name, ledger)
    return attempt


def run():
    parser = argparse.ArgumentParser(description='Add terrain continuity and floor infill without modifying the preserved exterior scene.')
    parser.add_argument('--render', action='store_true')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if CANDIDATE.exists() or LEDGER.exists():
        raise RuntimeError('Refusing to replace an existing boundary candidate or restart its render budget.')
    baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
    if preserved_file_changes(baseline['preserved_files']):
        raise RuntimeError('A protected old artifact changed before the build.')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    before_edges = probe_edges()
    before_connections = probe_local_connections()
    original_names = set(bpy.data.objects.keys())
    material = ground_material()
    build_terrain(material)
    build_local_connections(material)
    build_canal_edges()
    water = build_canal_water()
    bpy.context.view_layer.update()
    after_edges = probe_edges()
    after_connections = probe_local_connections()
    routes = check_routes()
    if not all(result['hit'] for result in after_edges.values()):
        raise RuntimeError('At least one known background hole remains open.')
    if not all(result['hit'] and .83 <= result['height'] <= .86 for result in after_connections.values()):
        raise RuntimeError('Local foundation and path connections failed the height check.')
    if not all(result['sampled_checks_passed'] for result in routes['routes'].values()):
        raise RuntimeError('An existing sampled route was obstructed.')
    added = [obj for obj in bpy.data.objects if obj.name not in original_names]
    if len(added) > 16 or sum(len(obj.data.vertices) for obj in added if obj.type == 'MESH') > 1800:
        raise RuntimeError('Boundary geometry exceeded its small additive budget.')
    bpy.ops.wm.save_as_mainfile(filepath=str(CANDIDATE), check_existing=True)
    candidate_snapshot = snapshot(CANDIDATE)
    audit = compare(baseline, candidate_snapshot, website_hashes(), preserved_file_changes(baseline['preserved_files']))
    write_json('boundary-02-audit.json', audit)
    if not audit['passed']:
        raise RuntimeError('Preservation audit failed: ' + str(audit['violations']))
    diagnostics = {'known_hole_rays_before': before_edges, 'known_hole_rays_after': after_edges, 'local_support_before': before_connections, 'local_support_after': after_connections, 'existing_route_sampling': routes, 'scope': 'Limited geometry and ray diagnostics, not a full navigation or collision certification.'}
    write_json('boundary-02-diagnostics.json', diagnostics)
    report = {'source': SOURCE.name, 'candidate': CANDIDATE.name, 'candidate_sha256': file_hash(CANDIDATE), 'audit_passed': True, 'added_counts': audit['added_counts'], 'new_materials': audit['added_datablocks']['materials'], 'reversible_collection': COLLECTION, 'source_camera_retained_in_saved_file': True, 'water_connection': water, 'new_lights_cameras_props_buildings': 0, 'new_ground_surface': 'Independent damp mineral terrain at z=.69 over old soil z=.67; continuous low relief starts outside the active area. Existing paving and soil data remain unchanged.', 'local_infill': 'Shop rear and side gaps; opposite-house foundations and frontage; rear-boundary shoulders. Bridges unchanged.', 'rendered_previews': [], 'website_updated': False, 'finished_world': False}
    if options.render:
        preferences = bpy.context.preferences.addons['cycles'].preferences
        preferences.compute_device_type = 'OPTIX'
        preferences.get_devices()
        for device in preferences.devices:
            device.use = device.type == 'OPTIX'
        if not any(device.use for device in preferences.devices):
            raise RuntimeError('OptiX device unavailable; no render started.')
        for index, camera_name in enumerate(CAMERAS, 1):
            report['rendered_previews'].append(render_review(camera_name, index))
    report['old_files_unchanged_after_render'] = not preserved_file_changes(baseline['preserved_files'])
    report['websites_unchanged_after_render'] = website_hashes() == baseline['websites']
    write_json('boundary-02-stats.json', report)
    if not report['old_files_unchanged_after_render'] or not report['websites_unchanged_after_render']:
        raise RuntimeError('Post-render preservation check failed.')
    print('BOUNDARY_RESULT', json.dumps({'candidate': CANDIDATE.name, 'added': report['added_counts'], 'renders': len(report['rendered_previews']), 'preserved': report['old_files_unchanged_after_render']}), flush=True)


if __name__ == '__main__':
    run()
