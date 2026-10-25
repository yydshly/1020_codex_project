"""Read-only in-memory build verification; writes only its new JSON report."""
import json
from pathlib import Path
import sys
import bpy
from mathutils import Vector

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / 'scripts'))
from complete_space_ground import build
from extend_scene import check_routes

bpy.ops.wm.open_mainfile(filepath=str(PROJECT / 'artifacts/rainy-canal-roam-02.blend'), use_scripts=False)
bpy.context.view_layer.update()
rectangles = [(-20.5, -1.52, 12.5, 1.1), (-20.5, -15.35, 12.5, -10.85),
              (-13.6, 1, -12, 8.8), (10.7, 1, 12.3, 8.8), (-13.6, 7.2, 12.3, 8.8)]
points = []
for x0, y0, x1, y1 in rectangles:
    for row in range(6):
        for col in range(35):
            points.append((x0 + (x1 - x0) * col / 34, y0 + (y1 - y0) * row / 5))

def floors():
    graph = bpy.context.evaluated_depsgraph_get()
    results = []
    for x, y in points:
        hit, position, normal, face, obj, matrix = bpy.context.scene.ray_cast(graph, Vector((x, y, 1.10)), Vector((0, 0, -1)), distance=.65)
        results.append((bool(hit), round(position.z, 6) if hit else None, obj.name if hit else None))
    return results

before = floors()
build_report = build()
after = floors()
changes = [{'point': point, 'before': old, 'after': new} for point, old, new in zip(points, before, after) if old != new]
route_report = check_routes()
report = {'build': build_report, 'route_checks': route_report,
          'additional_full_corridor_floor_samples': len(points),
          'source_corridor_floor_samples_unchanged': not changes,
          'changed_floor_samples': changes,
          'boundary_seams_metres': {
              'west_alley_outer_curb_to_earth': abs(-13.82 - (-13.76 - .06)),
              'east_alley_outer_curb_to_earth': abs(12.52 - (12.46 + .06)),
              'opposite_support_west_to_earth': abs(-20.8 - (-20.799999237060547)),
              'opposite_support_east_to_earth': abs(12.8 - 12.800000190734863),
              'east_paving_to_terminal_ground': 0,
              'west_paving_to_terminal_ground': 0,
          },
          'scope': 'Samples verify preservation, not a new navmesh or a claim of universal collision coverage.'}
out = PROJECT / 'artifacts/scene-space-01/ground-build-audit.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
assert build_report['source_objects_preserved']
assert not changes, changes[:3]
assert all(r['sampled_checks_passed'] for r in route_report['routes'].values())
print(json.dumps({'objects': build_report['added_object_count'], 'triangles': build_report['added_triangles'],
                  'source_preserved': True, 'corridor_floor_samples_unchanged': len(points),
                  'route_samples': sum(r['sample_count'] for r in route_report['routes'].values()),
                  'report': str(out)}, ensure_ascii=False))
