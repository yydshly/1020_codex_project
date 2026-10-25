"""In-memory roof verification. No source file, blend or GLB is written."""
import hashlib
import json
from pathlib import Path
import sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PROJECT/'scripts'))
from refine_space_03_roofs import build, TARGETS
from extend_scene import check_routes

SOURCE = PROJECT/'artifacts/rainy-canal-space-02.blend'
before_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE),use_scripts=False)
bpy.context.view_layer.update()
before_routes = check_routes()
source_roof_transforms = {name:tuple(tuple(row) for row in bpy.data.objects[name].matrix_world) for name in TARGETS}
source_roof_materials = {name:tuple(m.name for m in bpy.data.objects[name].data.materials) for name in TARGETS}
report = build()
after_routes = check_routes()
normals = {}
for house in report['houses']:
    deck = bpy.data.objects[house['source_roof']]
    tile = bpy.data.objects[house['new_objects'][0]]
    tile.data.calc_loop_triangles()
    bad_up = []
    # Tile top faces are the first two faces in each repeating tile triplet.
    tile_count = house['details']['tile_count']
    for tile_index in range(tile_count):
        for face in tile.data.polygons[tile_index*3:tile_index*3+2]:
            if face.normal.z <= .5:
                bad_up.append(face.index)
    zero_areas = []
    for name in [house['source_roof'],*house['new_objects']]:
        obj = bpy.data.objects[name]
        for face in obj.data.polygons:
            if face.area <= 1e-10:
                zero_areas.append([name,face.index])
    # Rays verify both pitched surfaces and the outward side-gable faces.
    verts = [v.co.copy() for v in deck.data.vertices]
    tree = BVHTree.FromPolygons(verts,[tuple(p.vertices) for p in deck.data.polygons])
    center_x = (house['original_bounds']['min'][0]+house['original_bounds']['max'][0])/2
    ridge = house['original_ridge_z']
    front_hit = tree.ray_cast(Vector((center_x,-17.2,ridge+1)),Vector((0,0,-1)),3)
    rear_hit = tree.ray_cast(Vector((center_x,-20.5,ridge+1)),Vector((0,0,-1)),3)
    side_hits = []
    for direction in (-1,1):
        origin_x = house['original_bounds']['min'][0]-1 if direction<0 else house['original_bounds']['max'][0]+1
        hit = tree.ray_cast(Vector((origin_x,-18.85,ridge-.45)),Vector((-direction,0,0)),3)
        side_hits.append({'hit':hit[0] is not None,'normal':list(hit[1]) if hit[1] else None,
                          'outward_normal':bool(hit[1] and hit[1].x*direction>.9)})
    normals[deck.name] = {'upward_tile_surface_failures':bad_up,'zero_area_faces':zero_areas,
                          'front_pitch_normal':list(front_hit[1]) if front_hit[1] else None,
                          'back_pitch_normal':list(rear_hit[1]) if rear_hit[1] else None,
                          'side_gable_rays':side_hits}
    assert not bad_up and not zero_areas
    assert front_hit[1] and front_hit[1].z>.5 and rear_hit[1] and rear_hit[1].z>.5
    assert all(hit['outward_normal'] for hit in side_hits)
report['normal_and_closed_side_checks'] = normals
report['route_checks'] = after_routes
report['route_reports_identical_to_source'] = before_routes==after_routes
report['replacement_roof_transforms_preserved'] = all(source_roof_transforms[name]==tuple(tuple(row) for row in bpy.data.objects[name].matrix_world) for name in TARGETS)
report['replacement_roof_material_slots_preserved'] = all(source_roof_materials[name]==tuple(m.name for m in bpy.data.objects[name].data.materials) for name in TARGETS)
report['source_disk_sha256_before'] = before_hash
report['source_disk_sha256_after'] = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
output = PROJECT/'artifacts/scene-space-03/roof-build-audit.json'
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
assert report['route_reports_identical_to_source']
assert report['replacement_roof_transforms_preserved'] and report['replacement_roof_material_slots_preserved']
assert report['source_disk_sha256_before']==report['source_disk_sha256_after']
assert all(result['sampled_checks_passed'] for result in after_routes['routes'].values())
print(json.dumps({'result':'PASS','new_objects':len(report['added_objects']),
                  'roof_triangles':report['new_roof_triangles_including_replacements'],
                  'triangle_delta':report['triangle_delta'],
                  'max_xy_extension':max(h['maximum_xy_overhang_increase'] for h in report['houses']),
                  'max_ridge_rise':max(h['maximum_ridge_height_increase'] for h in report['houses']),
                  'route_samples':sum(r['sample_count'] for r in after_routes['routes'].values()),
                  'report':str(output)},ensure_ascii=False))
