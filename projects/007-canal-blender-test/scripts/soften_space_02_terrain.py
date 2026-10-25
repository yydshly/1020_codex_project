"""Soften the existing distant banks in memory, without adding an overlay.

Only vertex Z values of the two named ROAM01 terrain meshes are changed.
The root build owns saving the separate SPACE02 file and exporting previews.
"""
from collections import defaultdict
import hashlib
import math
from pathlib import Path
import struct
import sys

import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_roam_scene import river_section, smooth

TARGETS = {
    'ROAM01_North continuous terrain': 1,
    'ROAM01_South continuous terrain': -1,
}
PROTECTED_XY = (-40.0, -38.0, 40.0, 28.0)
CORE_FADE_METRES = 12.0
BANK_FLAT_END = 5.0
INLAND_RETURN = 50.0
LAND_LEVEL = .69
DISTANCES = (0.0, .6, 2.0, 5.0, 10.0, 18.0, 30.0, 48.0, 75.0, 110.0, 140.0)


def _digest(items, fmt):
    result = hashlib.sha256()
    for item in items:
        result.update(struct.pack(fmt, *item))
    return result.hexdigest()


def _protected(x, y):
    left, bottom, right, top = PROTECTED_XY
    return left <= x <= right and bottom <= y <= top


def _core_weight(x, y):
    left, bottom, right, top = PROTECTED_XY
    outside = max(left - x, x - right, bottom - y, y - top, 0.0)
    return smooth(outside / CORE_FADE_METRES)


def _distance(x, y, side):
    center, width = river_section(x)
    value = side * (y - center) - width / 2
    # Source coordinates are float32, so recover the known bank sample row
    # rather than treating a .599999m point as a different shoreline strip.
    nearest = min(DISTANCES, key=lambda d: abs(d - value))
    if abs(nearest - value) > .0001:
        raise RuntimeError(f'Unexpected source bank grid at {(x, y)}: distance={value}')
    return nearest


def _height(x, y, old_z, distance):
    # Preserve the original submerged edge, .6m shore lip, all low ground,
    # the complete built scene, and the far inland boundary verbatim.
    if distance <= .6 or distance >= INLAND_RETURN or _protected(x, y) or old_z <= LAND_LEVEL + .000001:
        return old_z
    inland_weight = smooth((distance - BANK_FLAT_END) / (INLAND_RETURN - BANK_FLAT_END))
    target = LAND_LEVEL + (old_z - LAND_LEVEL) * inland_weight
    return old_z + (target - old_z) * _core_weight(x, y)


def _protected_cell_vertices(data, points):
    """Freeze complete cells crossing the core, not just vertices inside it.

    Otherwise changing a vertex just outside the rectangle could still move
    an interpolated floor point under a preserved building inside it.
    """
    left, bottom, right, top = PROTECTED_XY
    indices = set()
    for poly in data.polygons:
        cell = [points[index] for index in poly.vertices]
        if max(p[0] for p in cell) < left or min(p[0] for p in cell) > right:
            continue
        if max(p[1] for p in cell) < bottom or min(p[1] for p in cell) > top:
            continue
        indices.update(poly.vertices)
    return indices


def profile_metrics(points, side):
    rows = defaultdict(dict)
    for x, y, z in points:
        rows[round(x, 6)][_distance(x, y, side)] = z
    segments = {}
    for a, b in zip(DISTANCES[:-1], DISTANCES[1:]):
        values = [(abs(row[b] - row[a]) / (b - a), x, row[a], row[b])
                  for x, row in rows.items() if a in row and b in row]
        maximum, at_x, z0, z1 = max(values)
        segments[f'{a:g}_to_{b:g}m'] = {
            'maximum_gradient_m_per_m': round(maximum, 7),
            'maximum_angle_degrees': round(math.degrees(math.atan(maximum)), 5),
            'at_x': at_x, 'endpoint_heights': [round(z0, 6), round(z1, 6)],
            'row_count': len(values),
        }
    close_values = [value['maximum_gradient_m_per_m'] for name, value in segments.items()
                    if name in ('0.6_to_2m', '2_to_5m', '5_to_10m')]
    return {
        'cross_bank_segments': segments,
        'maximum_near_bank_gradient_0_6_to_10m': max(close_values),
        'near_bank_note': 'Near-bank metric excludes the preserved submerged 0→.6m shore lip.',
        'x_row_count': len(rows),
    }


def build():
    object_names_before = tuple(bpy.data.objects.keys())
    material_names_before = tuple(bpy.data.materials.keys())
    report = {
        'scope': 'Edit only the two original terrain meshes in the new in-memory scene; no overlay or extension.',
        'protected_xy_rectangle': list(PROTECTED_XY),
        'protected_cell_halo': 'All vertices of every terrain cell intersecting the rectangle are frozen, preserving interpolated support heights.',
        'protected_boundary_fade_metres': CORE_FADE_METRES,
        'river_relative_profile': {'shoreline_rows_preserved_metres': [0, .6],
                                   'flat_far_bank_to_metres': BANK_FLAT_END,
                                   'full_original_inland_relief_from_metres': INLAND_RETURN,
                                   'low_bank_height_metres': LAND_LEVEL},
        'objects': {},
    }
    for name, side in TARGETS.items():
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != 'MESH':
            raise RuntimeError(f'Missing original terrain mesh: {name}')
        if any(abs(obj.matrix_world[r][c] - float(r == c)) > 1e-9 for r in range(4) for c in range(4)):
            raise RuntimeError(f'{name} has an unexpected transform; refusing to touch XY coordinates.')
        data = obj.data
        before = [tuple(v.co) for v in data.vertices]
        xy_hash = _digest(((x, y) for x, y, z in before), '<2f')
        topology = tuple(tuple(poly.vertices) for poly in data.polygons)
        smooth_flags = tuple(poly.use_smooth for poly in data.polygons)
        protected_indices = _protected_cell_vertices(data, before)
        preserved_core = {index: before[index] for index in protected_indices}
        preserved_shore = {index: point for index, point in enumerate(before) if _distance(point[0], point[1], side) <= .6}
        preserved_inland = {index: point for index, point in enumerate(before) if _distance(point[0], point[1], side) >= INLAND_RETURN}
        for vertex in data.vertices:
            if vertex.index in protected_indices:
                continue
            x, y, old_z = vertex.co
            vertex.co.z = _height(x, y, old_z, _distance(x, y, side))
        # Blender recomputes geometric normals from the changed Z coordinates;
        # the existing smooth-shading flags, topology and materials are retained.
        data.update()
        after = [tuple(v.co) for v in data.vertices]
        changed = [index for index, (old, new) in enumerate(zip(before, after)) if old[2] != new[2]]
        xy_preserved = xy_hash == _digest(((x, y) for x, y, z in after), '<2f')
        checks = {
            'xy_bitwise_preserved': xy_preserved,
            'topology_preserved': topology == tuple(tuple(poly.vertices) for poly in data.polygons),
            'smooth_flags_preserved': smooth_flags == tuple(poly.use_smooth for poly in data.polygons),
            'protected_core_vertices_preserved': all(after[i] == point for i, point in preserved_core.items()),
            'waterline_and_shore_lip_preserved': all(after[i] == point for i, point in preserved_shore.items()),
            'far_inland_vertices_preserved': all(after[i] == point for i, point in preserved_inland.items()),
        }
        if not all(checks.values()):
            raise RuntimeError(f'Terrain preservation failure: {name} {checks}')
        report['objects'][name] = {
            'vertices': len(after), 'polygons': len(data.polygons),
            'changed_z_vertices': len(changed),
            'protected_core_vertex_count': len(preserved_core),
            'shoreline_vertex_count': len(preserved_shore),
            'far_inland_vertex_count': len(preserved_inland),
            'maximum_height_reduction_metres': round(max((before[i][2] - after[i][2] for i in changed), default=0), 7),
            'xy_sha256': xy_hash,
            'before': profile_metrics(before, side), 'after': profile_metrics(after, side),
            'preservation_checks': checks,
        }
    bpy.context.view_layer.update()
    if tuple(bpy.data.objects.keys()) != object_names_before or tuple(bpy.data.materials.keys()) != material_names_before:
        raise RuntimeError('Terrain softening must not add/remove objects or materials.')
    report['objects_and_materials_added_or_removed'] = False
    report['saved_or_exported_files'] = False
    return report
