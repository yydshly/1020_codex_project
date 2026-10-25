"""Add ground-edge and bridgehead closure to the preserved roaming scene.

Only SPACE01_ meshes are appended. Existing route slabs, paving, water,
landscape and source materials are reused without edits. This is exterior
visual completion, not a repair of the already connected navigation loops.
"""
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_roam_scene import river_section, terrain_height, smooth
from scene_utils import mesh

PREFIX = 'SPACE01_'
COLLECTION = PREFIX + 'GroundEdges'


class Batch:
    def __init__(self):
        self.vertices, self.faces = [], []

    def quad(self, points):
        offset = len(self.vertices)
        self.vertices.extend(points)
        self.faces.append(tuple(range(offset, offset + len(points))))

    def prism(self, footprint, tops, bottom):
        """Closed solid, with CCW XY footprint and a sloped upper surface."""
        if isinstance(tops, (float, int)):
            tops = [tops] * len(footprint)
        area = sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(footprint, footprint[1:] + footprint[:1]))
        if area < 0:
            footprint = list(reversed(footprint))
            tops = list(reversed(tops))
        n, start = len(footprint), len(self.vertices)
        self.vertices.extend((x, y, bottom) for x, y in footprint)
        self.vertices.extend((x, y, z) for (x, y), z in zip(footprint, tops))
        self.faces.append(tuple(start + i for i in reversed(range(n))))
        self.faces.append(tuple(start + n + i for i in range(n)))
        for i in range(n):
            j = (i + 1) % n
            self.faces.append((start + i, start + j, start + n + j, start + n + i))

    def grid(self, rows):
        start, width = len(self.vertices), len(rows[0])
        self.vertices.extend(point for row in rows for point in row)
        for r in range(len(rows) - 1):
            for c in range(width - 1):
                indices = [start + r * width + c, start + (r + 1) * width + c,
                           start + (r + 1) * width + c + 1, start + r * width + c + 1]
                a, b, d = (Vector(self.vertices[i]) for i in (indices[0], indices[1], indices[3]))
                if (b - a).cross(d - a).z < 0:
                    indices.reverse()
                self.faces.append(tuple(indices))

    def finish(self, name, material, smooth_faces=False):
        if not self.faces:
            return None
        obj = mesh(PREFIX + name, self.vertices, self.faces, bpy.data.materials[material], COLLECTION)
        obj['purpose'] = 'Additive exterior edge continuity; original ground and routes are preserved.'
        if smooth_faces:
            for face in obj.data.polygons:
                face.use_smooth = True
        return obj


def _bounds(obj):
    coords = [obj.matrix_world @ Vector(point) for point in obj.bound_box]
    return {'min': [round(min(p[i] for p in coords), 5) for i in range(3)],
            'max': [round(max(p[i] for p in coords), 5) for i in range(3)]}


def _outer_lane_shoulders():
    """Small sloping margins outside raised alleys, never a new paving overlay."""
    batch = Batch()
    # The inner edge starts at the *outside* of the preserved curb.
    for inner_x, side, phase in ((-13.82, -1, .3), (12.52, 1, 1.7)):
        rows = []
        for y in (1.375, 2.2, 3.5, 5.0, 6.5, 8.0, 8.9, 9.02):
            width = 1.15 + .14 * math.sin(y * .62 + phase)
            rows.append([(inner_x, y, .81),
                         (inner_x + side * .35, y, .765),
                         (inner_x + side * width, y, .681)])
        batch.grid(rows)
    # The side edges of the opposite house support slab previously ended
    # vertically. Follow its actual stepped profile, outside its XY footprint.
    for inner_x, side in ((-20.8, -1), (12.8, 1)):
        rows = []
        for y, top in ((-15.6853, .82), (-16.05, .844), (-18, .844),
                       (-20, .844), (-22.45, .844), (-23.2, .765), (-24, .681)):
            width = 1.3 + .14 * math.sin(y * .83 + side)
            rows.append([(inner_x, y, top),
                         (inner_x + side * .35, y, top - .035),
                         (inner_x + side * width, y, .68)])
        batch.grid(rows)
    return batch.finish('OuterLaneAndCourtShoulders', 'EXT_B02_DampMineralGround', True)


def _exposed_quay_back_edges():
    """Turn exposed paving back edges into earth shoulders, away from buildings."""
    batch = Batch()
    # These four modest regions lie outside existing court/alley supports.
    # Joining surfaces end below the original paving top, with no coplanar cover.
    specs = [(-25.45, -15.12, 1.375, 1, 1.55),
             (13.84, 24, 1.375, 1, 1.55),
             (-25.45, -22.24, -15.6853, -1, 1.7),
             (14.25, 24, -15.6853, -1, 1.7)]
    for left, right, inner_y, side, width in specs:
        rows = []
        for step in range(9):
            x = left + (right - left) * step / 8
            outer = width + .13 * math.sin(x * .8)
            rows.append([(x, inner_y, .725),
                         (x, inner_y + side * .40, .705),
                         (x, inner_y + side * outer, .680)])
        batch.grid(rows)
    return batch.finish('ExposedQuayBackShoulders', 'EXT_B02_DampMineralGround', True)


def _terminal_banks():
    """Four short, river-following transitions from cut masonry to natural bank."""
    ground, stone = Batch(), Batch()
    control_report = []
    paving = bpy.data.objects['Individually worn wet quay paving']
    paving_x = [(paving.matrix_world @ v.co).x for v in paving.data.vertices]
    for start_x, direction in ((min(paving_x), -1), (max(paving_x), 1)):
        for bank_side in (-1, 1):
            # Matching the bank's actual width avoids a rectangular slab across
            # the canal. Every added earth vertex is >= .36m inland of water.
            across = (.36, .60, 1.2, 2.6, 3.4, 4.3) if bank_side > 0 else (.36, .60, 1.2, 3.2, 5.2, 6.3)
            rows = []
            for row in range(17):
                t = row / 16
                x = start_x + direction * 11.0 * t
                center, width = river_section(x)
                bank_edge = center + bank_side * width / 2
                row_points = []
                for index, distance in enumerate(across):
                    y = bank_edge + bank_side * distance
                    baseline = (-.10 + .79 * distance / .6) if distance < .6 else terrain_height(x, y)
                    # The final row and outer edge are buried 1cm into source
                    # land, hiding hard boundaries while preserving source data.
                    cross_weight = 1 - smooth((distance - across[-2]) / (across[-1] - across[-2]))
                    apron_top = .824 if distance <= across[-2] else baseline - .01
                    z = baseline - .01 + (apron_top - baseline + .01) * (1 - smooth(t)) * cross_weight
                    row_points.append((x, y, z))
                rows.append(row_points)
            ground.grid(rows)
            # Masonry runs only 6.5m beyond the old end and sinks into the bank.
            # Individual short trapezoids show a believable coursed edge.
            for piece in range(9):
                t0, t1 = piece / 9, (piece + 1) / 9
                x0 = start_x + direction * (6.5 * t0 + .006)
                x1 = start_x + direction * (6.5 * t1 - .006)
                c0, w0 = river_section(x0)
                c1, w1 = river_section(x1)
                y0, y1 = c0 + bank_side * w0 / 2, c1 + bank_side * w1 / 2
                footprint = [(x0, y0 + bank_side * .05), (x1, y1 + bank_side * .05),
                             (x1, y1 + bank_side * .36), (x0, y0 + bank_side * .36)]
                h0, h1 = .824 - .54 * smooth(t0), .824 - .54 * smooth(t1)
                stone.prism(footprint, [h0, h1, h1, h0], -.13)
            control_report.append({'start_x': start_x, 'end_x': start_x + direction * 11,
                                   'bank': 'north' if bank_side > 0 else 'south',
                                   'minimum_added_earth_distance_from_water_edge': .36,
                                   'navigation_outside_extent': True})
    return [ground.finish('QuayEndsToNaturalBank', 'EXT_B02_DampMineralGround', True),
            stone.finish('ShortDescendingQuayReturns', 'stone')], control_report


def _bridgehead_wings():
    """Low, splayed structural feet underneath and beside the bridge landings."""
    stone = Batch()
    specifications = []
    # Main bridge is centred at x=9.000119 in the preserved model. The route
    # centre is 9.4, so do not mistake that route waypoint for bridge geometry.
    for center, half_width, projection in ((9.000119, 1.325, .38), (-18.0, .98, .25)):
        for bank_y, water_direction in ((-1.7311, -1), (-10.5969, 1)):
            for side in (-1, 1):
                inner_x = center + side * half_width
                outer_x = inner_x + side * .48
                water_y = bank_y + water_direction * projection
                footprint = [(inner_x, bank_y - water_direction * .12),
                             (outer_x, bank_y - water_direction * .12),
                             (outer_x - side * .16, water_y),
                             (inner_x, water_y)]
                stone.prism(footprint, [.79, .79, .48, .48], -.25)
                specifications.append({'bridge_center_x': center, 'bank_y': bank_y,
                                       'top_max': .79, 'side': side})
    return stone.finish('BridgeheadSplayedFootings', 'stone'), specifications


def build():
    if bpy.data.collections.get(COLLECTION):
        raise RuntimeError('SPACE01 ground module is already present; refusing duplicate additions.')
    before = {o.name: (o.data.as_pointer() if o.data else None,
                       tuple(value for row in o.matrix_world for value in row),
                       tuple(c.name for c in o.users_collection)) for o in bpy.context.scene.objects}
    added = [_outer_lane_shoulders(), _exposed_quay_back_edges()]
    terminal_objects, terminals = _terminal_banks()
    added.extend(terminal_objects)
    wing, wings = _bridgehead_wings()
    added.append(wing)
    bpy.context.view_layer.update()
    unchanged = all(name in bpy.data.objects and values == (
        bpy.data.objects[name].data.as_pointer() if bpy.data.objects[name].data else None,
        tuple(value for row in bpy.data.objects[name].matrix_world for value in row),
        tuple(c.name for c in bpy.data.objects[name].users_collection)) for name, values in before.items())
    if not unchanged:
        raise RuntimeError('A source object changed during ground addition.')
    triangles = 0
    for obj in added:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    if triangles >= 10000:
        raise RuntimeError('Ground addition exceeded the triangle budget.')
    return {
        'scope': 'Ground-edge and bridgehead visual closure; already connected routes preserved.',
        'source_objects_preserved': unchanged,
        'objects': {obj.name: _bounds(obj) for obj in added},
        'added_object_count': len(added), 'added_triangles': triangles,
        'terminal_transitions': terminals, 'bridgehead_footings': wings,
        'existing_ground_overlays': False,
        'limitations': ['No new navigation areas, interiors or props.',
                       'Outer shoulders and river-end transitions are background landforms.',
                       'Bridge footings are below the .85m route and not raised parapets.'],
    }
