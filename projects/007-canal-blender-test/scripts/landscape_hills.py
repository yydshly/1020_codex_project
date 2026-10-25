import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from scene_utils import mesh


COLLECTION = 'EXT_Landscape03'
MATERIAL = 'EXT_B02_DampMineralGround'
COORDINATES_X = [-500, -425, -360, -310, -300, -260, -240, -220, -200, -190, -180, -170, -160, -150, -140, -130, -120, -110, -100, -90, -80, -75, -70, -60, -50, -40, -30, -26, -21, -14, 0, 14, 25, 45, 60, 75, 100, 130, 160, 210, 240, 280, 340, 400]
NORTH_Y = sorted(set([1.2, 3, 6, 9, 12, 16, 20, 25, 30, 35, 40, 45, 50, 58, 66, 76, 88, 102, 120, 145, 180, 230, 300, 380, 450, 10.5, 22, 42, 55, 70, 100, 150, 250]))
SOUTH_Y = sorted(set([-450, -380, -300, -230, -180, -145, -120, -102, -88, -76, -66, -58, -50, -44, -38, -33, -29, -26, -24, -21, -18, -15.5, -250, -150, -100, -70, -54, -35]))
HILLS = {
    'north': [(-135, 62, 13.3, 76, 46, .20), (-235, 110, 12.2, 105, 70, -.35), (60, 84, 7.0, 90, 52, -.30), (185, 160, 6.5, 115, 85, .35)],
    'south': [(-110, -90, 7.0, 95, 70, -.25), (-255, -155, 7.8, 100, 95, .32), (95, -110, 5.0, 95, 70, -.10)],
}


def smoothstep(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


def world_bvh(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    geometry = evaluated.to_mesh()
    try:
        geometry.calc_loop_triangles()
        vertices = [evaluated.matrix_world @ vertex.co for vertex in geometry.vertices]
        polygons = [tuple(triangle.vertices) for triangle in geometry.loop_triangles]
        return BVHTree.FromPolygons(vertices, polygons, all_triangles=True)
    finally:
        evaluated.to_mesh_clear()


def surface_height(tree, coordinate_x, coordinate_y):
    for offset_x, offset_y in ((0, 0), (.0001, .0001), (-.0001, -.0001), (.0001, -.0001), (-.0001, .0001)):
        position, normal, polygon, distance = tree.ray_cast(Vector((coordinate_x + offset_x, coordinate_y + offset_y, 100)), Vector((0, 0, -1)), 200)
        if position is not None:
            return position.z
    raise RuntimeError(f'Missing terrain below ({coordinate_x}, {coordinate_y}), including 0.1 mm seam-ray offsets.')


def hill_height(bank, coordinate_x, coordinate_y):
    height = 0.0
    for center_x, center_y, amplitude, radius_x, radius_y, angle in HILLS[bank]:
        relative_x, relative_y = coordinate_x - center_x, coordinate_y - center_y
        local_x = math.cos(angle) * relative_x + math.sin(angle) * relative_y
        local_y = -math.sin(angle) * relative_x + math.cos(angle) * relative_y
        width = radius_x * (1.08 if local_x > 0 else .88)
        height += amplitude * math.exp(-2 * ((local_x / width) ** 2 + (local_y / radius_y) ** 2))
    fade_x = smoothstep((coordinate_x - COORDINATES_X[0]) / 65) * smoothstep((COORDINATES_X[-1] - coordinate_x) / 65)
    west_blend = 1 - smoothstep((coordinate_x + 38) / 12)
    if bank == 'north':
        edge_distance = coordinate_y - NORTH_Y[0]
        protected_fade = smoothstep((coordinate_y - 12) / 20)
        outer_fade = smoothstep((NORTH_Y[-1] - coordinate_y) / 90)
    else:
        edge_distance = SOUTH_Y[-1] - coordinate_y
        protected_fade = smoothstep((-coordinate_y - 24) / 20)
        outer_fade = smoothstep((coordinate_y - SOUTH_Y[0]) / 90)
    return height * fade_x * smoothstep(edge_distance / 17) * outer_fade * (west_blend + (1 - west_blend) * protected_fade)


def boundary_edges(columns, rows):
    edges = [(index, index + 1) for index in range(columns - 1)]
    edges.extend(((rows - 1) * columns + index, (rows - 1) * columns + index + 1) for index in range(columns - 1))
    edges.extend((row * columns, (row + 1) * columns) for row in range(rows - 1))
    edges.extend((row * columns + columns - 1, (row + 1) * columns + columns - 1) for row in range(rows - 1))
    return edges


def make_cap(bank, coordinates_y, source, material):
    tree = world_bvh(source)
    vertices = [[coordinate_x, coordinate_y, surface_height(tree, coordinate_x, coordinate_y) - .03 + hill_height(bank, coordinate_x, coordinate_y)] for coordinate_y in coordinates_y for coordinate_x in COORDINATES_X]
    stride, rows = len(COORDINATES_X), len(coordinates_y)
    perimeter = boundary_edges(stride, rows)
    maximum_extra_burial = 0.0
    for first, second in perimeter:
        clearance = []
        for step in range(9):
            fraction = step / 8
            point = [vertices[first][axis] * (1 - fraction) + vertices[second][axis] * fraction for axis in range(3)]
            clearance.append(point[2] - surface_height(tree, point[0], point[1]))
        adjustment = max(0.0, max(clearance) + .03)
        if adjustment:
            vertices[first][2] -= adjustment
            vertices[second][2] -= adjustment
            maximum_extra_burial = max(maximum_extra_burial, adjustment)
    faces = []
    for row in range(rows - 1):
        for column in range(stride - 1):
            start = row * stride + column
            faces.extend([(start, start + 1, start + stride + 1), (start, start + stride + 1, start + stride)])
    obj = mesh('EXT_L03_' + bank.title() + 'RollingTerrain', vertices, faces, material, COLLECTION)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj['additive_landscape_only'] = True
    obj['preserved_height_source'] = source.name
    obj['terrain_cap_not_walkable_route'] = True
    perimeter_clearances = []
    for first, second in perimeter:
        for step in range(17):
            fraction = step / 16
            point = [vertices[first][axis] * (1 - fraction) + vertices[second][axis] * fraction for axis in range(3)]
            perimeter_clearances.append(point[2] - surface_height(tree, point[0], point[1]))
    if max(perimeter_clearances) > -.005:
        raise RuntimeError('A landscape cap perimeter would emerge above preserved terrain.')
    return obj, tree, {
        'object': obj.name,
        'source': source.name,
        'bounds_xyz': [[min(point[axis] for point in vertices), max(point[axis] for point in vertices)] for axis in range(3)],
        'vertices': len(vertices),
        'triangles': len(faces),
        'hill_parameters_center_xy_amplitude_radii_angle': HILLS[bank],
        'perimeter_sample_count': len(perimeter_clearances),
        'maximum_perimeter_clearance_above_source': max(perimeter_clearances),
        'largest_extra_perimeter_burial': maximum_extra_burial,
    }


def protection_checks(objects, sources):
    trees = {bank: world_bvh(obj) for bank, obj in objects.items()}
    protected_x = [-26, -21.1, -14, 0, 14.2, 20, 30, 45, 60, 80, 100, 130, 200, 300, 400]
    checks = []
    for bank, coordinates_y in (('north', [1.2, 3, 6, 9, 11.5, 12]), ('south', [-24, -21, -18, -15.5])):
        for coordinate_x in protected_x:
            for coordinate_y in coordinates_y:
                new_height = surface_height(trees[bank], coordinate_x, coordinate_y)
                old_height = surface_height(sources[bank], coordinate_x, coordinate_y)
                checks.append({'region': bank + '_protected_building_and_route_strip', 'xy': [coordinate_x, coordinate_y], 'cap_z': new_height, 'old_terrain_z': old_height, 'passed': new_height <= old_height - .005})
    for bank, coordinates_y in (('north', [-1.60, -.55, 1.1885]), ('south', [-15.48033, -12.65, -10.81])):
        for coordinate_x in [-25.4575, -18, -12.8, 0, 9.4, 11.5, 40, 100, 200, 243.7286]:
            for coordinate_y in coordinates_y:
                position, normal, polygon, distance = trees[bank].ray_cast(Vector((coordinate_x, coordinate_y, 100)), Vector((0, 0, -1)), 200)
                checks.append({'region': bank + '_existing_quay_exclusion', 'xy': [coordinate_x, coordinate_y], 'cap_present': position is not None, 'passed': position is None})
    return {'scope': 'Sampled cap-versus-source clearances and excluded quay strips, not a full navigation or visibility certificate.', 'sample_count': len(checks), 'passed': all(check['passed'] for check in checks), 'samples': checks}


def build():
    names = ['EXT_L03_NorthRollingTerrain', 'EXT_L03_SouthRollingTerrain']
    if any(bpy.data.objects.get(name) or bpy.data.meshes.get(name) for name in names):
        raise RuntimeError('Landscape hills already exist; refusing duplicate additions.')
    material = bpy.data.materials.get(MATERIAL)
    if material is None:
        raise RuntimeError('Preserved damp mineral ground material is unavailable.')
    source_names = {'north': 'EXT_B02_NearBankContinuousGround', 'south': 'EXT_B02_FarBankContinuousGround'}
    missing = [name for name in source_names.values() if bpy.data.objects.get(name) is None]
    if missing:
        raise RuntimeError('Missing preserved height sources: ' + ', '.join(missing))
    if len(COORDINATES_X) * (len(NORTH_Y) + len(SOUTH_Y)) > 3200:
        raise RuntimeError('Landscape hill vertex budget exceeded.')
    objects, sources, metadata = {}, {}, []
    for bank, coordinates_y in (('north', NORTH_Y), ('south', SOUTH_Y)):
        obj, source, record = make_cap(bank, coordinates_y, bpy.data.objects[source_names[bank]], material)
        objects[bank], sources[bank] = obj, source
        metadata.append(record)
    bpy.context.view_layer.update()
    protection = protection_checks(objects, sources)
    if not protection['passed']:
        raise RuntimeError('A landscape cap intrudes into a protected building, route or quay sample.')
    return {
        'objects': [obj.name for obj in objects.values()],
        'object_count': 2,
        'vertices': sum(len(obj.data.vertices) for obj in objects.values()),
        'collection': COLLECTION,
        'material_reused_unchanged': MATERIAL,
        'caps': metadata,
        'protection_checks': protection,
        'old_objects_modified': False,
        'new_lights_materials_cameras_props': 0,
        'operations': 'Two additive terrain caps only; no save or render.',
    }
