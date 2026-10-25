"""Read-only SPACE02 audit: permit two background terrain meshes' Z/normal edits."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from audit_boundary_extension import snapshot
from audit_v5 import file_hash
from build_roam_scene import river_section, verify_background_water
from export_viewer import read_glb
from extend_boundary import probe_local_connections
from extend_scene import check_routes, route_height

ROOT = SCRIPT_DIR.parent
SOURCE = ROOT / 'artifacts/rainy-canal-space-01.blend'
CANDIDATE = ROOT / 'artifacts/rainy-canal-space-02.blend'
GLB = ROOT / 'web/models/space-02.glb'
MANIFEST = ROOT / 'web/models/space-02-manifest.json'
BASELINE = ROOT / 'artifacts/scene-space-02/preserved-files.json'
OLD_BASELINE = ROOT / 'artifacts/scene-space-01/preserved-files.json'
OUTPUT = ROOT / 'assets/space-02-postcheck.json'
TARGETS = {'ROAM01_North continuous terrain':1, 'ROAM01_South continuous terrain':-1}
CORE = (-40, 40, -38, 28)


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def file_changes(record):
    changes = []
    for relative, expected in record.items():
        path = ROOT / relative
        if not path.is_file():
            changes.append({'file':relative, 'reason':'missing'})
        elif file_hash(path).lower() != expected.lower():
            changes.append({'file':relative, 'reason':'hash changed'})
    return changes


def terrain_state():
    result = {}
    for name, side in TARGETS.items():
        obj = bpy.data.objects[name]
        local = [list(vertex.co) for vertex in obj.data.vertices]
        world = [list(obj.matrix_world @ vertex.co) for vertex in obj.data.vertices]
        protected_cells = set()
        for face in obj.data.polygons:
            points = [world[index] for index in face.vertices]
            if max(p[0] for p in points) >= CORE[0] and min(p[0] for p in points) <= CORE[1] and max(p[1] for p in points) >= CORE[2] and min(p[1] for p in points) <= CORE[3]:
                protected_cells.update(face.vertices)
        distances = []
        for x,y,z in world:
            center, width = river_section(min(120.0,max(-125.0,x)))
            distances.append(side*(y-center)-width/2)
        slopes = {}
        for edge in obj.data.edges:
            ai, bi = edge.vertices
            a,b = world[ai],world[bi]
            if abs(a[0]-b[0]) > 1e-5:
                continue
            low, high = sorted((distances[ai],distances[bi]))
            key = f'{low:.1f}..{high:.1f}'
            slope = abs(a[2]-b[2])/max(1e-9,math.dist(a[:2],b[:2]))
            slopes.setdefault(key,[]).append(slope)
        result[name] = {
            'local':local, 'world':world, 'distance_from_riverbank':distances,
            'protected_cell_vertices':protected_cells,
            'face_normals':[list(face.normal) for face in obj.data.polygons],
            'world_xy_bounds':{'min':[min(v[a] for v in world) for a in (0,1)],'max':[max(v[a] for v in world) for a in (0,1)]},
            'cross_bank_edge_slopes':{key:{'count':len(values),'max':max(values),'mean':sum(values)/len(values)} for key,values in slopes.items()},
        }
    return result


def connection_probes():
    result = probe_local_connections()
    scene, deps = bpy.context.scene, bpy.context.evaluated_depsgraph_get()
    for cx in (-18,9.4):
        for xoff in (-.55,0,.55):
            for y in (-1.6,-1.95,-10.4,-10.7):
                expected = route_height('both_banks_loop',(cx,y))
                hit,pos,normal,face,obj,matrix = scene.ray_cast(deps,Vector((cx+xoff,y,expected+.25)),Vector((0,0,-1)),distance=.7)
                result[f'bridge_{cx}_{xoff}_{y}'] = {'hit':hit,'height':pos.z if hit else None,'object':obj.name if hit else None}
    return result


def audit_terrain(before, after):
    reports = {}
    checks = {}
    for name in TARGETS:
        old,new = before[name],after[name]
        changed = [i for i,(a,b) in enumerate(zip(old['local'],new['local'])) if a != b]
        xy_changed = [i for i,(a,b) in enumerate(zip(old['local'],new['local'])) if a[:2] != b[:2]]
        frozen_changed = []
        shoreline_changed = []
        distant_changed = []
        raised = []
        for index in changed:
            x,y,z = old['world'][index]
            distance = old['distance_from_riverbank'][index]
            if CORE[0] <= x <= CORE[1] and CORE[2] <= y <= CORE[3]:
                frozen_changed.append(index)
            if distance <= .6001:
                shoreline_changed.append(index)
            if distance >= 50-1e-4:
                distant_changed.append(index)
            if new['world'][index][2] > z + 1e-6:
                raised.append(index)
        label = name.split()[0]+'_'+str(TARGETS[name])
        checks[label+'_vertex_count_unchanged'] = len(old['local']) == len(new['local'])
        checks[label+'_xy_coordinates_and_bounds_frozen'] = not xy_changed and old['world_xy_bounds']==new['world_xy_bounds'] and all(a[:2]==b[:2] for a,b in zip(old['world'],new['world']))
        checks[label+'_core_rectangle_frozen'] = not frozen_changed
        checks[label+'_all_vertices_of_core_intersecting_faces_frozen'] = not (set(changed) & old['protected_cell_vertices'])
        checks[label+'_zero_and_point6_bank_rows_frozen'] = not shoreline_changed
        checks[label+'_beyond50m_from_water_frozen'] = not distant_changed
        checks[label+'_only_lowered_background_relief'] = not raised
        checks[label+'_has_actual_height_changes'] = bool(changed)
        checks[label+'_finite_coordinates_and_upward_normals'] = all(math.isfinite(v) for point in new['local'] for v in point) and all(math.isfinite(v) for normal in new['face_normals'] for v in normal) and all(normal[2] > 0 for normal in new['face_normals'])
        near_key='0.6..2.0'
        checks[label+'_nearbank_max_slope_not_worse'] = new['cross_bank_edge_slopes'][near_key]['max'] <= old['cross_bank_edge_slopes'][near_key]['max']+1e-6
        reports[name] = {
            'vertices':len(new['local']),'changed_vertices':len(changed),
            'protected_core_and_neighbor_cell_vertices':len(old['protected_cell_vertices']),
            'max_vertical_displacement_m':max((abs(new['local'][i][2]-old['local'][i][2]) for i in changed),default=0),
            'changed_z_range_before':[min((old['local'][i][2] for i in changed),default=0),max((old['local'][i][2] for i in changed),default=0)],
            'changed_z_range_after':[min((new['local'][i][2] for i in changed),default=0),max((new['local'][i][2] for i in changed),default=0)],
            'changed_face_normals':sum(a!=b for a,b in zip(old['face_normals'],new['face_normals'])),
            'xy_changed_indices':xy_changed,'frozen_core_changed_indices':frozen_changed,'shoreline_changed_indices':shoreline_changed,'beyond50m_changed_indices':distant_changed,'raised_indices':raised,
            'cross_bank_edge_slopes_before':old['cross_bank_edge_slopes'],'cross_bank_edge_slopes_after':new['cross_bank_edge_slopes'],
        }
    return checks,reports


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=OUTPUT)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.output.exists():
        raise RuntimeError('Refusing to overwrite prior report: '+str(args.output))
    started = time.perf_counter()
    for path in (SOURCE,CANDIDATE,GLB,MANIFEST,BASELINE,OLD_BASELINE):
        if not path.is_file():
            raise RuntimeError('Required artifact missing: '+str(path))
    preserved,old_preserved = load_json(BASELINE),load_json(OLD_BASELINE)
    pre_file_changes = file_changes(preserved)
    before = snapshot(SOURCE)
    terrain_before = terrain_state()
    support_before = connection_probes()
    after = snapshot(CANDIDATE)
    terrain_after = terrain_state()
    supports = connection_probes()
    routes = check_routes()
    water = verify_background_water()
    checks,terrain_report = audit_terrain(terrain_before,terrain_after)
    checks['same_object_names_and_counts'] = before['objects'].keys()==after['objects'].keys() and before['counts']==after['counts']
    changes = {}
    for name,previous in before['objects'].items():
        current = after['objects'].get(name)
        if current is None:
            changes[name] = ['missing']
            continue
        old,new = dict(previous),dict(current)
        if name in TARGETS:
            old['data'] = {key:value for key,value in old['data'].items() if key != 'coordinate_sha256'}
            new['data'] = {key:value for key,value in new['data'].items() if key != 'coordinate_sha256'}
        if old != new:
            changes[name] = [key for key in old if old[key] != new.get(key)]
    checks['objects_frozen_except_allowed_terrain_coordinates'] = not changes
    for category in ('materials','node_groups','worlds','view_layers','layer_collection_flags','locked_scene'):
        checks[category+'_fully_frozen'] = before[category]==after[category]
    water_names = [name for name,obj in before['objects'].items() if name=='ROAM01_Curving canal water' or any(slot['material']=='Canal water' for slot in obj['material_slots'])]
    checks['water_objects_present_and_fully_frozen'] = bool(water_names) and all(before['objects'][name]==after['objects'].get(name) for name in water_names)
    checks['background_water_rays_pass'] = water['passed']
    checks['route_samples_exactly522_and_pass'] = sum(row['sample_count'] for row in routes['routes'].values())==522 and all(row['sampled_checks_passed'] for row in routes['routes'].values())
    checks['bridgehead_rear_alley_support_all_hit'] = all(row['hit'] for row in supports.values())
    checks['bridgehead_rear_alley_support_identical_to_space01'] = support_before==supports
    checks['all118_old_hashes_included_and_identical'] = len(old_preserved)==118 and all(key in preserved and preserved[key].lower()==value.lower() for key,value in old_preserved.items())
    checks['124_preserved_files_unchanged_before_and_after'] = len(preserved)==124 and not pre_file_changes and not file_changes(preserved)
    old_manifest = load_json(ROOT/'web/models/space-01-manifest.json')
    manifest = load_json(MANIFEST)
    checks['space01_blend_hash_matches_previous_manifest'] = before['sha256']==old_manifest['integrated_blend']['sha256']
    checks['new_manifest_matches_blend_and_glb'] = after['sha256']==manifest['integrated_blend']['sha256'] and file_hash(GLB)==manifest['sha256']
    checks['read_only_blend_hashes_unchanged_during_audit'] = before['sha256']==file_hash(SOURCE) and after['sha256']==file_hash(CANDIDATE)
    document,glb_counts=read_glb(GLB)
    checks['glb_triangles_unchanged'] = glb_counts['triangles']==old_manifest['geometry']['triangles']
    checks['glb_has_no_new_cameras_lights'] = not document.get('cameras') and not document.get('extensions',{}).get('KHR_lights_punctual')
    report = {'schema_version':1,'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,
        'source':{'file':SOURCE.name,'sha256':before['sha256'],'counts':before['counts']},'candidate':{'file':CANDIDATE.name,'sha256':after['sha256'],'counts':after['counts']},
        'allowed_changes':{'objects':list(TARGETS),'fields':['mesh vertex Z','derived normals'],'frozen_core_xy':CORE,'frozen_river_edge_distances_m':[0,.6],'frozen_beyond_bank_distance_m':50},
        'unexpected_object_changes':changes,'terrain':terrain_report,'water_objects':water_names,'background_water_checks':water,'route_checks':routes,'support_sample_count':len(supports),'support_samples':supports,
        'preservation':{'baseline':BASELINE.relative_to(ROOT).as_posix(),'baseline_sha256':file_hash(BASELINE),'old_file_count':len(old_preserved),'checked_file_count':len(preserved),'file_changes_before':pre_file_changes,'file_changes_after':file_changes(preserved)},
        'glb':{'file':GLB.name,'sha256':file_hash(GLB),'bytes':GLB.stat().st_size,**glb_counts},'seconds':round(time.perf_counter()-started,3),
        'limitations':['No save, render or browser action. Terrain normals are derived from the permitted vertical changes.','The preserved core rectangle and unchanged water rows protect the current exterior layout, not unmodeled interiors or full terrain walkability.','522 route checks and 33 local support rays are sampled geometry regressions, not exhaustive physics certification.','Edge-slope measurements describe the terrain mesh; they do not certify visual naturalness from every viewpoint.']}
    with args.output.open('x',encoding='utf-8') as stream:
        json.dump(report,stream,ensure_ascii=False,indent=2,allow_nan=False)
        stream.write('\n')
    print('SPACE02_POSTCHECK',json.dumps({'passed':report['passed'],'failed':[name for name,ok in checks.items() if not ok],'report':str(args.output),'changed_terrain_vertices':{name:row['changed_vertices'] for name,row in terrain_report.items()},'route_samples':522,'support_samples':len(supports),'preserved_files':len(preserved),'seconds':report['seconds']},ensure_ascii=False),flush=True)
    if not report['passed']:
        raise RuntimeError('SPACE02 independent audit failed; inspect report.')


if __name__=='__main__':
    run()
