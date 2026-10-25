import math
import random

from scene_utils import bevel, box, curve, cylinder, mesh, sphere


def _append_prism(vertices, faces, indices, minimum_x, maximum_x, profile, material_index=0):
    offset = len(vertices)
    count = len(profile)
    vertices.extend((minimum_x, coordinate_y, coordinate_z) for coordinate_y, coordinate_z in profile)
    vertices.extend((maximum_x, coordinate_y, coordinate_z) for coordinate_y, coordinate_z in profile)
    faces.append(tuple(offset + index for index in reversed(range(count))))
    faces.append(tuple(offset + count + index for index in range(count)))
    for index in range(count):
        successor = (index + 1) % count
        faces.append((offset + index, offset + successor, offset + count + successor, offset + count + index))
    indices.extend([material_index] * (count + 2))


def _append_block(vertices, faces, indices, center, dimensions, material_index=0):
    center_x, center_y, center_z = center
    width, depth, height = dimensions
    profile = [
        (center_y - depth / 2, center_z - height / 2),
        (center_y + depth / 2, center_z - height / 2),
        (center_y + depth / 2, center_z + height / 2),
        (center_y - depth / 2, center_z + height / 2),
    ]
    _append_prism(vertices, faces, indices, center_x - width / 2, center_x + width / 2, profile, material_index)


def _finish_batch(name, vertices, faces, indices, materials, group, edge=0.018):
    obj = mesh(name, vertices, faces, materials, group, indices)
    if edge:
        bevel(obj, edge, 2)
    return obj


def _deck_height(coordinate_y):
    progress = max(0.0, min(1.0, (coordinate_y + 11.0) / 8.0))
    return 0.85 + 1.45 * math.sin(progress * math.pi)


def _outer_vault_height(coordinate_y):
    normalized = (coordinate_y + 7.0) / 4.0
    return 0.02 + 1.94 * math.sqrt(max(0.0, 1.0 - normalized * normalized))


def _paving(materials, randomizer):
    vertices, faces, indices = [], [], []
    bank_ranges = [(-2.79, 1.2), (-15.5, -11.22)]
    for bank_index, (minimum_y, maximum_y) in enumerate(bank_ranges):
        box('Quayside foundation %02d' % bank_index, (5.5, (minimum_y + maximum_y) / 2, -0.02), (61.0, maximum_y - minimum_y + 0.35, 1.50), materials['mortar'], 'Canal banks', 0.03)
        current_y = minimum_y
        row_index = 0
        while current_y < maximum_y:
            row_depth = min(randomizer.uniform(0.45, 0.64), maximum_y - current_y)
            if row_depth < 0.07:
                break
            current_x = -25.0 - (0.47 if row_index % 2 else 0.0)
            while current_x < 36.0:
                stone_width = randomizer.uniform(0.63, 1.05)
                height = randomizer.uniform(0.080, 0.105)
                top_height = randomizer.uniform(0.830, 0.852)
                material_index = 0 if randomizer.random() < 0.72 else 1
                _append_block(vertices, faces, indices, (current_x + stone_width / 2, current_y + row_depth / 2, top_height - height / 2), (stone_width - 0.025, row_depth - 0.023, height), material_index)
                current_x += stone_width
            current_y += row_depth
            row_index += 1
    return _finish_batch('Individually worn wet quay paving', vertices, faces, indices, [materials['paving'], materials['paving_alt']], 'Canal banks', 0.022)


def _retaining_walls(materials, randomizer):
    vertices, faces, indices = [], [], []
    coping_vertices, coping_faces, coping_indices = [], [], []
    for bank_index, wall_y in enumerate((-3.0, -11.0)):
        box('Retaining wall mortar %02d' % bank_index, (5.5, wall_y, 0.05), (61.0, 0.37, 1.43), materials['mortar'], 'Canal banks', 0.0)
        for row_index in range(4):
            current_x = -25.6 + (0.42 if row_index % 2 else 0.0)
            while current_x < 36.0:
                width = randomizer.uniform(0.60, 1.00)
                height = 0.34 + randomizer.uniform(-0.018, 0.018)
                _append_block(vertices, faces, indices, (current_x + width / 2, wall_y, -0.56 + row_index * 0.35), (width - 0.035, randomizer.uniform(0.44, 0.51), height), 0 if randomizer.random() < 0.78 else 1)
                current_x += width
        current_x = -25.0
        while current_x < 36.0:
            width = randomizer.uniform(0.59, 0.88)
            _append_block(coping_vertices, coping_faces, coping_indices, (current_x + width / 2, wall_y, 0.755), (width - 0.022, 0.51, 0.19), 1 if randomizer.random() < 0.45 else 0)
            current_x += width
    stone_materials = [materials['stone'], materials['stone_light']]
    walls = _finish_batch('Coursed waterside retaining stones', vertices, faces, indices, stone_materials, 'Canal banks', 0.027)
    coping = _finish_batch('Rounded quay coping stones', coping_vertices, coping_faces, coping_indices, stone_materials, 'Canal banks', 0.028)
    return walls, coping


def _vault(materials, randomizer):
    vertices, faces, indices = [], [], []
    segment_count = 37
    for segment_index in range(segment_count):
        angle_start = math.pi * segment_index / segment_count + 0.0022
        angle_end = math.pi * (segment_index + 1) / segment_count - 0.0022
        profile = [
            (-7.0 + 3.62 * math.cos(angle_start), 0.02 + 1.60 * math.sin(angle_start)),
            (-7.0 + 4.00 * math.cos(angle_start), 0.02 + 1.94 * math.sin(angle_start)),
            (-7.0 + 4.00 * math.cos(angle_end), 0.02 + 1.94 * math.sin(angle_end)),
            (-7.0 + 3.62 * math.cos(angle_end), 0.02 + 1.60 * math.sin(angle_end)),
        ]
        material_index = 1 if randomizer.random() < 0.68 else 0
        _append_prism(vertices, faces, indices, 9.74, 12.26, profile, material_index)
    arch = _finish_batch('Open stone arch voussoirs and barrel vault', vertices, faces, indices, [materials['stone'], materials['stone_light']], 'Bridge', 0.012)
    for end_y in (-10.82, -3.18):
        box('Bridge submerged springing foundation', (11.0, end_y, -0.21), (2.65, 0.43, 0.53), materials['stone'], 'Bridge', 0.025)
    return arch


def _spandrels(materials, randomizer):
    vertices, faces, indices = [], [], []
    interval_count = 80
    for interval_index in range(interval_count):
        start_y = -11.0 + interval_index * 8.0 / interval_count
        end_y = -11.0 + (interval_index + 1) * 8.0 / interval_count
        profile = [
            (start_y, _outer_vault_height(start_y) - 0.015),
            (end_y, _outer_vault_height(end_y) - 0.015),
            (end_y, _deck_height(end_y) - 0.09),
            (start_y, _deck_height(start_y) - 0.09),
        ]
        _append_prism(vertices, faces, indices, 9.79, 12.21, profile)
    core = _finish_batch('Curved bridge spandrel masonry core', vertices, faces, indices, materials['mortar'], 'Bridge', 0)
    vertices, faces, indices = [], [], []
    for minimum_x, maximum_x in ((9.715, 9.805), (12.195, 12.285)):
        for row_index in range(8):
            row_bottom = 0.02 + row_index * 0.29
            row_top = row_bottom + 0.268
            current_y = -11.0
            while current_y < -3.001:
                block_width = min(randomizer.uniform(0.34, 0.51), -3.0 - current_y)
                start_y = current_y + 0.008
                end_y = current_y + block_width - 0.008
                lower_start = max(row_bottom, _outer_vault_height(start_y) + 0.006)
                lower_end = max(row_bottom, _outer_vault_height(end_y) + 0.006)
                upper_start = min(row_top, _deck_height(start_y) - 0.10)
                upper_end = min(row_top, _deck_height(end_y) - 0.10)
                if min(upper_start - lower_start, upper_end - lower_end) > 0.025:
                    profile = [(start_y, lower_start), (end_y, lower_end), (end_y, upper_end), (start_y, upper_start)]
                    _append_prism(vertices, faces, indices, minimum_x, maximum_x, profile, 1 if randomizer.random() < 0.28 else 0)
                current_y += block_width
    finish = _finish_batch('Individual bridge spandrel facing stones', vertices, faces, indices, [materials['stone'], materials['stone_light']], 'Bridge', 0.012)
    return core, finish


def _bridge_deck(materials, randomizer):
    vertices, faces, indices = [], [], []
    row_count = 25
    for row_index in range(row_count):
        start_y = -11.0 + row_index * 8.0 / row_count + 0.009
        end_y = -11.0 + (row_index + 1) * 8.0 / row_count - 0.009
        for column_index in range(5):
            minimum_x = 9.75 + column_index * 0.50 + 0.009
            maximum_x = minimum_x + 0.482
            profile = [
                (start_y, _deck_height(start_y) - 0.12),
                (end_y, _deck_height(end_y) - 0.12),
                (end_y, _deck_height(end_y)),
                (start_y, _deck_height(start_y)),
            ]
            _append_prism(vertices, faces, indices, minimum_x, maximum_x, profile, 1 if randomizer.random() < 0.30 else 0)
    deck = _finish_batch('Curved individually paved bridge deck', vertices, faces, indices, [materials['paving'], materials['paving_alt']], 'Bridge', 0.013)
    vertices, faces, indices = [], [], []
    for minimum_x, maximum_x in ((9.67, 9.89), (12.11, 12.33)):
        for segment_index in range(20):
            start_y = -11.0 + segment_index * 0.4 + 0.006
            end_y = start_y + 0.388
            profile = [
                (start_y, _deck_height(start_y) - 0.13),
                (end_y, _deck_height(end_y) - 0.13),
                (end_y, _deck_height(end_y) + 0.075),
                (start_y, _deck_height(start_y) + 0.075),
            ]
            _append_prism(vertices, faces, indices, minimum_x, maximum_x, profile)
    caps = _finish_batch('Segmented bridge parapet stone cornice', vertices, faces, indices, materials['stone_light'], 'Bridge', 0.015)
    return deck, caps


def _railings(materials):
    for side_x in (9.78, 12.22):
        for height_offset, radius in ((0.26, 0.018), (0.74, 0.020), (0.91, 0.029)):
            points = [(side_x, -11.0 + step * 0.1, _deck_height(-11.0 + step * 0.1) + height_offset) for step in range(81)]
            curve('Sweeping iron bridge rail', points, radius, materials['iron'], 'Bridge railings')
        for post_index in range(27):
            coordinate_y = -10.9 + post_index * 0.3
            base_height = _deck_height(coordinate_y)
            substantial = post_index % 4 == 1
            post_radius = 0.032 if substantial else 0.018
            cylinder('Bridge iron baluster', (side_x, coordinate_y, base_height + 0.06), (side_x, coordinate_y, base_height + 0.94), post_radius, materials['iron'], 'Bridge railings', vertices=8)
            if substantial:
                sphere('Brass railing finial', (side_x, coordinate_y, base_height + 0.98), 0.045, materials['brass'], 'Bridge railings')
                cylinder('Baluster foot collar', (side_x, coordinate_y, base_height + 0.065), (side_x, coordinate_y, base_height + 0.15), 0.052, materials['iron'], 'Bridge railings', vertices=8)
        for end_y in (-11.0, -3.0):
            box('Bridge square stone end post', (side_x, end_y, 1.38), (0.29, 0.31, 1.08), materials['stone_light'], 'Bridge railings', 0.022)
            box('Bridge end post lower collar', (side_x, end_y, 0.97), (0.37, 0.39, 0.16), materials['stone'], 'Bridge railings', 0.021)
            box('Bridge end post cap', (side_x, end_y, 1.96), (0.39, 0.41, 0.14), materials['stone_light'], 'Bridge railings', 0.025)


def build(materials):
    randomizer = random.Random(271828)
    paving = _paving(materials, randomizer)
    walls = _retaining_walls(materials, randomizer)
    arch = _vault(materials, randomizer)
    spandrels = _spandrels(materials, randomizer)
    deck = _bridge_deck(materials, randomizer)
    _railings(materials)
    return {'paving': paving, 'retaining_walls': walls, 'arch': arch, 'spandrels': spandrels, 'deck': deck}
