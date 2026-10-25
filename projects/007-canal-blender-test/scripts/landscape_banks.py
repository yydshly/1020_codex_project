import math

import bpy
from mathutils import Vector


PREFIX = 'EXT_L03_'
COLLECTION = 'EXT_Landscape03'
WATER_OBJECTS = {
    'Continuous canal with real ripple geometry',
    'EXT_B02_WestCanalContinuation',
    'EXT_B02_EastCanalContinuation',
}
PROFILES = {
    'West': [
        (-240, -1.80, -10.50),
        (-210, -1.80, -10.45),
        (-170, -1.80, -9.40),
        (-120, -2.00, -8.00),
        (-90, -2.80, -8.50),
        (-65, -4.00, -9.60),
        (-45, -2.40, -10.30),
        (-30, -1.80, -10.50),
    ],
    'East': [
        (24, -1.85, -10.45),
        (32, -2.40, -10.10),
        (44, -3.40, -9.10),
        (58, -2.10, -7.70),
        (74, -1.90, -8.10),
        (90, -1.85, -9.30),
        (108, -1.85, -10.40),
        (120, -1.85, -10.45),
    ],
}


def smooth_fraction(value):
    bounded = max(0.0, min(1.0, value))
    return bounded * bounded * (3.0 - 2.0 * bounded)


def sampled_positions(start, end, maximum_step=2.0):
    count = math.ceil((end - start) / maximum_step)
    return [start + (end - start) * index / count for index in range(count + 1)]


def water_boundaries(region, coordinate_x):
    controls = PROFILES[region]
    for first, second in zip(controls[:-1], controls[1:]):
        if first[0] <= coordinate_x <= second[0]:
            fraction = smooth_fraction((coordinate_x - first[0]) / (second[0] - first[0]))
            return tuple(first[axis] + (second[axis] - first[axis]) * fraction for axis in (1, 2))
    raise ValueError('Coordinate is outside the bank profile.')


def bank_section(region, side, coordinate_x):
    controls = PROFILES[region]
    start, end = controls[0][0], controls[-1][0]
    entrance_length = 24.0 if region == 'West' else 16.0
    envelope = smooth_fraction((coordinate_x - start) / entrance_length)
    envelope *= smooth_fraction((end - coordinate_x) / 24.0)
    shoreline = water_boundaries(region, coordinate_x)[0 if side == 'Near' else 1]
    land_direction = 1 if side == 'Near' else -1
    toe = shoreline - land_direction * .45
    waterline_height = -.12 + .10 * envelope
    if region == 'West':
        shoulder = -1.30 if side == 'Near' else -11.05
        old_rear = 1.20 if side == 'Near' else -15.50
        buried_rear = 1.45 if side == 'Near' else -15.75
        crest_height = 1.17 + .12 * math.sin(coordinate_x * .041 + (0 if side == 'Near' else 1.8))
        top = [
            (toe, -.12),
            (shoreline, waterline_height),
            (shoulder, -.12 + (crest_height + .12) * envelope),
            (old_rear, .66 + .28 * envelope),
            (buried_rear, .66),
        ]
        bottom = -.65
    else:
        buried_rear = -1.72 if side == 'Near' else -10.55
        span = buried_rear - shoreline
        crest_height = .30 + .025 * math.sin(coordinate_x * .093 + (0 if side == 'Near' else 2.0))
        top = [
            (toe, -.12),
            (shoreline, waterline_height),
            (shoreline + span * .45, -.12 + (crest_height + .12) * envelope),
            (shoreline + span * .85, -.12 + .27 * envelope),
            (buried_rear, -.18),
        ]
        bottom = -.30
    if side == 'Far':
        top.reverse()
    return top + [(top[-1][0], bottom), (top[0][0], bottom)]


def make_bank(region, side, collection, material):
    controls = PROFILES[region]
    coordinates_x = sampled_positions(controls[0][0], controls[-1][0])
    vertices = [
        (coordinate_x, coordinate_y, height)
        for coordinate_x in coordinates_x
        for coordinate_y, height in bank_section(region, side, coordinate_x)
    ]
    stride = 7
    faces = [tuple(range(stride))]
    for row in range(len(coordinates_x) - 1):
        current = row * stride
        following = current + stride
        for profile_index in range(stride):
            successor = (profile_index + 1) % stride
            faces.append((current + profile_index, following + profile_index, following + successor, current + successor))
    faces.append(tuple(range(len(vertices) - 1, len(vertices) - stride - 1, -1)))
    name = PREFIX + region + side + ('SoftBank' if region == 'West' else 'MineralShoal')
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    data.materials.append(material)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    for polygon in data.polygons[1:-1]:
        polygon.use_smooth = (polygon.index - 1) % stride < 4
    obj['additive_landscape_role'] = 'continuous low bank' if region == 'West' else 'shallow mineral accretion inside preserved stone channel'
    obj['preserved_water_not_rebuilt'] = True
    return obj


def build():
    names = [
        PREFIX + region + side + ('SoftBank' if region == 'West' else 'MineralShoal')
        for region in PROFILES
        for side in ('Near', 'Far')
    ]
    if any(name in bpy.data.objects or name in bpy.data.meshes for name in names):
        raise RuntimeError('Landscape banks already exist; refusing to replace or duplicate them.')
    missing_water = WATER_OBJECTS - set(bpy.data.objects.keys())
    if missing_water:
        raise RuntimeError('Expected preserved water is missing: ' + str(sorted(missing_water)))
    material = bpy.data.materials.get('EXT_B02_DampMineralGround')
    if material is None:
        raise RuntimeError('Expected existing mineral ground material is missing.')
    collection = bpy.data.collections.get(COLLECTION)
    if collection is None:
        collection = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(collection)
    objects = [make_bank(region, side, collection, material) for region in PROFILES for side in ('Near', 'Far')]
    vertices = sum(len(obj.data.vertices) for obj in objects)
    if vertices > 2400:
        raise RuntimeError('Landscape bank vertex budget exceeded.')
    bpy.context.view_layer.update()
    return {
        'objects': [obj.name for obj in objects],
        'counts': {'objects': len(objects), 'vertices': vertices, 'faces': sum(len(obj.data.polygons) for obj in objects), 'modifiers': 0},
        'collection': COLLECTION,
        'material_reused_without_changes': material.name,
        'control_points_xyz_description': 'Each row is x, near-bank intended waterline y, far-bank intended waterline y.',
        'control_points': PROFILES,
        'minimum_control_water_width': min(near - far for controls in PROFILES.values() for coordinate_x, near, far in controls),
        'maximum_section_spacing': 2.0,
        'west_buried_rear_y': [1.45, -15.75],
        'west_buried_rear_z': .66,
        'east_buried_rear_y': [-1.72, -10.55],
        'new_water_objects': 0,
        'scope': 'New shoreline occlusion inside the frozen straight water strip; not excavation or a reconstructed meandering river.',
    }


def check_channel(minimum_width=5.0):
    bpy.context.view_layer.update()
    scene = bpy.context.scene
    dependency_graph = bpy.context.evaluated_depsgraph_get()
    coordinates_y = [-10.6 + index * .1 for index in range(91)]
    failures = []
    sections = []
    minimum_overlap = None

    def probe(coordinate_x, coordinate_y):
        hit, position, normal, face, obj, matrix = scene.ray_cast(
            dependency_graph,
            Vector((coordinate_x, coordinate_y, 50)),
            Vector((0, 0, -1)),
            distance=51,
        )
        return bool(hit and obj.name in WATER_OBJECTS)

    for region, controls in PROFILES.items():
        previous_interval = None
        for coordinate_x in sampled_positions(controls[0][0], controls[-1][0]):
            runs = []
            current_run = []
            for coordinate_y in coordinates_y:
                if probe(coordinate_x, coordinate_y):
                    current_run.append(coordinate_y)
                elif current_run:
                    runs.append(current_run)
                    current_run = []
            if current_run:
                runs.append(current_run)
            widest = max(runs, key=len, default=[])
            interval = (widest[0], widest[-1]) if widest else None
            width = interval[1] - interval[0] if interval else 0.0
            witness_positions = [interval[0] + width * fraction for fraction in (.1, .5, .9)] if interval else []
            witnesses = [probe(coordinate_x, coordinate_y) for coordinate_y in witness_positions]
            overlap = None
            if previous_interval and interval:
                overlap = min(previous_interval[1], interval[1]) - max(previous_interval[0], interval[0])
                minimum_overlap = overlap if minimum_overlap is None else min(minimum_overlap, overlap)
            passed = width >= minimum_width - 1e-6 and all(witnesses) and (overlap is None or overlap >= minimum_width - .5)
            section = {
                'region': region,
                'x': round(coordinate_x, 4),
                'water_interval_y': [round(value, 4) for value in interval] if interval else None,
                'sampled_width_lower_bound': round(width, 4),
                'left_center_right_water': witnesses,
                'passed': passed,
            }
            sections.append(section)
            if not passed:
                failures.append(section)
            previous_interval = interval
    return {
        'passed': not failures,
        'section_count': len(sections),
        'ray_grid_y_spacing': .1,
        'maximum_section_x_spacing': 2.0,
        'required_minimum_sampled_width': minimum_width,
        'minimum_sampled_water_width': min(section['sampled_width_lower_bound'] for section in sections),
        'minimum_adjacent_water_overlap': round(minimum_overlap, 4) if minimum_overlap is not None else None,
        'allowed_original_water_objects': sorted(WATER_OBJECTS),
        'failed_sections': failures,
        'sections': sections,
        'scope': 'Top-down evaluated-scene rays at 2m longitudinal / 0.1m cross-channel spacing, plus left/center/right witnesses. Sampled surface continuity only, not hydraulic simulation or full collision certification.',
    }
