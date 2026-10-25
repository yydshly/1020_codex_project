import math
import random

from mathutils import Vector

from scene_utils import box, curve, cylinder, light, mesh, sphere


def ring(name, center, radius, material, plane='XY', thickness=0.025, group='Street furniture'):
    points = []
    for index in range(40):
        angle = index * math.tau / 40
        first = radius * math.cos(angle)
        second = radius * math.sin(angle)
        offset = (first, second, 0) if plane == 'XY' else (first, 0, second)
        points.append(tuple(center[axis] + offset[axis] for axis in range(3)))
    return curve(name, points, thickness, material, group, cyclic=True)


def leaves(name, samples, materials, group='Planting'):
    vertices = []
    faces = []
    material_indices = []
    for center, direction, size, roll, material_index in samples:
        forward = Vector(direction).normalized()
        reference = Vector((0, 0, 1)) if abs(forward.z) < 0.95 else Vector((1, 0, 0))
        side = forward.cross(reference).normalized()
        normal = forward.cross(side).normalized()
        side = side * math.cos(roll) + normal * math.sin(roll)
        normal = forward.cross(side).normalized()
        origin = Vector(center)
        start = len(vertices)
        for offset in (
            -forward * size * 0.52,
            -forward * size * 0.12 - side * size * 0.26,
            forward * size * 0.32 - side * size * 0.19,
            forward * size * 0.55,
            forward * size * 0.32 + side * size * 0.19,
            -forward * size * 0.12 + side * size * 0.26,
            normal * size * 0.08,
        ):
            vertices.append(tuple(origin + offset))
        for index in range(6):
            faces.append((start + index, start + (index + 1) % 6, start + 6))
            material_indices.append(material_index)
    return mesh(name, vertices, faces, materials, group, indices=material_indices)


def lamp(position, index, materials):
    center_x, center_y = position
    base_z = 0.85
    group = 'Street lamps'
    iron = materials['iron']
    brass = materials['brass']
    for bottom, top, radius, end_radius in (
        (0, 0.10, 0.24, 0.24),
        (0.10, 0.20, 0.20, 0.17),
        (0.20, 0.52, 0.16, 0.10),
        (0.52, 2.75, 0.072, 0.055),
        (2.75, 2.86, 0.13, 0.10),
    ):
        cylinder(f'Lamp {index} cast iron base and post', (center_x, center_y, base_z + bottom), (center_x, center_y, base_z + top), radius, iron, group, vertices=20, radius_end=end_radius)
    for height in (1.4, 3.58):
        ring(f'Lamp {index} brass collar', (center_x, center_y, height), 0.077, brass, thickness=0.014, group=group)
    lower = 3.71
    upper = 4.29
    for level, width in ((lower, 0.24), (upper, 0.43)):
        box(f'Lamp {index} lantern rim', (center_x, center_y, level), (width, width, 0.055), iron, group, edge=0.012)
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for corner_x, corner_y in corners:
        cylinder(f'Lamp {index} lantern corner', (center_x + corner_x * 0.105, center_y + corner_y * 0.105, lower), (center_x + corner_x * 0.195, center_y + corner_y * 0.195, upper), 0.017, iron, group, vertices=8)
    vertices = []
    for level, half_width in ((lower + 0.03, 0.104), (upper - 0.03, 0.19)):
        vertices.extend([(center_x + corner_x * half_width, center_y + corner_y * half_width, level) for corner_x, corner_y in corners])
    mesh(f'Lamp {index} clear lantern panes', vertices, [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], materials['glass'], group)
    cylinder(f'Lamp {index} glowing candle', (center_x, center_y, lower + 0.08), (center_x, center_y, upper - 0.12), 0.035, materials['warm_glow'], group, vertices=12)
    roof_vertices = [(center_x + corner_x * 0.28, center_y + corner_y * 0.28, 4.30) for corner_x, corner_y in corners]
    roof_vertices.append((center_x, center_y, 4.48))
    mesh(f'Lamp {index} pyramidal roof', roof_vertices, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)], iron, group)
    sphere(f'Lamp {index} brass finial', (center_x, center_y, 4.50), 0.05, brass, group)
    light(f'Lamp {index} warm light', (center_x, center_y, 4.0), (1.0, 0.52, 0.20), 195, size=0.13, kind='POINT')


def cafe(materials):
    group = 'Cafe furniture'
    iron = materials['iron']
    wood = materials['wood_light']
    table_center = (-8.0, -0.30)
    cylinder('Cafe table round stone top', (*table_center, 1.60), (*table_center, 1.67), 0.49, materials['stone_light'], group, vertices=48)
    cylinder('Cafe table pedestal', (*table_center, 0.97), (*table_center, 1.61), 0.055, iron, group, vertices=16)
    for angle in (0, math.tau / 3, math.tau * 2 / 3):
        endpoint = (table_center[0] + math.cos(angle) * 0.36, table_center[1] + math.sin(angle) * 0.36, 0.90)
        curve('Cafe table splayed foot', [(*table_center, 1.12), (table_center[0] + math.cos(angle) * 0.20, table_center[1] + math.sin(angle) * 0.20, 0.94), endpoint], 0.028, iron, group)
    for seat_index, center_x in enumerate((-8.87, -7.13)):
        center_y = -0.30
        facing = 1 if seat_index == 0 else -1
        for across in (-0.22, 0.22):
            for depth in (-0.20, 0.20):
                cylinder('Cafe chair slender foot', (center_x + depth * facing, center_y + across, 0.87), (center_x + depth * 0.85 * facing, center_y + across * 0.85, 1.31), 0.025, iron, group, vertices=8)
        for slat_index in range(5):
            box('Cafe chair wood seat slat', (center_x + (slat_index - 2) * 0.079, center_y, 1.32), (0.065, 0.44, 0.032), wood, group, edge=0.01)
        back_x = center_x - facing * 0.20
        curve('Cafe chair curved back frame', [(back_x, center_y - 0.22, 1.28), (back_x - facing * 0.06, center_y - 0.23, 1.72), (back_x - facing * 0.07, center_y - 0.14, 1.89), (back_x - facing * 0.07, center_y + 0.14, 1.89), (back_x - facing * 0.06, center_y + 0.23, 1.72), (back_x, center_y + 0.22, 1.28)], 0.025, iron, group)
        for across in (-0.14, -0.07, 0, 0.07, 0.14):
            cylinder('Cafe chair back spindle', (back_x - facing * 0.02, center_y + across, 1.40), (back_x - facing * 0.065, center_y + across, 1.80), 0.015, wood, group, vertices=8)
    cylinder('Cafe flower vase', (-8, -0.23, 1.67), (-8, -0.23, 1.85), 0.062, materials['terracotta'], group, radius_end=0.045)
    random_source = random.Random(18)
    flower_samples = []
    for index in range(9):
        endpoint = (-8 + random_source.uniform(-0.10, 0.10), -0.23 + random_source.uniform(-0.10, 0.10), random_source.uniform(1.91, 2.03))
        cylinder('Cafe vase flower stem', (-8, -0.23, 1.81), endpoint, 0.006, materials['leaf'], group, vertices=5)
        for petal in range(5):
            angle = petal * math.tau / 5
            flower_samples.append((endpoint, (math.cos(angle), math.sin(angle), 0.35), 0.075, 0.2, 0))
    leaves('Small red cafe flowers', flower_samples, [materials['book_red']], group)
    cylinder('Cafe cup', (-8.24, -0.42, 1.68), (-8.24, -0.42, 1.77), 0.047, materials['stone_light'], group, vertices=18)
    cylinder('Cafe cup saucer', (-8.24, -0.42, 1.67), (-8.24, -0.42, 1.68), 0.082, materials['stone_light'], group, vertices=24)


def bicycle(materials):
    group = 'Bicycle'
    center_x = -10.0
    center_y = 0.30
    center_z = 1.31
    iron = materials['iron']
    frame_material = materials['teal']
    wheel_centers = [(center_x - 0.64, center_y, center_z), (center_x + 0.64, center_y, center_z)]
    for index, center in enumerate(wheel_centers):
        ring(f'Bicycle wheel {index} rubber tyre', center, 0.445, materials['rubber'], plane='XZ', thickness=0.034, group=group)
        ring(f'Bicycle wheel {index} metal rim', center, 0.412, materials['brass'], plane='XZ', thickness=0.011, group=group)
        cylinder(f'Bicycle wheel {index} axle', (center[0], center_y - 0.055, center_z), (center[0], center_y + 0.055, center_z), 0.034, iron, group, vertices=10)
        for spoke in range(16):
            angle = spoke * math.tau / 16
            endpoint = (center[0] + math.cos(angle) * 0.405, center_y, center_z + math.sin(angle) * 0.405)
            cylinder('Bicycle fine spoke', (center[0], center_y + (0.04 if spoke % 2 else -0.04), center_z), endpoint, 0.004, materials['brass'], group, vertices=5)
    crank = (center_x + 0.05, center_y, 1.27)
    saddle_stem = (center_x + 0.30, center_y, 1.92)
    head = (center_x - 0.43, center_y, 1.88)
    for start, end in ((crank, saddle_stem), (saddle_stem, head), (head, crank), (crank, wheel_centers[1]), (saddle_stem, wheel_centers[1])):
        cylinder('Bicycle frame tube', start, end, 0.024, frame_material, group, vertices=10)
    for offset in (-0.05, 0.05):
        cylinder('Bicycle front fork', (head[0], center_y + offset, head[2]), (wheel_centers[0][0], center_y + offset, center_z), 0.019, frame_material, group, vertices=8)
    cylinder('Bicycle handlebar stem', head, (head[0] - 0.03, center_y, 2.08), 0.019, materials['brass'], group, vertices=10)
    curve('Bicycle swept handlebar', [(head[0] + 0.07, center_y - 0.26, 2.03), (head[0] - 0.03, center_y - 0.20, 2.08), (head[0] - 0.03, center_y + 0.20, 2.08), (head[0] + 0.07, center_y + 0.26, 2.03)], 0.019, iron, group)
    cylinder('Bicycle saddle support', saddle_stem, (saddle_stem[0], center_y, 2.02), 0.023, materials['brass'], group, vertices=10)
    sphere('Bicycle brown leather saddle', (saddle_stem[0] - 0.02, center_y, 2.03), 1, materials['wood'], group, scale=(0.16, 0.105, 0.047))
    ring('Bicycle chainwheel', (crank[0], center_y - 0.065, crank[2]), 0.13, iron, plane='XZ', thickness=0.015, group=group)
    curve('Bicycle chain', [(crank[0], center_y - 0.065, crank[2] - 0.12), (wheel_centers[1][0], center_y - 0.065, center_z - 0.045), (wheel_centers[1][0], center_y - 0.065, center_z + 0.045), (crank[0], center_y - 0.065, crank[2] + 0.12)], 0.007, iron, group, cyclic=True)
    cylinder('Bicycle pedal crank', (crank[0], center_y - 0.08, crank[2]), (crank[0] - 0.10, center_y - 0.08, crank[2] - 0.09), 0.015, materials['brass'], group, vertices=8)
    box('Bicycle pedal', (crank[0] - 0.10, center_y - 0.14, crank[2] - 0.09), (0.09, 0.15, 0.035), iron, group, edge=0.01)
    cylinder('Bicycle kickstand', crank, (crank[0] + 0.15, center_y - 0.25, 0.86), 0.013, iron, group, vertices=8)
    basket_center = (center_x - 0.73, center_y, 1.90)
    for height in (1.79, 1.92, 2.05):
        curve('Bicycle basket woven rim', [(basket_center[0] - 0.16, center_y - 0.19, height), (basket_center[0] + 0.16, center_y - 0.19, height), (basket_center[0] + 0.16, center_y + 0.19, height), (basket_center[0] - 0.16, center_y + 0.19, height)], 0.012, materials['wood_light'], group, cyclic=True)
    for index in range(6):
        fraction = index / 5
        for side in (-1, 1):
            cylinder('Bicycle basket vertical weave', (basket_center[0] - 0.16 + fraction * 0.32, center_y + side * 0.19, 1.79), (basket_center[0] - 0.16 + fraction * 0.32, center_y + side * 0.19, 2.05), 0.007, materials['wood_light'], group, vertices=5)


def planter(position, index, materials, random_source, taller=False):
    center_x, center_y = position
    group = 'Planting'
    bottom = 0.85
    height = 0.58 if taller else 0.42
    radius = 0.32 if taller else 0.27
    cylinder(f'Planter {index} terracotta pot', (center_x, center_y, bottom), (center_x, center_y, bottom + height), radius * 0.70, materials['terracotta'], group, vertices=24, radius_end=radius)
    ring(f'Planter {index} rolled rim', (center_x, center_y, bottom + height), radius, materials['terracotta'], thickness=0.034, group=group)
    cylinder(f'Planter {index} soil', (center_x, center_y, bottom + height - 0.035), (center_x, center_y, bottom + height - 0.02), radius * 0.94, materials['soil'], group, vertices=24)
    leaf_samples = []
    for branch in range(20):
        angle = random_source.uniform(0, math.tau)
        branch_height = random_source.uniform(0.45, 1.05) if taller else random_source.uniform(0.17, 0.48)
        horizontal = random_source.uniform(0.24, 0.46)
        start = Vector((center_x, center_y, bottom + height - 0.03))
        endpoint = start + Vector((math.cos(angle) * horizontal, math.sin(angle) * horizontal, branch_height))
        cylinder(f'Planter {index} growing stem', start, endpoint, 0.008, materials['wood'], group, vertices=6, radius_end=0.003)
        for leaf_index in range(18):
            fraction = random_source.uniform(0.30, 1)
            center = start.lerp(endpoint, fraction)
            leaf_angle = angle + (math.pi * 0.5 if leaf_index % 2 else -math.pi * 0.5)
            direction = Vector((math.cos(leaf_angle), math.sin(leaf_angle), random_source.uniform(-0.10, 0.60)))
            center += direction * 0.06
            leaf_samples.append((tuple(center), tuple(direction), random_source.uniform(0.14, 0.23), random_source.uniform(-1, 1), leaf_index % 3 == 0))
    leaves(f'Planter {index} leaves', leaf_samples, [materials['leaf'], materials['leaf_light']], group)


def ivy(materials, random_source):
    samples = []
    for pier_index, center_x in enumerate((-10, -4, 2, 8)):
        base_height = 1.0 if pier_index == 0 else 2.3
        top_height = 5.4 if pier_index == 0 else random_source.uniform(3.8, 4.5)
        for trail in range(5):
            points = []
            for step in range(16):
                fraction = step / 15
                center = (center_x + 0.15 * math.sin(fraction * 10 + trail * 2) + (trail - 2) * 0.10, 1.12 - 0.09 * math.sin(fraction * 6 + trail), base_height + fraction * (top_height - base_height))
                points.append(center)
                for leaf_index in range(5):
                    direction = (random_source.uniform(-1, 1), random_source.uniform(-0.6, -0.1), random_source.uniform(-0.5, 0.5))
                    leaf_center = (center[0] + direction[0] * 0.12, center[1] - 0.045, center[2] + random_source.uniform(-0.10, 0.10))
                    samples.append((leaf_center, direction, random_source.uniform(0.13, 0.22), random_source.uniform(-1.2, 1.2), random_source.randrange(2)))
            curve(f'Facade ivy {pier_index} woody trail', points, 0.009, materials['wood'], 'Planting')
    leaves('Sparse climbing ivy leaves', samples, [materials['leaf'], materials['leaf_light']])


def tree(materials, random_source):
    group = 'Tree'
    origin = Vector((8, -12.2, 0.85))
    trunk_points = [origin, origin + Vector((-0.08, 0.05, 0.9)), origin + Vector((0.05, 0.04, 1.9)), origin + Vector((-0.18, 0.11, 2.85)), origin + Vector((-0.06, 0.14, 3.8)), origin + Vector((0.24, 0.15, 4.8))]
    for index in range(len(trunk_points) - 1):
        cylinder('Riverside tree tapered trunk', trunk_points[index], trunk_points[index + 1], 0.17 * (1 - index * 0.17), materials['wood'], group, vertices=12, radius_end=0.17 * (1 - (index + 1) * 0.17))
    for root_index in range(5):
        angle = root_index * math.tau / 5
        cylinder('Riverside tree exposed root', origin + Vector((math.cos(angle) * 0.42, math.sin(angle) * 0.42, 0.01)), origin + Vector((0, 0, 0.35)), 0.025, materials['wood'], group, vertices=8, radius_end=0.10)
    samples = []
    for branch_index in range(13):
        branch_fraction = branch_index / 12
        angle = branch_index * 2.399 + 0.3
        start = origin + Vector((-0.08, 0.10, 2.05 + branch_fraction * 2.30))
        reach = 1.50 - branch_fraction * 0.65 + random_source.uniform(-0.15, 0.3)
        middle = start + Vector((math.cos(angle) * reach * 0.65, math.sin(angle) * reach * 0.65, 0.35))
        endpoint = start + Vector((math.cos(angle) * reach, math.sin(angle) * reach, 0.85 + random_source.uniform(0, 0.4)))
        cylinder('Riverside tree main branch', start, middle, 0.055 * (1 - branch_fraction * 0.4), materials['wood'], group, vertices=8, radius_end=0.022)
        cylinder('Riverside tree outer branch', middle, endpoint, 0.022, materials['wood'], group, vertices=7, radius_end=0.006)
        for twig_index in range(5):
            twig_fraction = 0.35 + twig_index * 0.13
            twig_start = middle.lerp(endpoint, twig_fraction)
            side_angle = angle + (1.0 if twig_index % 2 else -1.0)
            twig_end = twig_start + Vector((math.cos(side_angle) * 0.48, math.sin(side_angle) * 0.48, random_source.uniform(0.14, 0.40)))
            cylinder('Riverside tree twig', twig_start, twig_end, 0.009, materials['wood'], group, vertices=6, radius_end=0.002)
            for leaf_index in range(20):
                fraction = random_source.uniform(0.08, 1.05)
                center = twig_start.lerp(twig_end, fraction)
                jitter = Vector((random_source.uniform(-0.12, 0.12), random_source.uniform(-0.12, 0.12), random_source.uniform(-0.09, 0.09)))
                center += jitter
                direction = (math.cos(side_angle + leaf_index), math.sin(side_angle + leaf_index), random_source.uniform(-0.3, 0.8))
                samples.append((tuple(center), direction, random_source.uniform(0.15, 0.25), random_source.uniform(-math.pi, math.pi), random_source.randrange(2)))
    leaves('Riverside tree airy individual leaves', samples, [materials['leaf'], materials['leaf_light']], group)


def build(materials):
    random_source = random.Random(301)
    for index, position in enumerate(((-10.8, -2.2), (7.8, -2.2), (8.5, -12.1)), start=1):
        lamp(position, index, materials)
    cafe(materials)
    bicycle(materials)
    for index, position in enumerate(((-11.4, 0.62), (-4, 0.48), (2, 0.52), (8.05, 0.45), (7.2, -12.1))):
        planter(position, index, materials, random_source, taller=index in (1, 3))
    ivy(materials, random_source)
    tree(materials, random_source)
