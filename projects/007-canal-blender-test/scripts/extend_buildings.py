import bpy

from scene_utils import box, mesh


OPPOSITE_COLLECTION = 'EXT_OppositeBuildings'
REAR_COLLECTION = 'EXT_RearDetails'
HOUSE_SPECS = (
    {'center_x': -11.0, 'width': 5.6, 'height': 5.4, 'wall': 'plaster', 'trim': 'wood'},
    {'center_x': -3.0, 'width': 5.8, 'height': 6.3, 'wall': 'plaster_alt', 'trim': 'teal'},
    {'center_x': 4.8, 'width': 5.6, 'height': 5.1, 'wall': 'plaster', 'trim': 'wood'},
)


def _batch(name, entries, materials, group):
    vertices, faces, indices = [], [], []
    material_names = list(dict.fromkeys(entry[2] for entry in entries))
    signs = ((-1, -1, -1), (-1, -1, 1), (-1, 1, -1), (-1, 1, 1), (1, -1, -1), (1, -1, 1), (1, 1, -1), (1, 1, 1))
    cube_faces = ((0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6), (0, 1, 3, 2), (4, 6, 7, 5))
    for center, size, material_name in entries:
        start = len(vertices)
        vertices.extend(tuple(center[axis] + sign[axis] * size[axis] / 2 for axis in range(3)) for sign in signs)
        faces.extend(tuple(start + index for index in face) for face in cube_faces)
        indices.extend([material_names.index(material_name)] * len(cube_faces))
    return mesh(name, vertices, faces, [materials[entry] for entry in material_names], group, indices)


def _opening(entries, center, width, height, axis, direction, trim, shutters=True, door=False):
    center_x, center_y, center_z = center

    def detail(offset_u, offset_z, span_u, span_z, thickness, projection, material):
        if axis == 'Y':
            location = (center_x + offset_u, center_y + direction * projection, center_z + offset_z)
            size = (span_u, thickness, span_z)
        else:
            location = (center_x + direction * projection, center_y + offset_u, center_z + offset_z)
            size = (thickness, span_u, span_z)
        entries.append((location, size, material))

    detail(0, 0, width, height, .065, .0475, 'wood')
    for side in (-1, 1):
        detail(side * (width / 2 + .045), 0, .09, height + .18, .09, .095, trim)
        detail(0, side * (height / 2 + .045), width + .18, .09, .09, .095, trim)
    detail(0, 0, .045, height, .045, .106, 'wood_light')
    if not door:
        detail(0, -.06, width, .055, .045, .106, 'wood_light')
        detail(0, -height / 2 - .12, width + .30, .12, .24, .135, 'stone')
    else:
        detail(0, -height * .25, width - .16, .06, .035, .10, trim)
        detail(width * .32, -.08, .045, .20, .035, .13, 'wood_light')
    if shutters:
        for side in (-1, 1):
            shutter_u = side * (width / 2 + .27)
            detail(shutter_u, 0, .34, height + .06, .085, .0875, trim)
            for batten_z in (-height * .31, height * .31):
                detail(shutter_u, batten_z, .35, .075, .025, .143, 'wood_light')


def _roof(name, center_x, width, front_y, back_y, eaves_z, ridge_z, materials):
    left_x, right_x = center_x - width / 2 - .23, center_x + width / 2 + .23
    front_edge, back_edge = front_y + .25, back_y - .25
    middle_y = (front_y + back_y) / 2
    vertices = (
        (left_x, front_edge, eaves_z), (right_x, front_edge, eaves_z),
        (left_x, back_edge, eaves_z), (right_x, back_edge, eaves_z),
        (left_x, middle_y, ridge_z), (right_x, middle_y, ridge_z),
    )
    faces = ((0, 1, 3, 2), (0, 4, 5, 1), (2, 3, 5, 4), (0, 2, 4), (1, 5, 3))
    return mesh(name, vertices, faces, [materials['roof'], materials['plaster_alt']], OPPOSITE_COLLECTION, [1, 0, 0, 1, 1])


def build():
    required = ('plaster', 'plaster_alt', 'roof', 'wood', 'wood_light', 'stone', 'teal')
    missing = [name for name in required if bpy.data.materials.get(name) is None]
    if missing:
        raise RuntimeError('Source materials unavailable: ' + ', '.join(missing))
    if any(bpy.data.collections.get(name) and bpy.data.collections[name].objects for name in (OPPOSITE_COLLECTION, REAR_COLLECTION)):
        raise RuntimeError('Extension collections already contain objects; refusing duplicate additions.')
    materials = {name: bpy.data.materials[name] for name in required}
    before = set(bpy.data.objects)
    metadata = []
    ground_z, front_y, back_y = .85, -16.35, -21.35
    for house_index, spec in enumerate(HOUSE_SPECS, 1):
        center_x, width = spec['center_x'], spec['width']
        prefix = f'EXT_Opposite_{house_index:02d}'
        ridge_z = ground_z + spec['height']
        eaves_z = ridge_z - 1.15
        body = box(prefix + '_ClosedShell', (center_x, (front_y + back_y) / 2, (ground_z + eaves_z) / 2), (width, front_y - back_y, eaves_z - ground_z), materials[spec['wall']], OPPOSITE_COLLECTION, .035)
        body['exterior_only'] = True
        body['enterable'] = False
        _roof(prefix + '_ClosedRoof', center_x, width, front_y, back_y, eaves_z, ridge_z, materials)
        box(prefix + '_StonePlinth', (center_x, (front_y + back_y) / 2, ground_z + .16), (width + .10, front_y - back_y + .10, .32), materials['stone'], OPPOSITE_COLLECTION, .025)
        trim_entries = []
        for facade_y in (front_y + .09, back_y - .09):
            trim_entries.append(((center_x, facade_y, eaves_z - .11), (width + .22, .24, .16), 'wood'))
            trim_entries.append(((center_x, facade_y, ground_z + 2.10), (width + .10, .16, .10), 'stone'))
        _batch(prefix + '_EavesAndBand', trim_entries, materials, OPPOSITE_COLLECTION)
        facade_entries = []
        upper_z = eaves_z - .99
        upper_height = min(1.30, (eaves_z - ground_z) * .30)
        for offset_x in (-width * .265, width * .265):
            _opening(facade_entries, (center_x + offset_x, front_y, upper_z), .86, upper_height, 'Y', 1, spec['trim'])
            _opening(facade_entries, (center_x + offset_x, front_y, ground_z + 1.05), .78, 1.02, 'Y', 1, spec['trim'], shutters=False)
            _opening(facade_entries, (center_x + offset_x, back_y, upper_z), .78, 1.10, 'Y', -1, 'wood', shutters=False)
        _opening(facade_entries, (center_x, front_y, ground_z + .95), .86, 1.85, 'Y', 1, spec['trim'], shutters=False, door=True)
        _opening(facade_entries, (center_x + .45, back_y, ground_z + .91), .79, 1.77, 'Y', -1, 'wood', shutters=False, door=True)
        for direction in (-1, 1):
            side_x = center_x + direction * width / 2
            for window_z in (ground_z + 1.10, upper_z):
                _opening(facade_entries, (side_x, (front_y + back_y) / 2, window_z), .90, 1.07, 'X', direction, 'wood', shutters=False)
        details = _batch(prefix + '_OpaqueWindowDoorDetails', facade_entries, materials, OPPOSITE_COLLECTION)
        details['opaque_exterior_panels'] = True
        details['enterable'] = False
        metadata.append({
            'id': house_index,
            'center_x': center_x,
            'front_y': front_y,
            'back_y': back_y,
            'width': width,
            'ground_z': ground_z,
            'height_to_ridge': spec['height'],
            'eaves_z': eaves_z,
            'ridge_z': ridge_z,
            'closed_shell': True,
            'enterable': False,
            'windows': 'Opaque dark wood panels with applied frames; no glass and no openings.',
        })
    for shop_index, center_x in enumerate((-7.0, -1.0, 5.0), 1):
        entries = []
        trim = 'teal' if shop_index == 2 else 'wood'
        for offset_x in (-1.27, 1.27):
            _opening(entries, (center_x + offset_x, 6.62, 5.90), .83, 1.34, 'Y', 1, trim)
        _opening(entries, (center_x + .73, 6.62, 1.88), .90, 1.95, 'Y', 1, trim, shutters=False, door=True)
        details = _batch(f'EXT_RearShop_{shop_index:02d}_AppliedWindowDoorDetails', entries, materials, REAR_COLLECTION)
        details['exterior_only'] = True
        details['source_wall_unchanged'] = True
        details['enterable'] = False
    created = sorted((obj for obj in bpy.data.objects if obj not in before), key=lambda item: item.name)
    for obj in created:
        if not obj.name.startswith('EXT_') or not obj.data or not obj.data.name.startswith('EXT_'):
            raise RuntimeError('Extension namespace validation failed: ' + obj.name)
    return {
        'objects': [obj.name for obj in created],
        'object_count': len(created),
        'collections': [OPPOSITE_COLLECTION, REAR_COLLECTION],
        'opposite_buildings': metadata,
        'rear_details': {'facade_y': 6.62, 'maximum_y': 6.875, 'open_route': {'x': [-13.7, 12.4], 'y': [7.1, 8.9]}, 'courtyard_partition_walls_added': False},
        'source_materials_reused_without_modification': list(required),
        'new_lights': 0,
        'new_materials': 0,
        'source_objects_modified': False,
        'operations': 'Additive exterior-only geometry; no save or render.',
    }
