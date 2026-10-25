"""Independent read-only SPACE05 geometry, preservation and navigation audit."""
import argparse
from collections import Counter,defaultdict
from datetime import datetime,timezone
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import time

import bpy
from mathutils import Vector

sys.dont_write_bytecode=True
SCRIPT_DIR=Path(__file__).resolve().parent
sys.path.insert(0,str(SCRIPT_DIR))
from audit_boundary_extension import snapshot
from audit_v5 import file_hash,json_hash
from check_space_02 import connection_probes,file_changes,load_json
from build_roam_scene import verify_background_water
from export_viewer import read_glb
from extend_scene import check_routes

ROOT=SCRIPT_DIR.parent
SOURCE=ROOT/'artifacts/rainy-canal-space-03.blend'
CANDIDATE=ROOT/'artifacts/rainy-canal-space-05.blend'
GLB=ROOT/'web/models/space-05.glb'
MANIFEST=ROOT/'web/models/space-05-manifest.json'
BASELINE=ROOT/'artifacts/scene-space-05/preserved-files.json'
OLD_BASELINE=ROOT/'artifacts/scene-space-04/preserved-files.json'
OUTPUT=ROOT/'assets/space-05-postcheck.json'
BATCH='SPACE01_Opposite row courtyard boundaries'
WALL='EXT_Opposite rear boundary'
ALLOWED={BATCH,WALL}
CUT=(-7.97,-6.13)
ENVELOPES=[(-8.35,-22.75,.65,-5.75,-15.47,3.5),(-12.35,-26.05,.65,-5.95,-22.20,2.25)]


def bounds(points):
    return {'min':[min(p[a] for p in points) for a in range(3)],'max':[max(p[a] for p in points) for a in range(3)]}


def components(obj):
    mesh=obj.data
    neighbours=defaultdict(set)
    for edge in mesh.edges:
        a,b=edge.vertices
        neighbours[a].add(b);neighbours[b].add(a)
    pending=set(range(len(mesh.vertices)))
    records=[]
    while pending:
        seed=min(pending);connected={seed};todo=[seed];pending.remove(seed)
        while todo:
            current=todo.pop()
            for neighbour in neighbours[current]:
                if neighbour in pending:
                    pending.remove(neighbour);connected.add(neighbour);todo.append(neighbour)
        points={i:tuple(mesh.vertices[i].co) for i in connected}
        ordered=sorted(points,key=lambda i:(points[i],i))
        lookup={old:new for new,old in enumerate(ordered)}
        faces=[];edge_use=Counter();volume=0.0
        origin=Vector(points[ordered[0]])
        for polygon in mesh.polygons:
            if polygon.vertices[0] not in connected:
                continue
            indices=[lookup[i] for i in polygon.vertices]
            rotations=[indices[i:]+indices[:i] for i in range(len(indices))]
            faces.append({'v':min(rotations),'material':polygon.material_index,'smooth':polygon.use_smooth})
            world=[mesh.vertices[i].co for i in polygon.vertices]
            for i in range(1,len(world)-1):
                volume+=(world[0]-origin).dot((world[i]-origin).cross(world[i+1]-origin))/6
            for a,b in zip(indices,indices[1:]+indices[:1]):edge_use[tuple(sorted((a,b)))]+=1
        payload={'vertices':[points[i] for i in ordered],'faces':sorted(faces,key=lambda f:json.dumps(f,sort_keys=True))}
        world=[tuple(obj.matrix_world@Vector(points[i])) for i in ordered]
        records.append({'first_vertex':seed,'vertex_count':len(ordered),'face_count':len(faces),'bounds':bounds(world),'volume':abs(volume),'closed':bool(edge_use) and all(v==2 for v in edge_use.values()),'sha256':json_hash(payload)})
    return records


def source_geometry():
    return {name:{'components':components(bpy.data.objects[name]),'bounds':bounds([bpy.data.objects[name].matrix_world@v.co for v in bpy.data.objects[name].data.vertices])} for name in ALLOWED}


def allowed_removed_component(row):
    low,high=row['bounds']['min'],row['bounds']['max']
    boxes=[(-8.25,-16.65,.84,-5.85,-16.30,2.31),(-7.20,-22.40,.84,-6.90,-21.30,2.10)]
    return any(all(low[a]>=box[a]-1e-5 and high[a]<=box[a+3]+1e-5 for a in range(3)) for box in boxes)


def wall_remainder_checks(original,current):
    before=original['bounds'];rows=sorted(current['components'],key=lambda r:r['bounds']['min'][0])
    expected=[{'min':before['min'][:],'max':[CUT[0],*before['max'][1:]]},{'min':[CUT[1],*before['min'][1:]],'max':before['max'][:]}]
    exact=len(rows)==2 and all(all(abs(row['bounds'][key][a]-box[key][a])<1e-5 for key in ('min','max') for a in range(3)) for row,box in zip(rows,expected))
    volume_before=sum(row['volume'] for row in original['components'])
    volume_after=sum(row['volume'] for row in rows)
    expected_removed=(CUT[1]-CUT[0])*(before['max'][1]-before['min'][1])*(before['max'][2]-before['min'][2])
    return {'left_and_right_slab_bounds_exact':exact,'two_closed_eight_vertex_six_face_slabs':len(rows)==2 and all(row['closed'] and row['vertex_count']==8 and row['face_count']==6 for row in rows),'only_opening_volume_removed':abs(volume_before-volume_after-expected_removed)<1e-4}, {'before':original,'after':current,'expected_removed_volume':expected_removed,'removed_volume':volume_before-volume_after}


def runtime_navigation():
    current=(ROOT/'web/scene-space-05-navigation.js').as_uri()
    previous=(ROOT/'web/roam-navigation.js').as_uri()
    code=f"import {{createNavigation}} from {json.dumps(current)};import {{createNavigation as oldNavigation}} from {json.dumps(previous)};"+"""
const n=createNavigation(),old=oldNavigation(),grid=[];
for(let x=-12.0;x<=-6.14;x+=.24)for(let z=15.15;z<=25.61;z+=.24){if(n.isWalkable(x,z)&&!old.isWalkable(x,z))grid.push([x,-z]);}
console.log(JSON.stringify({route:n.routes.courtyard_return.map(p=>[p.x,-p.z]),zones:n.zones.filter(z=>z.id.startsWith('courtyard')),spawns:n.spawns,grid,metadata:n.metadata}));
"""
    result=subprocess.run([shutil.which('node') or 'node','--input-type=module','-e',code],capture_output=True,text=True,check=True,cwd=str(ROOT))
    return json.loads(result.stdout)


def runtime_floor_heights(points):
    module=(ROOT/'web/scene-space-05-navigation.js').as_uri()
    code=f"import {{createNavigation}} from {json.dumps(module)};"+"import {readFileSync} from 'node:fs';const n=createNavigation(),p=JSON.parse(readFileSync(0,'utf8'));console.log(JSON.stringify(p.map(([x,y])=>n.sampleHeight(x,-y))));"
    result=subprocess.run([shutil.which('node') or 'node','--input-type=module','-e',code],input=json.dumps(points),capture_output=True,text=True,check=True,cwd=str(ROOT))
    heights=json.loads(result.stdout)
    if len(heights)!=len(points) or any(height is None or not math.isfinite(height) for height in heights):
        raise RuntimeError('An audited route/grid point is not allowed by the actual runtime navigation.')
    return heights


def navigation_geometry_checks(nav):
    scene,deps=bpy.context.scene,bpy.context.evaluated_depsgraph_get()
    failures={'floor':[],'body':[],'headroom':[],'new_zone_grid':[],'portal':[],'house_footprint':[]}
    floor_heights=[];legacy_joint_samples=[];counts=Counter()
    def cast(origin,direction,distance):
        hit,pos,normal,face,obj,matrix=scene.ray_cast(deps,Vector(origin),Vector(direction),distance=distance)
        return {'object':obj.name,'position':list(pos)} if hit else None
    def floor(point,new_only=False):
        hit=cast((*point,1.10),(0,0,-1),.65);counts['floor_rays']+=1
        tolerance=.015 if point[1]<-15.6853 else .17
        if not hit or abs(hit['position'][2]-.85)>tolerance:
            return {'point':point,'hit':hit,'height_tolerance':tolerance}
        floor_heights.append(hit['position'][2])
        if point[1]>=-15.6853 and hit['position'][2]<.83:
            legacy_joint_samples.append({'point':point,'height':hit['position'][2],'object':hit['object']})
        return None
    route=nav['route'];samples=[];segments=[]
    for first,last in zip(route[:-1],route[1:]):
        length=math.dist(first,last);steps=max(1,math.ceil(length/.15))
        direction=Vector((last[0]-first[0],last[1]-first[1],0)).normalized()
        lateral=Vector((-direction.y,direction.x,0))
        for index in range(steps):
            point=[first[a]+(last[a]-first[a])*index/steps for a in (0,1)]
            samples.append(point)
            segments.append((point,direction,lateral,length/steps))
    runtime_heights=runtime_floor_heights(samples+nav['grid'])
    for (point,direction,lateral,step_length),ground_z in zip(segments,runtime_heights):
        for offset in (-.24,0,.24):
            shifted=[point[0]+lateral.x*offset,point[1]+lateral.y*offset]
            bad=floor(shifted)
            if bad:failures['floor'].append(bad)
            ceiling=cast((*shifted,ground_z+.02),(0,0,1),1.98);counts['headroom_rays']+=1
            if ceiling:failures['headroom'].append({'point':shifted,'hit':ceiling})
            for height in (.08,.4,1.0,1.65,2.0):
                hit=cast((*shifted,ground_z+height),direction,step_length+.00001);counts['body_rays']+=1
                if hit:failures['body'].append({'point':shifted,'height':height,'offset':offset,'hit':hit})
        for cx,width in ((-11,5.6),(-3,5.8),(4.8,5.6)):
            if cx-width/2-.24 < point[0] < cx+width/2+.24 and -21.35-.24 < point[1] < -16.35+.24:
                failures['house_footprint'].append(point)
    for point,ground_z in zip(nav['grid'],runtime_heights[len(samples):]):
        bad=floor(point)
        ceiling=cast((*point,ground_z+.02),(0,0,1),1.98);counts['grid_headroom_rays']+=1
        if bad or ceiling:failures['new_zone_grid'].append({'point':point,'floor':bad,'ceiling':ceiling})
        for side in ((.24,0),(-.24,0),(0,.24),(0,-.24)):
            for height in (.4,1.65):
                hit=cast((*point,ground_z+height),(side[0]/.24,side[1]/.24,0),.24);counts['grid_body_radius_rays']+=1
                if hit:failures['new_zone_grid'].append({'point':point,'side':side,'height':height,'hit':hit})
    # Independently require at least 1.4m clear width and 2m clear height at both old barriers.
    for label,start,end in (('front_gate',-16.1,-16.9),('rear_boundary',-22.1,-22.7)):
        for offset in [-.7+i*.1 for i in range(15)]:
            for height in (.08,.4,1,1.65,2):
                hit=cast((-7.05+offset,start,.855+height),(0,-1,0),abs(end-start));counts['portal_rays']+=1
                if hit:failures['portal'].append({'portal':label,'offset':offset,'height':height,'hit':hit})
    seams=[]
    for x in (-7.65,-7.05,-6.45):
        for y in (-15.66,-15.70,-15.78,-15.82,-22.40,-22.47,-22.55):
            hit=cast((x,y,1.1),(0,0,-1),.5)
            seams.append({'point':[x,y],'height':hit['position'][2] if hit else None,'object':hit['object'] if hit else None})
    return {'passed':not any(failures.values()),'route_sample_count':len(samples),'new_zone_grid_count':len(nav['grid']),'counts':dict(counts),'floor_min':min(floor_heights),'floor_max':max(floor_heights),'failures':failures,'seam_samples':seams,'legacy_unchanged_quay_joint_samples':legacy_joint_samples,'body_base_height_source':'Actual runtime createNavigation().sampleHeight at each center point; old quay uses its existing .85m collision plane across up to .12m-deep visual joints. Newly added floor and ramp use the runtime profile, verified separately against geometry.','runtime_body_base_min':min(runtime_heights),'runtime_body_base_max':max(runtime_heights),'seams_within_1cm_of_source_floor':all(row['height'] is not None and abs(row['height']-.85)<=.01 for row in seams),'scope':'15cm route samples, 0.48m body width, 2m height; 24cm grid of runtime-authorized new floor plus radius rays. Not a continuous physics proof.'}


def run():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=OUTPUT)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.output.exists():raise RuntimeError('Refusing to overwrite report: '+str(args.output))
    started=time.perf_counter()
    for path in (SOURCE,CANDIDATE,GLB,MANIFEST,BASELINE):
        if not path.is_file():raise RuntimeError('Required artifact missing: '+str(path))
    preserved,old_preserved=load_json(BASELINE),load_json(OLD_BASELINE)
    files_before=file_changes(preserved)
    nav=runtime_navigation();nav_hash=file_hash(ROOT/'web/scene-space-05-navigation.js')
    before=snapshot(SOURCE);source_components=source_geometry();support_before=connection_probes()
    after=snapshot(CANDIDATE);candidate_components=source_geometry();supports=connection_probes()
    checks={};unexpected={};changed={}
    for name,previous in before['objects'].items():
        current=after['objects'].get(name)
        if current is None:unexpected[name]=['missing'];continue
        if previous==current:continue
        changed[name]=[key for key in previous if previous[key]!=current.get(key)]
        old,new=dict(previous),dict(current)
        if name in ALLOWED:old.pop('data');new.pop('data')
        if old!=new:unexpected[name]=[key for key in old if old[key]!=new.get(key)]
    checks['only_two_old_objects_data_changed']=not unexpected and set(changed)==ALLOWED
    checks['replacement_data_is_new_space05_mesh_with_same_slots']=all(after['objects'][name]['data']['name'].startswith('SPACE05_') and after['objects'][name]['data']['materials']==before['objects'][name]['data']['materials'] for name in ALLOWED)
    old_batch=source_components[BATCH]['components'];new_batch=candidate_components[BATCH]['components']
    old_counter=Counter(row['sha256'] for row in old_batch);new_counter=Counter(row['sha256'] for row in new_batch)
    removed_counter=old_counter-new_counter
    removed=[row for row in old_batch if removed_counter[row['sha256']]]
    expected=[row for row in old_batch if allowed_removed_component(row)]
    checks['batch_only_removes_exact13_first_gate_and_rear_stub_components']=len(removed)==len(expected)==13 and Counter(row['sha256'] for row in removed)==Counter(row['sha256'] for row in expected) and not(new_counter-old_counter)
    wall_checks,wall_report=wall_remainder_checks(source_components[WALL],candidate_components[WALL]);checks.update({'rear_wall_'+k:v for k,v in wall_checks.items()})
    added=sorted(after['objects'].keys()-before['objects'].keys())
    checks['new_objects_only_space05_geometry']=bool(added) and all(name.startswith('SPACE05_') and after['objects'][name]['type'] in ('MESH','CURVE') for name in added)
    scope=[]
    for name in added:
        obj=bpy.data.objects[name]
        points=[obj.matrix_world@v.co for v in obj.data.vertices] if obj.type=='MESH' else [obj.matrix_world@Vector(p) for p in obj.bound_box]
        outside=[list(p) for p in points if not any(all(box[a]-1e-5<=p[a]<=box[a+3]+1e-5 for a in range(3)) for box in ENVELOPES)]
        scope.append({'object':name,'bounds':bounds(points),'outside_count':len(outside),'first_outside':outside[:4]})
    checks['new_geometry_within_small_gap_and_courtyard_envelopes']=all(row['outside_count']==0 for row in scope)
    data_changes={}
    for category in ('materials','node_groups'):
        old,new=before[category],after[category]
        missing=sorted(old.keys()-new.keys());altered=sorted(name for name in old.keys()&new.keys() if old[name]!=new[name]);new_names=sorted(new.keys()-old.keys())
        data_changes[category]={'missing':missing,'changed':altered,'new':new_names}
        checks['old_'+category+'_frozen']=not missing and not altered
        checks['new_'+category+'_space05_prefix']=all(name.startswith('SPACE05_') for name in new_names)
    for category in ('worlds','view_layers'):checks[category+'_frozen']=before[category]==after[category]
    old_groups,new_groups=before['locked_scene']['collections'],after['locked_scene']['collections']
    checks['old_collections_frozen']=all(new_groups.get(name)==row for name,row in old_groups.items())
    additions=set(new_groups)-set(old_groups)
    checks['new_collections_independent_space05']=bool(additions) and all(name.startswith('SPACE05_') for name in additions) and all(set(after['objects'][name]['collections']).issubset(additions) for name in added)
    checks['old_layer_visibility_frozen']=all(after['layer_collection_flags'].get(name)==row for name,row in before['layer_collection_flags'].items())
    checks['scene_camera_lights_settings_frozen']=all(after['locked_scene'].get(k)==v for k,v in before['locked_scene'].items() if k!='collections') and before['counts']['cameras']==after['counts']['cameras'] and before['counts']['lights']==after['counts']['lights']
    original_routes=check_routes();water=verify_background_water()
    checks['original522_routes_pass']=sum(row['sample_count'] for row in original_routes['routes'].values())==522 and all(row['sampled_checks_passed'] for row in original_routes['routes'].values())
    checks['original33_support_samples_unchanged']=supports==support_before
    checks['background_water_pass']=water['passed']
    physical=navigation_geometry_checks(nav)
    checks['new_route_and_authorized_floor_have_support_body_clearance']=physical['passed']
    checks['entry_and_courtyard_seams_within1cm']=physical['seams_within_1cm_of_source_floor']
    files_after=file_changes(preserved)
    checks['old136_hashes_included']=len(old_preserved)==136 and all(preserved.get(k,'').lower()==v.lower() for k,v in old_preserved.items())
    checks['all141_old_files_unchanged']=len(preserved)==141 and not files_before and not files_after
    previous_manifest=load_json(ROOT/'web/models/space-03-manifest.json');manifest=load_json(MANIFEST)
    checks['source_hash_matches_space03']=before['sha256']==previous_manifest['integrated_blend']['sha256']
    checks['candidate_and_glb_match_manifest']=after['sha256']==manifest['integrated_blend']['sha256'] and file_hash(GLB)==manifest['sha256']
    document,glb=read_glb(GLB);delta=glb['triangles']-previous_manifest['geometry']['triangles']
    checks['glb_net_triangle_increase_at_most6500']=0<delta<=6500
    checks['glb_no_camera_lights']=not document.get('cameras') and not document.get('extensions',{}).get('KHR_lights_punctual')
    checks['audit_leaves_saved_blends_and_navigation_unchanged']=before['sha256']==file_hash(SOURCE) and after['sha256']==file_hash(CANDIDATE) and nav_hash==file_hash(ROOT/'web/scene-space-05-navigation.js')
    report={'schema_version':1,'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'source':{'file':SOURCE.name,'sha256':before['sha256'],'counts':before['counts']},'candidate':{'file':CANDIDATE.name,'sha256':after['sha256'],'counts':after['counts']},'changed_old_objects':changed,'unexpected_changes':unexpected,'added_objects':added,'material_node_differences':data_changes,'removed_batch_components':removed,'retained_batch_component_count':len(new_batch),'rear_wall_opening':wall_report,'new_object_scope':scope,'original_routes':original_routes,'original_support_samples':supports,'background_water':water,'runtime_navigation':{k:v for k,v in nav.items() if k!='grid'},'runtime_navigation_sha256':nav_hash,'new_mesh_navigation_checks':physical,'preservation':{'baseline':BASELINE.relative_to(ROOT).as_posix(),'count':len(preserved),'changed_before':files_before,'changed_after':files_after},'glb':{'file':GLB.name,'sha256':file_hash(GLB),'bytes':GLB.stat().st_size,**glb,'net_triangle_increase':delta},'seconds':round(time.perf_counter()-started,3),'limitations':['No save, render or browser control. Old source files are preserved; two wall batches intentionally change data only in this new copy.','Read-only Node import supplies the real runtime route and authorized new-zone grid; Blender rays independently check actual geometry rather than reproducing the navigation predicates.','Route/body/grid/portal samples are regressions and do not prove every possible continuous movement, arbitrary camera path or inaccessible room.']}
    with args.output.open('x',encoding='utf-8') as stream:json.dump(report,stream,ensure_ascii=False,indent=2,allow_nan=False);stream.write('\n')
    print('SPACE05_POSTCHECK',json.dumps({'passed':report['passed'],'failed':[k for k,v in checks.items() if not v],'report':str(args.output),'new_objects':len(added),'net_triangles':delta,'new_route_samples':physical['route_sample_count'],'grid':physical['new_zone_grid_count'],'physical_failures':{k:len(v) for k,v in physical['failures'].items()},'seconds':report['seconds']},ensure_ascii=False),flush=True)
    if not report['passed']:raise RuntimeError('SPACE05 independent audit failed; inspect report.')


if __name__=='__main__':run()
