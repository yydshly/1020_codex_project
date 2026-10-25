"""SPACE08 independent read-only layout, preservation and physical access audit.

No saving, rendering, source edits or browser use. Reports are append-only.
"""
import argparse
from collections import Counter
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
from mathutils.kdtree import KDTree

sys.dont_write_bytecode=True
SCRIPT_DIR=Path(__file__).resolve().parent
sys.path.insert(0,str(SCRIPT_DIR))
from audit_boundary_extension import snapshot
from audit_v5 import file_hash,json_hash
from check_space_02 import connection_probes,file_changes,load_json
from check_space_05 import bounds
from build_roam_scene import verify_background_water
from extend_scene import check_routes
from export_viewer import read_glb

ROOT=SCRIPT_DIR.parent
SOURCE=ROOT/'artifacts/rainy-canal-space-06.blend'
CANDIDATE=ROOT/'artifacts/rainy-canal-space-08.blend'
GLB=ROOT/'web/models/space-08.glb'
MANIFEST=ROOT/'web/models/space-08-manifest.json'
LAYOUT=ROOT/'assets/space-08-layout.json'
BASELINE=ROOT/'artifacts/scene-space-08/preserved-files.json'
BACKLAND=['South backland house','South backland offset wing','North backland range','North backland low wing']


def allowed_hidden_objects():
    previous=load_json(ROOT/'web/models/space-06-manifest.json')
    return set(previous['neighbourhood']['buildings']['objects'])|{
        f'SPACE01_{house} {suffix}' for house in BACKLAND for suffix in ['envelope details','closed pitched roof']
    }|{'SPACE06_HouseGroundingAndDoorPaths'}


def inspect_source(output):
    if output.exists():raise RuntimeError('Refusing to overwrite '+str(output))
    before=snapshot(SOURCE);allowed=allowed_hidden_objects();missing=sorted(allowed-before['objects'].keys())
    record={}
    for name in sorted(allowed-set(missing)):
        obj=bpy.data.objects[name]
        record[name]={'type':obj.type,'bounds':bounds([obj.matrix_world@Vector(p) for p in obj.bound_box]),
          'snapshot':before['objects'][name]}
    preserved=load_json(BASELINE);changed=file_changes(preserved)
    report={'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':not missing and not changed and len(allowed)==60,
      'source':{'file':SOURCE.name,'sha256':before['sha256'],'counts':before['counts']},
      'allowed_hidden_count':len(allowed),'allowed_hidden_objects':record,'missing_names':missing,
      'preserved_files':len(preserved),'changed_preserved_files':changed,
      'scope':'Only hide_render/hide_viewport of these 60 source objects may change. Mesh data, persistent transforms, material slots, source files remain intact; new SPACE08 geometry supplies replacements.'}
    with output.open('x',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2);f.write('\n')
    print('SPACE08_SOURCE_BASELINE',json.dumps({k:report[k] for k in ['passed','allowed_hidden_count','missing_names','preserved_files','changed_preserved_files']}),flush=True)




def runtime_navigation():
    result=subprocess.run([shutil.which('node') or 'node',str(SCRIPT_DIR/'check_space_08_navigation.mjs'),'--data'],capture_output=True,text=True,check=True,cwd=str(ROOT))
    return json.loads(result.stdout)


def layout_geometry_checks(buildings):
    houses=buildings['houses'];checks={};records={'houses':[],'roof_overlaps':[],'footprint_overlaps':[],'party_walls':[],'door_thresholds':[],'door_panel_rays':[]}
    scene,deps=bpy.context.scene,bpy.context.evaluated_depsgraph_get()
    for house in houses:
        objects=[bpy.data.objects[name] for name in house['objects']]
        actual=bounds([o.matrix_world@v.co for o in objects for v in o.data.vertices])
        roof=bpy.data.objects[next(n for n in house['objects'] if n.endswith('_RoofAndEaves'))]
        roofpoints=[roof.matrix_world@v.co for v in roof.data.vertices];roofbox=bounds(roofpoints)
        records['houses'].append({'id':house['id'],'actual_bounds':actual,'bounds_match_metadata':all(abs(actual[k][axis]-house['bounds'][k][axis])<1e-5 for k in ('min','max') for axis in range(3)),
          'roof_bounds_match_metadata':all(abs(roofbox[k][axis]-house['roof_bounds'][k][axis])<1e-5 for k in ('min','max') for axis in range(3))})
        for wall in house['party_walls']:
            origin=wall['start_xy'];normal=wall['outward_xy'];projection=max((p[0]-origin[0])*normal[0]+(p[1]-origin[1])*normal[1] for p in roofpoints)
            openings=[v['id'] for v in house['windows']+house['doors'] if v['side']==wall['side']]
            records['party_walls'].append({'house':house['id'],'side':wall['side'],'maximum_real_roof_projection':projection,'openings':openings})
        for door in house['doors']:
            x,y,z=door['threshold_center']
            expected=door['threshold_top'];origin=Vector((x,y,expected+.20))
            hit,pos,normal,face,obj,matrix=scene.ray_cast(deps,origin,Vector((0,0,-1)),distance=.5)
            joinery=bpy.data.objects[next(n for n in house['objects'] if n.endswith('_WindowsAndDoors'))]
            own=joinery.ray_cast(joinery.matrix_world.inverted()@origin,Vector((0,0,-1)),distance=.5)
            own_height=(joinery.matrix_world@own[1]).z if own[0] else None
            ground_base=door.get('ground_base_z',house['base_z'])
            nx,ny=door['outward_xy'];dx,dy=door['position_xy'];threshold_samples=[]
            for tangent in (-door['width']*.43,0,door['width']*.43):
                for depth in (.10,.15):
                    px,py=dx+nx*depth-ny*tangent,dy+ny*depth+nx*tangent
                    sample=scene.ray_cast(deps,Vector((px,py,expected+.20)),Vector((0,0,-1)),distance=.5)
                    threshold_samples.append({'xy':[px,py],'height':sample[1].z if sample[0] else None,'object':sample[4].name if sample[0] else None})
            opening_base=door['center'][2]-door['height']/2
            panel=scene.ray_cast(deps,Vector((dx+nx*.4,dy+ny*.4,opening_base+.06)),Vector((-nx,-ny,0)),distance=.8)
            records['door_panel_rays'].append({'id':door['id'],'opening_bottom':opening_base,'declared_panel_bottom':door.get('panel_bottom_z'),'local_ground_base':ground_base,
              'hit':panel[4].name if panel[0] else None,'expected_object':joinery.name,
              'passed':panel[0] and panel[4].name==joinery.name and abs(opening_base-ground_base-.015)<1e-5})
            records['door_thresholds'].append({'id':door['id'],'side':door['side'],'secondary':door['secondary'],
              'probe_xy':[x,y],'height':pos.z if hit else None,'own_mesh_height':own_height,'expected':expected,
              'local_ground_base':ground_base,'object':obj.name if hit else None,'visible_full_width_samples':threshold_samples})
    for i,a in enumerate(houses):
        for b in houses[i+1:]:
            f,g=a['footprint'],b['footprint'];dx=min(f[2],g[2])-max(f[0],g[0]);dy=min(f[3],g[3])-max(f[1],g[1])
            if dx>1e-4 and dy>1e-4:records['footprint_overlaps'].append({'a':a['id'],'b':b['id'],'overlap':[dx,dy]})
            f,g=a['roof_bounds'],b['roof_bounds'];overlap=[min(f['max'][k],g['max'][k])-max(f['min'][k],g['min'][k]) for k in range(3)]
            if all(v>1e-4 for v in overlap):records['roof_overlaps'].append({'a':a['id'],'b':b['id'],'overlap_xyz':overlap})
    checks['twentyone_real_houses_match_explicit_metadata']=len(houses)==21 and all(r['bounds_match_metadata'] and r['roof_bounds_match_metadata'] for r in records['houses'])
    checks['house_footprints_and_roof_volumes_do_not_overlap']=not records['footprint_overlaps'] and not records['roof_overlaps']
    checks['all_party_walls_have_zero_roof_overhang_and_no_openings']=len(records['party_walls'])>=16 and all(r['maximum_real_roof_projection']<=1e-5 and not r['openings'] for r in records['party_walls'])
    checks['all_real_thresholds_at_declared_local_three_point_five_cm_step']=all(r['height'] is not None and r['own_mesh_height'] is not None and abs(r['height']-r['expected'])<1e-4 and abs(r['own_mesh_height']-r['expected'])<1e-4 and abs(r['expected']-r['local_ground_base']-.035)<1e-5 for r in records['door_thresholds'])
    checks['public_front_and_secondary_thresholds_remain_at_089']=all(abs(r['expected']-.89)<1e-5 for r in records['door_thresholds'] if r['side']=='front' or r['secondary'])
    checks['threshold_full_width_not_buried_and_closed_panels_follow_local_base']=all(all(s['height'] is not None and abs(s['height']-r['expected'])<1e-4 for s in r['visible_full_width_samples']) for r in records['door_thresholds']) and all(r['passed'] for r in records['door_panel_rays'])
    checks['red_box_two_houses_address_south_street_with_mutual_side_entries']=all(next(d for d in h['doors'] if d['side']=='front')['outward_xy']==[0.,-1.] for h in houses if h['id'].startswith('proxy_south_')) and all(any(d['secondary'] for d in h['doors']) for h in houses if h['id'].startswith('proxy_south_'))
    checks['north_replacements_address_north_street']=all(next(d for d in h['doors'] if d['side']=='front')['outward_xy']==[0.,1.] for h in houses if h['id'].startswith('proxy_north_'))
    checks['corner_variants_have_actual_secondary_doors']=all(any(d['secondary'] and d['side']==h['secondary_front'] for d in h['doors']) for h in houses if h['secondary_front'])
    checks['three_forms_and_one_two_storey_mix_exist']=len({h['variant'] for h in houses})>=3 and {h['floors'] for h in houses}=={1,2} and len({h['window_count'] for h in houses})>=3
    return checks,records


def door_physical_checks(nav,buildings):
    scene,deps=bpy.context.scene,bpy.context.evaluated_depsgraph_get();rows=[]
    lookup={d['id']:(h,d) for h in buildings['houses'] for d in h['doors']}
    for access in nav['doors']:
        point=access.get('approach');house,door=lookup[access['id']]
        if not point:rows.append({'id':access['id'],'passed':False,'reason':'No reachable approach'});continue
        x,y=point['xy'];height=point['height'];nx,ny=door['outward_xy']
        floor=bpy.context.scene.ray_cast(deps,Vector((x,y,height+.2)),Vector((0,0,-1)),distance=.45)
        panel=scene.ray_cast(deps,Vector((x,y,height+1.0)),Vector((-nx,-ny,0)),distance=point['distance']+.22)
        head=scene.ray_cast(deps,Vector((x,y,height+.03)),Vector((0,0,1)),distance=1.97)
        floor_good=floor[0] and abs(floor[1].z-height)<.015
        panel_good=panel[0] and panel[4].name in house['objects']
        rows.append({'id':door['id'],'house':house['id'],'approach':point,'floor_height':floor[1].z if floor[0] else None,
          'closed_door_or_frame':panel[4].name if panel[0] else None,'head_obstacle':head[4].name if head[0] else None,
          'passed':bool(floor_good and panel_good and not head[0])})
    return {'passed':all(row['passed'] for row in rows),'count':len(rows),'rows':rows}


def shoulder_checks(ground):
    records=[];terrain_objects=[bpy.data.objects[n] for n in ('ROAM01_North continuous terrain','ROAM01_South continuous terrain')]
    shoulder=bpy.data.objects['SPACE08_SoftFrontageShoulders'];points=[shoulder.matrix_world@v.co for v in shoulder.data.vertices]
    tree=KDTree(len(points))
    for i,p in enumerate(points):tree.insert(p,i)
    tree.balance()
    for index,row in enumerate(ground['shoulders']):
        terrain_heights=[]
        for x,y in row['outer']:
            hits=[]
            for obj in terrain_objects:
                hit,pos,normal,face=obj.ray_cast(obj.matrix_world.inverted()@Vector((x,y,10)),Vector((0,0,-1)),distance=20)
                if hit:hits.append((obj.matrix_world@pos).z)
            terrain_heights.append(max(hits) if hits else None)
        errors=[abs(z-h-.004) if h is not None else 999 for z,h in zip(row['outer_heights'],terrain_heights)]
        declared=[(*xy,z) for xy,z in zip(row['outer'],row['outer_heights'])]+[(*xy,z) for xy,z in zip(row['inner'],row.get('inner_heights',[.851,.851]))]
        geometry_error=max(tree.find(Vector(p))[2] for p in declared)
        records.append({'index':index,'width':row['width'],'gradient':row['max_gradient'],'outer_terrain_errors':errors,'actual_mesh_vertex_error':geometry_error,'passed':max(errors)<1e-4 and geometry_error<1e-5 and row['width']>.16})
    return {'passed':bool(records) and all(r['passed'] for r in records),'count':len(records),'max_gradient':max((r['gradient'] for r in records),default=0),'max_outer_terrain_error':max((v for r in records for v in r['outer_terrain_errors']),default=0),'failures':[r for r in records if not r['passed']],
      'scope':'Every new shoulder endpoint exists in the actual mesh and meets unchanged terrain at +4mm. Inner heights follow the adjoining paving, including the southwest rising tail. Route/floor rays separately check public walking joins.'}


def original_step_body_rays(nav):
    """Measure existing short storefront steps on source, before opening candidate.

    These remain a documented baseline limitation, never a blanket body-ray
    exception: a candidate hit must match this source ray and unchanged object.
    """
    scene,deps=bpy.context.scene,bpy.context.evaluated_depsgraph_get();rows=[]
    steps={obj.name:bounds([obj.matrix_world@Vector(p) for p in obj.bound_box])
           for obj in scene.objects if obj.type=='MESH' and obj.name.startswith('Worn doorstep')}
    for row in nav['grid']:
        if not row.get('previousWalkable'):continue
        x,y=row['xy'];height=row['height']
        if not any(b['min'][0]-.24<=x<=b['max'][0]+.24 and b['min'][1]-.24<=y<=b['max'][1]+.24 for b in steps.values()):continue
        for side in ((1,0),(-1,0),(0,1),(0,-1)):
            for h in (.08,.4,1.65,2):
                hit,pos,normal,face,obj,matrix=scene.ray_cast(deps,Vector((x,y,height+h)),Vector((*side,0)),distance=.24)
                if hit and obj.name in steps:rows.append({'xy':[x,y],'height':h,'side':list(side),'hit':{'object':obj.name,'position':list(pos)}})
    return rows


def match_original_step(candidate,source):
    if set(candidate)!=set(source):return False
    if candidate['xy']!=source['xy'] or candidate['height']!=source['height'] or list(candidate['side'])!=source['side']:return False
    a,b=candidate['hit'],source['hit']
    return a['object']==b['object'] and max(abs(x-y) for x,y in zip(a['position'],b['position']))<1e-5


def final_audit(output):
    if output.exists():raise RuntimeError('Refusing to overwrite '+str(output))
    started=time.perf_counter()
    for p in (SOURCE,CANDIDATE,GLB,MANIFEST,BASELINE):
        if not p.is_file():raise RuntimeError('Missing '+str(p))
    protected=load_json(BASELINE);files_before=file_changes(protected);manifest=load_json(MANIFEST);oldmanifest=load_json(ROOT/'web/models/space-06-manifest.json')
    nav_report=runtime_navigation();nav=nav_report['data'];nav_hash=file_hash(ROOT/'web/scene-space-08-navigation.js')
    before=snapshot(SOURCE);oldroutes=check_routes();oldsupport=connection_probes();old_step_rays=original_step_body_rays(nav)
    after=snapshot(CANDIDATE);routes=check_routes();support=connection_probes();allowed=allowed_hidden_objects()
    checks={};changed={};unexpected={};hidden_caches=[]
    for name,old in before['objects'].items():
        new=after['objects'].get(name)
        if new is None:unexpected[name]=['missing'];continue
        if old==new:continue
        changed[name]=[k for k in old if old[k]!=new.get(k)];a,b=dict(old),dict(new)
        if name in allowed:
            a['visibility']={k:v for k,v in a['visibility'].items() if k not in ('hide_render','hide_viewport')};b['visibility']={k:v for k,v in b['visibility'].items() if k not in ('hide_render','hide_viewport')}
            differing=[k for k in a['transform'] if a['transform'][k]!=b['transform'][k]];identity=[[float(i==j) for j in range(4)] for i in range(4)]
            if differing and set(differing).issubset({'matrix_world','matrix_local'}) and a['parent'] is None and b['parent'] is None and all(b['transform'][k]==identity for k in differing):
                hidden_caches.append({'object':name,'fields':differing,'persistent_components_basis_unchanged':True})
                a['transform']={k:v for k,v in a['transform'].items() if k not in differing};b['transform']={k:v for k,v in b['transform'].items() if k not in differing}
        if a!=b:unexpected[name]=[k for k in a if a[k]!=b.get(k)]
    checks['only_exact_sixty_authorized_source_objects_hidden']=not unexpected and set(changed)==allowed and all(after['objects'][n]['visibility']['hide_render'] and after['objects'][n]['visibility']['hide_viewport'] for n in allowed)
    checks['all_original_data_material_slots_transforms_preserved']=not unexpected
    added=sorted(after['objects'].keys()-before['objects'].keys())
    checks['new_objects_only_SPACE08_geometry']=bool(added) and all(n.startswith('SPACE08_') and after['objects'][n]['type'] in ('MESH','CURVE') for n in added)
    material_changes={}
    for category in ('materials','node_groups'):
        old,new=before[category],after[category];missing=sorted(old.keys()-new.keys());altered=sorted(n for n in old.keys()&new.keys() if old[n]!=new[n]);extra=sorted(new.keys()-old.keys())
        material_changes[category]={'missing':missing,'altered':altered,'new':extra};checks['old_'+category+'_frozen_new_prefix']=not missing and not altered and all(n.startswith('SPACE08_') for n in extra)
    for category in ('worlds','view_layers'):checks[category+'_frozen']=before[category]==after[category]
    oldgroups,newgroups=before['locked_scene']['collections'],after['locked_scene']['collections'];extra=set(newgroups)-set(oldgroups)
    checks['old_collections_and_layer_flags_frozen']=all(newgroups.get(n)==r for n,r in oldgroups.items()) and all(after['layer_collection_flags'].get(n)==r for n,r in before['layer_collection_flags'].items())
    checks['new_collections_independent']=bool(extra) and all(n.startswith('SPACE08_') for n in extra) and all(set(after['objects'][n]['collections']).issubset(extra) for n in added)
    checks['source_camera_lights_world_settings_frozen']=all(after['locked_scene'].get(k)==v for k,v in before['locked_scene'].items() if k!='collections') and before['counts']['lights']==after['counts']['lights'] and before['counts']['cameras']==after['counts']['cameras']
    checks['old522_route_results_identical_and_pass']=routes==oldroutes and sum(r['sample_count'] for r in routes['routes'].values())==522 and all(r['sampled_checks_passed'] for r in routes['routes'].values())
    checks['old33_support_samples_identical']=support==oldsupport
    water=verify_background_water();checks['original_water_supported']=water['passed']
    checks['actual_runtime_navigation_and_entrance_connectivity_pass']=nav_report['passed']
    buildings=manifest['neighbourhood']['buildings'];ground=manifest['neighbourhood']['ground']
    layoutchecks,layout=layout_geometry_checks(buildings);checks.update(layoutchecks)
    doors=door_physical_checks(nav,buildings);checks['every_primary_and_secondary_door_real_floor_headroom_closed_panel']=doors['passed']
    shoulder=shoulder_checks(ground);checks['new_shoulder_edges_meet_real_unchanged_terrain']=shoulder['passed']
    from check_space_06 import physical_checks
    physical=physical_checks(nav)
    old_step_matches=[r for r in physical['failures']['grid'] if any(match_original_step(r,b) for b in old_step_rays)]
    unresolved={k:[r for r in rows if k!='grid' or r not in old_step_matches] for k,rows in physical['failures'].items()}
    physical['baseline_original_step_rays']=old_step_rays;physical['identical_original_step_hits']=old_step_matches
    physical['unresolved_failures']=unresolved;physical['no_new_physical_failures']=not any(unresolved.values())
    checks['old_outer_routes_new_court_and_authorized_grid_no_new_physical_obstructions']=physical['no_new_physical_failures']
    new_bounds=[]
    for n in added:
        obj=bpy.data.objects[n];new_bounds.append({'name':n,'bounds':bounds([obj.matrix_world@Vector(p) for p in obj.bound_box])})
    checks['all_new_geometry_in_existing_developed_envelope']=all(-36.01<=r['bounds']['min'][0] and r['bounds']['max'][0]<=36.01 and -44.51<=r['bounds']['min'][1] and r['bounds']['max'][1]<=27.01 and r['bounds']['min'][2]>=-.5 and r['bounds']['max'][2]<=12 for r in new_bounds)
    document,glb=read_glb(GLB);delta=glb['triangles']-oldmanifest['geometry']['triangles']
    checks['visible_glb_within_290000_triangle_budget']=glb['triangles']<=290000
    checks['glb_contains_no_camera_or_lights']=not document.get('cameras') and not document.get('extensions',{}).get('KHR_lights_punctual')
    checks['source_candidate_glb_hashes_match_manifests']=before['sha256']==oldmanifest['integrated_blend']['sha256'] and after['sha256']==manifest['integrated_blend']['sha256'] and file_hash(GLB)==manifest['sha256']
    files_after=file_changes(protected);checks['all163_prior_files_unchanged']=len(protected)==163 and not files_before and not files_after
    checks['read_only_blend_and_navigation_files_unchanged']=file_hash(SOURCE)==before['sha256'] and file_hash(CANDIDATE)==after['sha256'] and file_hash(ROOT/'web/scene-space-08-navigation.js')==nav_hash
    report={'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,
      'source':{'file':SOURCE.name,'sha256':before['sha256'],'counts':before['counts']},'candidate':{'file':CANDIDATE.name,'sha256':after['sha256'],'counts':after['counts']},
      'changed_source_objects':changed,'unexpected_changes':unexpected,'hidden_derived_matrix_caches':hidden_caches,'new_objects':added,'new_bounds':new_bounds,'material_changes':material_changes,
      'layout':layout,'door_physical_access':doors,'shoulders':shoulder,'runtime_navigation':{k:v for k,v in nav_report.items() if k!='data'},'physical_navigation':physical,
      'old522_route_checks':routes,'old33_support_checks':support,'water':water,'preservation':{'count':len(protected),'before':files_before,'after':files_after},
      'glb':{'file':GLB.name,'bytes':GLB.stat().st_size,'sha256':file_hash(GLB),**glb,'net_triangle_change_from_space06':delta},'seconds':round(time.perf_counter()-started,3),
      'limitations':['No save/render/browser action. Original source geometry is preserved behind explicit hidden replacements.','Shared walls, real roof bounds, threshold heights and reachable doorway approaches are independently verified; style/coherence still needs multi-view visual review.','Sampled floor/body/shoulder checks and a quarter-metre connectivity graph do not prove every continuous path. Interior rooms and earth gardens remain closed.','The unchanged original bookstore doorsteps can touch the 8cm ankle ray at edge-of-path grid samples. Every admitted hit is remeasured in the source scene at the identical point and direction; no new obstruction is admitted.']}
    with output.open('x',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2);f.write('\n')
    print('SPACE08_POSTCHECK',json.dumps({'passed':report['passed'],'failed':[k for k,v in checks.items() if not v],'unexpected':unexpected,'door_failures':[r['id'] for r in doors['rows'] if not r['passed']],'physical_failures':{k:len(v) for k,v in physical['failures'].items()},'counts':physical['counts'],'net_triangles':delta,'report':str(output),'seconds':report['seconds']},ensure_ascii=False),flush=True)
    if not report['passed']:raise RuntimeError('SPACE08 independent audit failed; inspect preserved report.')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--inspect-source',action='store_true');parser.add_argument('--output',type=Path)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    output=args.output or ROOT/('artifacts/scene-space-08/source-baseline.json' if args.inspect_source else 'assets/space-08-postcheck.json')
    if args.inspect_source:inspect_source(output)
    else:final_audit(output)
