"""SPACE06 read-only source and final geometry audit; never saves or renders."""
import argparse
from datetime import datetime,timezone
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector

sys.dont_write_bytecode=True
SCRIPT_DIR=Path(__file__).resolve().parent
sys.path.insert(0,str(SCRIPT_DIR))
ROOT=SCRIPT_DIR.parent
SOURCE=ROOT/'artifacts/rainy-canal-space-05.blend'


def inspect_source(output):
    if output.exists():raise RuntimeError('Refusing to overwrite '+str(output))
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE),load_ui=False,use_scripts=False)
    scene,deps=bpy.context.scene,bpy.context.evaluated_depsgraph_get()
    paths={
        'near_quay':((-34.25,0),(34.25,0)),
        'far_quay':((-34.25,-12.65),(34.25,-12.65)),
        'north_backstreet':((-33,8),(33,8)),
        'north_west_cross':((-33,0),(-33,25.2)),
        'north_east_cross':((33,0),(33,25.2)),
        'south_west_cross':((-33,-12.65),(-33,-35.5)),
        'south_east_cross':((33,-12.65),(33,-35.5)),
        'north_top':((-33,25.2),(33,25.2)),
        'south_bottom':((-33,-35.5),(33,-35.5)),
    }
    report={}
    for name,(start,end) in paths.items():
        length=math.dist(start,end);count=math.ceil(length/.25)
        direction=Vector((end[0]-start[0],end[1]-start[1],0)).normalized()
        floor=[];obstacles=[]
        for i in range(count+1):
            x,y=[start[a]+(end[a]-start[a])*i/count for a in (0,1)]
            hit,pos,normal,face,obj,matrix=scene.ray_cast(deps,Vector((x,y,1.1)),Vector((0,0,-1)),distance=1.2)
            if not hit or abs(pos.z-.85)>.035:
                floor.append({'xy':[x,y],'height':pos.z if hit else None,'object':obj.name if obj else None})
            if i==count:continue
            for height in (.1,.4,1,1.8):
                hit,pos,normal,face,obj,matrix=scene.ray_cast(deps,Vector((x,y,.85+height)),direction,distance=length/count+.00001)
                if hit:obstacles.append({'xy':[x,y],'height_above_ground':height,'position':list(pos),'object':obj.name})
        report[name]={'points':count+1,'unsupported_or_low':floor,'body_obstacles':obstacles}
    nearby=[]
    for obj in scene.objects:
        if obj.type not in ('MESH','CURVE') or obj.hide_render:continue
        if not any(word in obj.name.lower() for word in ('boundary','gate','fence','railing','wall','quay')):continue
        points=[obj.matrix_world@Vector(p) for p in obj.bound_box]
        box={'min':[min(p[a] for p in points) for a in range(3)],'max':[max(p[a] for p in points) for a in range(3)]}
        if box['min'][0]<=35 and box['max'][0]>=-35 and box['min'][1]<=26 and box['max'][1]>=-37:
            nearby.append({'object':obj.name,'bounds':box})
    result={'checked_utc':datetime.now(timezone.utc).isoformat(),'source':SOURCE.name,'paths':report,'nearby_boundaries':nearby,'scope':'Source-only clearance diagnostics before SPACE06 roads; no new geometry is expected yet.'}
    with output.open('x',encoding='utf-8') as stream:json.dump(result,stream,ensure_ascii=False,indent=2);stream.write('\n')
    print('SPACE06_SOURCE',json.dumps({name:{'low_floor_count':len(row['unsupported_or_low']),'obstacles':row['body_obstacles']} for name,row in report.items()},ensure_ascii=False),flush=True)



# Independent final checks use persisted Blender data and the actual JS runtime.
from collections import Counter
import shutil
import subprocess
from audit_boundary_extension import snapshot
from audit_v5 import file_hash
from check_space_02 import connection_probes,file_changes,load_json
import check_space_02 as terrain_helpers
from check_space_05 import bounds,components
from extend_scene import check_routes
from build_roam_scene import verify_background_water
from export_viewer import read_glb

CANDIDATE=ROOT/'artifacts/rainy-canal-space-06.blend'
GLB=ROOT/'web/models/space-06.glb'
MANIFEST=ROOT/'web/models/space-06-manifest.json'
BASELINE=ROOT/'artifacts/scene-space-06/preserved-files.json'
TERRAINS=set(terrain_helpers.TARGETS)
CURBS={'EXT_Outer alley curb','EXT_Outer alley curb.001'}
GATES={base+('' if i==0 else f'.{i:03d}') for base,count in [('EXT_Access boundary gate rail',8),('EXT_Access boundary gate bar',28)] for i in range(count)}
terrain_helpers.CORE=(-26,24,-38,28)


def run_node(code,input=None):
    result=subprocess.run([shutil.which('node') or 'node','--input-type=module','-e',code],input=json.dumps(input) if input is not None else None,capture_output=True,text=True,check=True,cwd=str(ROOT))
    return json.loads(result.stdout)


def navigation_data():
    module=(ROOT/'web/scene-space-06-navigation.js').as_uri();previous=(ROOT/'web/scene-space-05-navigation.js').as_uri()
    code=f"import {{createNavigation}} from {json.dumps(module)};import {{createNavigation as oldNavigation}} from {json.dumps(previous)};"+"""
const n=createNavigation(),old=oldNavigation(),grid=[],routes={},oldHeightDifferences=[];
for(let x=-34.5;x<=34.5;x+=.60)for(let z=-26;z<=36.8;z+=.60){
 if(n.isWalkable(x,z)&&!old.isWalkable(x,z))grid.push({xy:[x,-z],height:n.sampleHeight(x,z)});
}
for(const [id,route] of Object.entries(n.routes)){
 const points=[];
 for(let i=0;i<route.length-1;i++){
  const a=route[i],b=route[i+1],dist=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(dist/.20);
  for(let j=0;j<steps;j++){
   const x=a.x+(b.x-a.x)*j/steps,z=a.z+(b.z-a.z)*j/steps;
   points.push({xy:[x,-z],height:n.sampleHeight(x,z),direction:[(b.x-a.x)/dist,-(b.z-a.z)/dist],step:dist/steps});
   if(old.routes[id]&&n.sampleHeight(x,z)!==old.sampleHeight(x,z))oldHeightDifferences.push([id,x,z]);
  }
 }
 routes[id]={points,route:route.map(p=>[p.x,-p.z])};
}
console.log(JSON.stringify({routes,grid,zones:n.zones,obstacles:n.obstacles,spawns:n.spawns,oldHeightDifferences}));
"""
    return run_node(code)


def curb_state():
    scene,deps=bpy.context.scene,bpy.context.evaluated_depsgraph_get();records={}
    for name in CURBS:
        obj=bpy.data.objects[name];points=[obj.matrix_world@v.co for v in obj.data.vertices];box=bounds(points);x=sum(p[0] for p in points)/len(points)
        rays=[]
        for y in [1.21,2,4,6.7,6.84,6.86,7,8,8.89]:
            origin=obj.matrix_world.inverted()@Vector((x,y,1.5));direction=(obj.matrix_world.inverted().to_3x3()@Vector((0,0,-1))).normalized()
            hit,pos,normal,face=obj.ray_cast(origin,direction,distance=2)
            rays.append({'y':y,'height':(obj.matrix_world@pos).z if hit else None})
        records[name]={'bounds':box,'probes':rays,'components':components(obj)}
    return records


def physical_checks(nav):
    scene,deps=bpy.context.scene,bpy.context.evaluated_depsgraph_get();failures={k:[] for k in ['floor','body','headroom','grid']};counts=Counter();legacy=[];floors=[]
    def cast(point,direction,distance):
        hit,pos,normal,face,obj,matrix=scene.ray_cast(deps,Vector(point),Vector(direction),distance=distance)
        return {'object':obj.name,'position':list(pos)} if hit else None
    def floor(point,height):
        hit=cast((*point,height+.24),(0,0,-1),.50);counts['floor_rays']+=1
        # The unchanged core contains decorative paving joints up to .12 m deep.
        x,y=point;old_quay=(-25.45751<=x<=24.00001 and (-1.52<=y<=1.1 or -15.6853<=y<=-10.85))
        old_rear=(-13.61<=x<=12.31 and 1<=y<=8.81)
        tolerance=.17 if old_quay or old_rear else .015
        if not hit or abs(hit['position'][2]-height)>tolerance:return {'xy':point,'expected':height,'tolerance':tolerance,'hit':hit}
        floors.append(hit['position'][2])
        if hit['position'][2]<height-.025:legacy.append({'xy':point,'height':hit['position'][2],'object':hit['object']})
    for name,route in nav['routes'].items():
        # Original bridge routes use their established 522-point checker below.
        # Flat ankle rays would intersect the unchanged ascending bridge deck.
        if name in ('both_banks_loop','rear_lane_loop'):continue
        for p in route['points']:
            point,ground,d,step=p['xy'],p['height'],p['direction'],p['step'];counts['route_points']+=1
            if ground is None:failures['floor'].append({'route':name,'point':point,'error':'runtime disallows'});continue
            for offset in (-.24,0,.24):
                shifted=[point[0]-d[1]*offset,point[1]+d[0]*offset];bad=floor(shifted,ground)
                if bad:failures['floor'].append({'route':name,**bad})
                ceiling=cast((*shifted,ground+.025),(0,0,1),1.975);counts['ceiling_rays']+=1
                if ceiling:failures['headroom'].append({'route':name,'xy':shifted,'hit':ceiling})
                for h in (.08,.4,1,1.65,2):
                    hit=cast((*shifted,ground+h),(*d,0),step+.00001);counts['body_rays']+=1
                    if hit:failures['body'].append({'route':name,'xy':shifted,'height':h,'hit':hit})
    for p in nav['grid']:
        point,ground=p['xy'],p['height'];bad=floor(point,ground)
        ceiling=cast((*point,ground+.025),(0,0,1),1.975);counts['grid_points']+=1
        if bad or ceiling:failures['grid'].append({'xy':point,'floor':bad,'ceiling':ceiling})
        for side in ((1,0),(-1,0),(0,1),(0,-1)):
            for h in (.08,.4,1.65,2):
                hit=cast((*point,ground+h),(*side,0),.24);counts['grid_body_rays']+=1
                if hit:failures['grid'].append({'xy':point,'height':h,'side':side,'hit':hit})
    return {'passed':not any(failures.values()),'counts':dict(counts),'failures':failures,'floor_range':[min(floors),max(floors)],'legacy_visual_joint_samples':legacy,'scope':'20cm new-circuit and SPACE05 courtyard sampling with 48cm body width and 2m height; 60cm grid of all newly authorized walkable areas plus four radius rays. Runtime height defines body base. Old decorative paving joints retain existing .17m support tolerance; new road/ramp tolerance .015m.'}


def final_audit(output):
    if output.exists():raise RuntimeError('Refusing to overwrite '+str(output))
    started=time.perf_counter()
    for path in (SOURCE,CANDIDATE,GLB,MANIFEST,BASELINE):
        if not path.is_file():raise RuntimeError('Missing '+str(path))
    preserved=load_json(BASELINE);files_before=file_changes(preserved);nav=navigation_data();nav_hash=file_hash(ROOT/'web/scene-space-06-navigation.js')
    before=snapshot(SOURCE);terrain_before=terrain_helpers.terrain_state();curbs_before=curb_state();support_before=connection_probes();old_routes=check_routes()
    after=snapshot(CANDIDATE);terrain_after=terrain_helpers.terrain_state();curbs_after=curb_state();supports=connection_probes();routes=check_routes()
    checks={};changed={};unexpected={};hidden_transform_cache=[]
    for name,previous in before['objects'].items():
        current=after['objects'].get(name)
        if current is None:unexpected[name]=['missing'];continue
        if previous==current:continue
        changed[name]=[k for k in previous if previous[k]!=current.get(k)];a,b=dict(previous),dict(current)
        if name in TERRAINS:
            a['data']={k:v for k,v in a['data'].items() if k not in ('coordinate_sha256','name')};b['data']={k:v for k,v in b['data'].items() if k not in ('coordinate_sha256','name')}
        elif name in CURBS:a.pop('data');b.pop('data')
        elif name in GATES:
            a['visibility']={k:v for k,v in a['visibility'].items() if k not in ('hide_render','hide_viewport')};b['visibility']={k:v for k,v in b['visibility'].items() if k not in ('hide_render','hide_viewport')}
            # Blender does not evaluate world/local matrices of newly hidden objects
            # on reopen. Admit only this exact cache case: no parent and all persisted
            # transform components / basis unchanged, new cache exactly identity.
            differing=[k for k in a['transform'] if a['transform'][k]!=b['transform'][k]]
            identity=[[float(i==j) for j in range(4)] for i in range(4)]
            if differing and set(differing).issubset({'matrix_world','matrix_local'}) and a['parent'] is None and b['parent'] is None and all(b['transform'][k]==identity for k in differing):
                hidden_transform_cache.append({'object':name,'fields':differing,'persistent_transform_and_basis_identical':True,'reason':'Hidden-on-reopen derived matrix cache is identity; source location/rotation/scale/basis and data are unchanged.'})
                a['transform']={k:v for k,v in a['transform'].items() if k not in differing};b['transform']={k:v for k,v in b['transform'].items() if k not in differing}

        if a!=b:unexpected[name]=[k for k in a if a[k]!=b.get(k)]
    checks['only_authorized_old_terrain_curb_gate_changes']=not unexpected and set(changed).issubset(TERRAINS|CURBS|GATES)
    checks['all36_gate_rails_hidden_and_no_other_visibility_changes']=all(after['objects'][name]['visibility']['hide_render'] and after['objects'][name]['visibility']['hide_viewport'] for name in GATES)
    terrain_report={}
    for name in TERRAINS:
        a,b=terrain_before[name],terrain_after[name];indices=[i for i,(p,q) in enumerate(zip(a['local'],b['local'])) if p!=q]
        illegal_core=[i for i in indices if i in a['protected_cell_vertices']];shore=[i for i in indices if a['distance_from_riverbank'][i]<=.6001]
        outside=[i for i in indices if not(-44.01<=a['world'][i][0]<=44.01 and -52.01<=a['world'][i][1]<=34.51)]
        checks[name+'_xy_topology_core_waterline_and_transition_scope']=len(a['local'])==len(b['local']) and all(p[:2]==q[:2] for p,q in zip(a['local'],b['local'])) and not illegal_core and not shore and not outside
        checks[name+'_finite_only_lowered_heights']=all(math.isfinite(v) for p in b['local'] for v in p) and all(b['world'][i][2]<=a['world'][i][2]+1e-6 for i in indices) and all(n[2]>0 for n in b['face_normals'])
        terrain_report[name]={'changed_vertex_count':len(indices),'core_violation_indices':illegal_core,'shore_violation_indices':shore,'outside_scope_indices':outside,'max_drop':max([a['world'][i][2]-b['world'][i][2] for i in indices],default=0)}
    curb_report={}
    for name in CURBS:
        a,b=curbs_before[name],curbs_after[name]
        good=True
        for old,new in zip(a['probes'],b['probes']):
            expected=.855 if new['y']>=6.85 else old['height']
            # The original unchanged Bevel modifier rounds new cut edges by 2.1 mm.
            # Exact unmodified slab geometry is verified independently below.
            good=good and new['height'] is not None and expected-.003<=new['height']<=expected+1e-5
        checks[name+'_only_upper_segment_lowered_with_same_bounds_and_slots']=good and all(abs(a['bounds'][key][i]-b['bounds'][key][i])<1e-5 for key in ['min','max'] for i in range(3)) and before['objects'][name]['data']['materials']==after['objects'][name]['data']['materials'] and after['objects'][name]['data']['name'].startswith('SPACE06_')
        slabs=sorted(b['components'],key=lambda row:row['bounds']['min'][1])
        lo,hi=a['bounds']['min'],a['bounds']['max']
        boxes=[{'min':lo,'max':[hi[0],6.85,hi[2]]},{'min':[lo[0],6.85,lo[2]],'max':[hi[0],hi[1],.855]}]
        checks[name+'_two_closed_exact_remainder_and_lowered_slabs']=len(slabs)==2 and all(row['closed'] and row['vertex_count']==8 and row['face_count']==6 and all(abs(row['bounds'][k][axis]-box[k][axis])<1e-5 for k in ['min','max'] for axis in range(3)) for row,box in zip(slabs,boxes))
        curb_report[name]={'before':a,'after':b}

    added=sorted(after['objects'].keys()-before['objects'].keys());new_scope=[]
    checks['new_objects_only_SPACE06_geometry']=bool(added) and all(name.startswith('SPACE06_') and after['objects'][name]['type'] in ('MESH','CURVE') for name in added)
    for name in added:
        obj=bpy.data.objects[name];box=bounds([obj.matrix_world@Vector(p) for p in obj.bound_box]);new_scope.append({'object':name,'bounds':box})
    checks['new_objects_inside_finite_landscape_envelope']=all(-53<=r['bounds']['min'][0] and r['bounds']['max'][0]<=53 and -53<=r['bounds']['min'][1] and r['bounds']['max'][1]<=40 and -.5<=r['bounds']['min'][2] and r['bounds']['max'][2]<=12 for r in new_scope)
    data_changes={}
    for category in ('materials','node_groups'):
        old,new=before[category],after[category];missing=sorted(old.keys()-new.keys());altered=sorted(n for n in old.keys()&new.keys() if old[n]!=new[n]);extra=sorted(new.keys()-old.keys());data_changes[category]={'missing':missing,'altered':altered,'added':extra}
        checks['old_'+category+'_frozen_new_prefix']=not missing and not altered and all(n.startswith('SPACE06_') for n in extra)
    for category in ('worlds','view_layers'):checks[category+'_frozen']=before[category]==after[category]
    oldgroups,newgroups=before['locked_scene']['collections'],after['locked_scene']['collections'];extra=set(newgroups)-set(oldgroups)
    checks['old_collections_and_layer_flags_frozen']=all(newgroups.get(n)==v for n,v in oldgroups.items()) and all(after['layer_collection_flags'].get(n)==v for n,v in before['layer_collection_flags'].items())
    checks['new_collections_independent']=bool(extra) and all(n.startswith('SPACE06_') for n in extra) and all(set(after['objects'][n]['collections']).issubset(extra) for n in added)
    checks['camera_lights_scene_settings_frozen']=all(after['locked_scene'].get(k)==v for k,v in before['locked_scene'].items() if k!='collections') and before['counts']['cameras']==after['counts']['cameras'] and before['counts']['lights']==after['counts']['lights']
    checks['original522_route_results_identical_and_pass']=routes==old_routes and sum(r['sample_count'] for r in routes['routes'].values())==522 and all(r['sampled_checks_passed'] for r in routes['routes'].values())
    checks['original33_support_samples_identical']=supports==support_before
    checks['original05_runtime_routes_heights_identical']=not nav['oldHeightDifferences']
    water=verify_background_water();checks['water_background_checks_pass']=water['passed']
    physical=physical_checks(nav);checks['runtime_routes_and_new_walkable_grid_physically_supported_clear']=physical['passed']
    files_after=file_changes(preserved);checks['all148_preserved_files_unchanged']=len(preserved)==148 and not files_before and not files_after
    oldmanifest=load_json(ROOT/'web/models/space-05-manifest.json');manifest=load_json(MANIFEST)
    checks['source_and_candidate_manifest_hashes_match']=before['sha256']==oldmanifest['integrated_blend']['sha256'] and after['sha256']==manifest['integrated_blend']['sha256'] and file_hash(GLB)==manifest['sha256']
    document,glb=read_glb(GLB);delta=glb['triangles']-oldmanifest['geometry']['triangles']
    checks['net_geometry_increase_within105000_budget']=0<delta<=105000
    checks['glb_no_cameras_lights']=not document.get('cameras') and not document.get('extensions',{}).get('KHR_lights_punctual')
    checks['audit_saved_blends_and_navigation_unchanged']=file_hash(SOURCE)==before['sha256'] and file_hash(CANDIDATE)==after['sha256'] and file_hash(ROOT/'web/scene-space-06-navigation.js')==nav_hash
    report={'schema_version':1,'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,'source':{'file':SOURCE.name,'sha256':before['sha256'],'counts':before['counts']},'candidate':{'file':CANDIDATE.name,'sha256':after['sha256'],'counts':after['counts']},'changed_old_objects':changed,'unexpected_old_changes':unexpected,'hidden_transform_cache':hidden_transform_cache,'terrain':terrain_report,'curbs':curb_report,'new_objects':added,'new_object_scope':new_scope,'materials_nodes':data_changes,'old522_routes':routes,'old33_support':supports,'water':water,'physical_navigation':physical,'runtime_navigation':{k:v for k,v in nav.items() if k not in ('grid','routes')},'runtime_routes':{k:v['route'] for k,v in nav['routes'].items()},'preservation':{'count':len(preserved),'before':files_before,'after':files_after},'glb':{'bytes':GLB.stat().st_size,'sha256':file_hash(GLB),**glb,'net_triangle_increase':delta},'seconds':round(time.perf_counter()-started,3),'limitations':['Read-only: no saving or rendering. Runtime navigation proxies are sampled against independent real Blender meshes, not a continuous physical proof.','Old source and versions are hash protected. Only explicit peripheral terrain, two curb crossings and gate-bar visibility changes are allowed in the new copy.','House interiors and landscape gardens remain non-walkable; developed streets are finite.']}
    with output.open('x',encoding='utf-8') as stream:json.dump(report,stream,ensure_ascii=False,indent=2);stream.write('\n')
    print('SPACE06_POSTCHECK',json.dumps({'passed':report['passed'],'failed':[k for k,v in checks.items() if not v],'unexpected':unexpected,'physical_failures':{k:len(v) for k,v in physical['failures'].items()},'counts':physical['counts'],'net_triangles':delta,'report':str(output),'seconds':report['seconds']},ensure_ascii=False),flush=True)
    if not report['passed']:raise RuntimeError('SPACE06 independent audit failed; inspect preserved report.')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--inspect-source',action='store_true');parser.add_argument('--output',type=Path)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    output=args.output or ROOT/('artifacts/scene-space-06/source-route-diagnostics.json' if args.inspect_source else 'assets/space-06-postcheck.json')
    output.parent.mkdir(exist_ok=True)
    if args.inspect_source:inspect_source(output)
    else:final_audit(output)
