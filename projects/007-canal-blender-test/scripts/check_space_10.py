"""Independent SPACE10 read-only physical/preservation audit; never save/render.

Uses prior audited measuring helpers, but targets new courts and changed-house
perimeters rather than repeating the full old district body-ray sweep.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time
import math

sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree
from audit_boundary_extension import snapshot
from audit_v5 import file_hash
from check_space_02 import connection_probes, file_changes, load_json
from check_space_05 import bounds
from check_space_06 import physical_checks
from check_space_08 import layout_geometry_checks, door_physical_checks
from build_roam_scene import verify_background_water
from extend_scene import check_routes
from export_viewer import read_glb

ROOT=HERE.parent
SOURCE=ROOT/'artifacts/rainy-canal-space-08.blend'
CANDIDATE=ROOT/'artifacts/rainy-canal-space-10.blend'
GLB=ROOT/'web/models/space-10.glb'
MANIFEST=ROOT/'web/models/space-10-manifest.json'
BASELINE=ROOT/'artifacts/scene-space-10/preserved-files.json'
GROUND_NAMES={'SPACE08_'+s for s in ('ContinuousFrontageSupport','ContinuousFrontagePaving','SoftFrontageShoulders','CourtyardEdgesAndGateReturns')}

def shoulders(ground):
    obj=bpy.data.objects['SPACE10_SoftFrontageShoulders']
    points=[obj.matrix_world@v.co for v in obj.data.vertices]
    tree=KDTree(len(points))
    for i,p in enumerate(points):tree.insert(p,i)
    tree.balance()
    terrains=[bpy.data.objects[n] for n in ('ROAM01_North continuous terrain','ROAM01_South continuous terrain')]
    rows=[]
    for i,row in enumerate(ground['shoulders']):
        errors=[]
        for xy,z in zip(row['outer'],row['outer_heights']):
            heights=[]
            for t in terrains:
                hit,pos,normal,face=t.ray_cast(t.matrix_world.inverted()@Vector((*xy,10)),Vector((0,0,-1)),distance=20)
                if hit:heights.append((t.matrix_world@pos).z)
            errors.append(abs(z-max(heights)-.004) if heights else 999)
        declared=[(*xy,z) for xy,z in zip(row['outer'],row['outer_heights'])]+[(*xy,z) for xy,z in zip(row['inner'],row.get('inner_heights',[.851,.851]))]
        vertex_error=max(tree.find(Vector(p))[2] for p in declared)
        rows.append({'index':i,'terrain_error':max(errors),'vertex_error':vertex_error,'passed':max(errors)<1e-4 and vertex_error<1e-5})
    return {'passed':bool(rows) and all(r['passed'] for r in rows),'count':len(rows),'max_terrain_error':max((r['terrain_error'] for r in rows),default=0),'failures':[r for r in rows if not r['passed']]}

def hips(houses):
    rows=[]
    for h in houses:
        if h.get('roof_style') not in ('hip','end_hip'):continue
        roof=h['roof'];obj=bpy.data.objects[next(n for n in h['objects'] if n.endswith('_RoofAndEaves'))]
        axis=roof['ridge_axis_xy'];run=roof['hipRun']
        for side in roof['hip_ends']:
            anchor=roof['ridge_start_xyz'] if side=='left' else roof['ridge_end_xyz']
            direction=-1 if side=='left' else 1
            x=anchor[0]+axis[0]*direction*run*.5;y=anchor[1]+axis[1]*direction*run*.5
            hit,pos,normal,face=obj.ray_cast(obj.matrix_world.inverted()@Vector((x,y,h['ridge_z']+1)),Vector((0,0,-1)),distance=5)
            z=(obj.matrix_world@pos).z if hit else None
            rows.append({'house':h['id'],'end':side,'xy':[x,y],'height':z,'ridge_z':h['ridge_z'],'passed':z is not None and h['eaves_z']<z<h['ridge_z']-.1})
    return {'passed':len(rows)==3 and all(r['passed'] for r in rows),'rows':rows}

def main(output):
    if output.exists():raise RuntimeError('Refusing to overwrite '+str(output))
    started=time.perf_counter()
    manifest=load_json(MANIFEST);source_manifest=load_json(ROOT/'web/models/space-08-manifest.json')
    plan=manifest['neighbourhood']['layout'];building=manifest['neighbourhood']['buildings'];ground=manifest['neighbourhood']['ground']
    result=subprocess.run([shutil.which('node') or 'node',str(HERE/'check_space_10_navigation.mjs'),'--data'],capture_output=True,text=True,check=True,cwd=str(ROOT))
    nav_report=json.loads(result.stdout);nav=nav_report['data']
    before=snapshot(SOURCE);old_routes=check_routes();old_support=connection_probes()
    after=snapshot(CANDIDATE);routes=check_routes();support=connection_probes()
    allowed=set(source_manifest['neighbourhood']['buildings']['objects'])|GROUND_NAMES
    checks={};changes={};unexpected={};cache_cases=[]
    for name,a0 in before['objects'].items():
        b0=after['objects'].get(name)
        if b0 is None:unexpected[name]=['missing'];continue
        if a0==b0:continue
        changes[name]=[k for k in a0 if a0[k]!=b0.get(k)];a,b=dict(a0),dict(b0)
        if name in allowed:
            a['visibility']={k:v for k,v in a['visibility'].items() if k not in ('hide_render','hide_viewport')}
            b['visibility']={k:v for k,v in b['visibility'].items() if k not in ('hide_render','hide_viewport')}
            diff=[k for k in a['transform'] if a['transform'][k]!=b['transform'][k]]
            identity=[[float(i==j) for j in range(4)] for i in range(4)]
            if diff and set(diff).issubset({'matrix_world','matrix_local'}) and a['parent'] is None and b['parent'] is None and all(b['transform'][k]==identity for k in diff):
                cache_cases.append({'name':name,'derived_matrix_cache_fields':diff,'persistent_transform_and_basis_unchanged':True})
                a['transform']={k:v for k,v in a['transform'].items() if k not in diff};b['transform']={k:v for k,v in b['transform'].items() if k not in diff}
        if a!=b:unexpected[name]=[k for k in a if a[k]!=b.get(k)]
    checks['exactly_67_old_objects_only_hidden']=len(allowed)==67 and set(changes)==allowed and not unexpected and all(after['objects'][n]['visibility']['hide_render'] and after['objects'][n]['visibility']['hide_viewport'] for n in allowed)
    checks['every_old_mesh_material_uv_transform_and_core_object_preserved']=not unexpected
    added=sorted(after['objects'].keys()-before['objects'].keys())
    checks['only_new_SPACE10_mesh_objects']=bool(added) and all(n.startswith('SPACE10_') and after['objects'][n]['type']=='MESH' for n in added)
    material_changes={}
    for category in ('materials','node_groups'):
        a,b=before[category],after[category]
        material_changes[category]={'missing':sorted(a.keys()-b.keys()),'changed':sorted(n for n in a.keys()&b.keys() if a[n]!=b[n]),'added':sorted(b.keys()-a.keys())}
        r=material_changes[category];checks['old_'+category+'_preserved_new_namespaced']=not r['missing'] and not r['changed'] and all(n.startswith('SPACE10_') for n in r['added'])
    for category in ('worlds','view_layers'):checks[category+'_preserved']=before[category]==after[category]
    oldgroups,newgroups=before['locked_scene']['collections'],after['locked_scene']['collections'];extras=set(newgroups)-set(oldgroups)
    checks['old_collections_and_flags_preserved']=all(newgroups.get(k)==v for k,v in oldgroups.items()) and all(after['layer_collection_flags'].get(k)==v for k,v in before['layer_collection_flags'].items())
    checks['new_collections_separate']=bool(extras) and all(n.startswith('SPACE10_') for n in extras) and all(set(after['objects'][n]['collections']).issubset(extras) for n in added)
    checks['camera_lights_world_settings_preserved']=all(after['locked_scene'].get(k)==v for k,v in before['locked_scene'].items() if k!='collections') and before['counts']['lights']==after['counts']['lights'] and before['counts']['cameras']==after['counts']['cameras']
    checks['original_522_route_checks_identical']=old_routes==routes and sum(r['sample_count'] for r in routes['routes'].values())==522 and all(r['sampled_checks_passed'] for r in routes['routes'].values())
    checks['original_33_bridge_and_ground_support_probes_identical']=old_support==support
    water=verify_background_water();checks['original_water_support_passed']=water['passed']
    geometry_checks,geometry=layout_geometry_checks(building)
    parties=geometry['party_walls'];expected_parties=sum(len(h.get('party_walls',[])) for h in plan['buildings'])
    geometry_checks['all_party_walls_have_zero_roof_overhang_and_no_openings']=len(parties)==expected_parties and all(r['maximum_real_roof_projection']<=1e-5 and not r['openings'] for r in parties)
    checks.update(geometry_checks)
    previous_houses={h['id']:h for h in source_manifest['neighbourhood']['buildings']['houses']};current_houses={h['id']:h for h in building['houses']}
    checks['same_21_houses_13_varied_8_frozen']=len(current_houses)==21 and current_houses.keys()==previous_houses.keys() and len(plan['building_changes'])==13 and len(plan['frozen_house_ids'])==8
    legacy=[]
    for house_id in plan['frozen_house_ids']:
        a,b=previous_houses[house_id],current_houses[house_id]
        for old_name,new_name in zip(a['objects'],b['objects']):
            ad,bd=before['objects'][old_name]['data'],after['objects'][new_name]['data']
            fields=['vertices','edges','faces','loops','coordinate_sha256','topology_sha256','material_indices_sha256','smooth_faces_sha256','attributes']
            differences=[k for k in fields if ad.get(k)!=bd.get(k)]
            legacy.append({'house':house_id,'source':old_name,'replacement':new_name,'differences':differences})
    checks['eight_frozen_houses_actual_mesh_coordinates_topology_material_indices_identical']=len(legacy)==24 and all(not r['differences'] for r in legacy)
    checks['eight_single_storey_houses_actual_metadata']=sum(h['floors']==1 for h in building['houses'])==8
    hip=hips(building['houses']);checks['three_real_hip_slopes_below_ridge']=hip['passed']
    doors=door_physical_checks(nav,building);checks['all_public_door_approaches_real_ground_headroom_and_closed_door']=doors['passed']
    shoulder=shoulders(ground);checks['all_new_shoulder_edges_meet_real_unchanged_terrain']=shoulder['passed']
    physical=physical_checks(nav);checks['new_courts_and_changed_house_perimeters_clear_supported']=physical['passed']
    checks['production_navigation_connected_and_all_routes_drive_both_directions']=nav_report['passed']
    new_bounds=[{'name':n,'bounds':bounds([bpy.data.objects[n].matrix_world@Vector(p) for p in bpy.data.objects[n].bound_box])} for n in added]
    checks['all_new_geometry_inside_previous_developed_envelope']=all(-36.01<=r['bounds']['min'][0] and r['bounds']['max'][0]<=36.01 and -44.51<=r['bounds']['min'][1] and r['bounds']['max'][1]<=27.01 and r['bounds']['min'][2]>=-.5 and r['bounds']['max'][2]<=12 for r in new_bounds)
    doc,glb=read_glb(GLB)
    checks['visible_glb_under_310000_triangles']=glb['triangles']<=310000
    checks['glb_has_no_camera_or_light']=not doc.get('cameras') and not doc.get('extensions',{}).get('KHR_lights_punctual')
    checks['source_and_candidate_match_manifest_hashes']=before['sha256']==source_manifest['integrated_blend']['sha256'] and after['sha256']==manifest['integrated_blend']['sha256'] and file_hash(GLB)==manifest['sha256']
    preserved=load_json(BASELINE);file_differences=file_changes(preserved)
    checks['all_1344_previous_version_files_preserved']=len(preserved)==1344 and not file_differences
    checks['read_only_blend_files_unchanged']=file_hash(SOURCE)==before['sha256'] and file_hash(CANDIDATE)==after['sha256']
    report={'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'source':{'file':SOURCE.name,'sha256':before['sha256']},'candidate':{'file':CANDIDATE.name,'sha256':after['sha256']},'changes':changes,'unexpected_changes':unexpected,'hidden_matrix_cache_cases':cache_cases,'new_objects':added,'new_bounds':new_bounds,'material_changes':material_changes,'frozen_houses':legacy,'layout':geometry,'hip_roofs':hip,'door_physical_access':doors,'shoulders':shoulder,'physical_navigation':physical,'runtime_navigation':{k:v for k,v in nav_report.items() if k!='data'},'old_522_routes':routes,'old_33_supports':support,'water':water,'preservation':{'count':len(preserved),'differences':file_differences},'glb':glb,'seconds':round(time.perf_counter()-started,3),'limitations':['Read-only scene audit; sampled physical paths are not a proof of every continuous trajectory.','Runtime tree/plot/shader ownership and actual multi-view visual quality are checked separately.','All old source data is preserved behind explicitly hidden replacements; no source blend is saved.']}
    with output.open('x',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2);f.write('\n')
    print('SPACE10_AUDIT',json.dumps({'passed':report['passed'],'failed':[k for k,v in checks.items() if not v],'unexpected':unexpected,'physical_failures':{k:len(v) for k,v in physical['failures'].items()},'counts':physical['counts'],'file_changes':file_differences,'report':str(output),'seconds':report['seconds']},ensure_ascii=False),flush=True)
    if not report['passed']:raise RuntimeError('SPACE10 independent audit failed; inspect append-only report.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'artifacts/scene-space-10/scene-validation.json')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);main(args.output)
