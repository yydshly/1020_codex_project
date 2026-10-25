"""Read-only SPACE03 audit of the three opposite-bank exterior houses."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0,str(SCRIPT_DIR))
from audit_boundary_extension import snapshot
from audit_v5 import file_hash, mesh_state
from build_roam_scene import verify_background_water
from check_space_02 import connection_probes, file_changes, load_json
from export_viewer import read_glb
from extend_scene import check_routes

ROOT = SCRIPT_DIR.parent
SOURCE = ROOT/'artifacts/rainy-canal-space-02.blend'
CANDIDATE = ROOT/'artifacts/rainy-canal-space-03.blend'
GLB = ROOT/'web/models/space-03.glb'
MANIFEST = ROOT/'web/models/space-03-manifest.json'
BASELINE = ROOT/'artifacts/scene-space-03/preserved-files.json'
OLD_BASELINE = ROOT/'artifacts/scene-space-02/preserved-files.json'
OUTPUT = ROOT/'assets/space-03-postcheck.json'
HOUSE_GROUP = 'EXT_OppositeBuildings'
FACADES = 'SPACE03_Facades'
ROOFS = 'SPACE03_Roofs'
HIDE_ONLY = {f'EXT_Opposite_{i:02d}_{kind}' for i in (1,2,3) for kind in ('ClosedShell','OpaqueWindowDoorDetails')}
REPLACE_ROOF = {f'EXT_Opposite_{i:02d}_ClosedRoof' for i in (1,2,3)}
REPLACE_PLINTH = {f'EXT_Opposite_{i:02d}_StonePlinth' for i in (1,2,3)}
HOUSES = [
    {'id':1,'x':-11.0,'width':5.6,'eaves':5.1,'ridge':6.25},
    {'id':2,'x':-3.0,'width':5.8,'eaves':6.0,'ridge':7.15},
    {'id':3,'x':4.8,'width':5.6,'eaves':4.8,'ridge':5.95},
]


def bounds(obj):
    values=[obj.matrix_world @ Vector(point) for point in obj.bound_box]
    return {'min':[min(v[a] for v in values) for a in range(3)],'max':[max(v[a] for v in values) for a in range(3)]}


def plinth_state():
    result={}
    for name in REPLACE_PLINTH:
        obj=bpy.data.objects[name]
        obj.data.calc_loop_triangles()
        origin=obj.data.vertices[0].co
        volume=abs(sum((obj.data.vertices[t.vertices[0]].co-origin).dot((obj.data.vertices[t.vertices[1]].co-origin).cross(obj.data.vertices[t.vertices[2]].co-origin))/6 for t in obj.data.loop_triangles))
        result[name]={'bounds':bounds(obj),'volume':volume,'triangles':len(obj.data.loop_triangles)}
    return result


def plinth_notch_probes(source_state,source_snapshot):
    checks={}
    result={}
    for house in HOUSES:
        name=f"EXT_Opposite_{house['id']:02d}_StonePlinth"
        obj=bpy.data.objects[name]
        vertices=[obj.matrix_world@v.co for v in obj.data.vertices]
        tree=BVHTree.FromPolygons(vertices,[tuple(p.vertices) for p in obj.data.polygons],all_triangles=False)
        original=source_state[name]
        edge=original['bounds']
        low,high=edge['min'][2],edge['max'][2]
        probes=[]
        for side,cx,width,yedge,direction in [('front',house['x'],1.0,edge['max'][1],-1),('rear',house['x']+.45,.93,edge['min'][1],1)]:
            for fraction in (.2,.8):
                for dx in (-width*.3,0,width*.3):
                    x,y=cx+dx,yedge+direction*.4*fraction
                    top_hit=tree.ray_cast(Vector((x,y,1.6)),Vector((0,0,-1)),2)[0]
                    bottom_hit=tree.ray_cast(Vector((x,y,.6)),Vector((0,0,1)),1)[0]
                    probes.append({'side':side,'kind':'notch','xy':[x,y],'top':top_hit.z if top_hit else None,'bottom':bottom_hit.z if bottom_hit else None})
            for dx,depth in [(-width/2-.12,.2),(width/2+.12,.2),(0,.48)]:
                x,y=cx+dx,yedge+direction*depth
                hit=tree.ray_cast(Vector((x,y,1.6)),Vector((0,0,-1)),2)[0]
                probes.append({'side':side,'kind':'outside_notch','xy':[x,y],'top':hit.z if hit else None})
        current=plinth_state_single(obj)
        expected_removed=(1.0+.93)*.4*(high-.925)
        old_mesh=bpy.data.meshes.get(source_snapshot['objects'][name]['data']['name'])
        label=f"plinth_{house['id']}"
        checks[label+'_bounds_unchanged']=all(abs(current['bounds'][key][a]-edge[key][a])<1e-5 for key in ('min','max') for a in range(3))
        checks[label+'_door_notch_top0925_and_solid_bottom']=all(p['top'] is not None and abs(p['top']-.925)<1e-5 and p['bottom'] is not None and abs(p['bottom']-low)<1e-5 for p in probes if p['kind']=='notch')
        checks[label+'_outside_notches_still117']=all(p['top'] is not None and abs(p['top']-high)<1e-5 for p in probes if p['kind']=='outside_notch')
        checks[label+'_only_expected_notch_volume_removed']=abs((original['volume']-current['volume'])-expected_removed)<5e-5
        checks[label+'_original_mesh_retained_unchanged']=old_mesh is not None and old_mesh.use_fake_user and mesh_state(old_mesh)==source_snapshot['objects'][name]['data']
        result[name]={'before':original,'after':current,'expected_removed_volume':expected_removed,'measured_removed_volume':original['volume']-current['volume'],'probes':probes,'original_mesh_fake_user':bool(old_mesh and old_mesh.use_fake_user)}
    return checks,result


def plinth_state_single(obj):
    obj.data.calc_loop_triangles()
    origin=obj.data.vertices[0].co
    volume=abs(sum((obj.data.vertices[t.vertices[0]].co-origin).dot((obj.data.vertices[t.vertices[1]].co-origin).cross(obj.data.vertices[t.vertices[2]].co-origin))/6 for t in obj.data.loop_triangles))
    return {'bounds':bounds(obj),'volume':volume,'triangles':len(obj.data.loop_triangles)}


def closed_front_probes():
    scene,deps=bpy.context.scene,bpy.context.evaluated_depsgraph_get()
    result={}
    for house in HOUSES:
        for above in (.4,1.0,1.65):
            hit,pos,normal,face,obj,matrix=scene.ray_cast(deps,Vector((house['x'],-15.7,.85+above)),Vector((0,-1,0)),distance=1.4)
            result[f"house_{house['id']}_height_{above}"]={'hit':hit,'object':obj.name if hit else None,'position':list(pos) if hit else None}
    return result


def point_in_envelope(point,group):
    x,y,z=point
    for house in HOUSES:
        dx=.5 if group==FACADES else .48
        front=-15.85 if group==FACADES else -15.95
        back=-21.65 if group==FACADES else -21.75
        top=house['eaves'] if group==FACADES else house['ridge']+.14
        if house['x']-house['width']/2-dx-.001 <= x <= house['x']+house['width']/2+dx+.001 and back-.001 <= y <= front+.001 and .80 <= z <= top+.001:
            return True
    return False


def new_geometry_scope(names):
    deps=bpy.context.evaluated_depsgraph_get()
    report={}
    for name in names:
        obj=bpy.data.objects[name]
        group=FACADES if FACADES in [c.name for c in obj.users_collection] else ROOFS
        evaluated=obj.evaluated_get(deps)
        mesh=evaluated.to_mesh()
        if mesh is None:
            report[name]={'error':'new object cannot be evaluated as geometry'}
            continue
        points=[obj.matrix_world @ v.co for v in mesh.vertices]
        outside=[list(p) for p in points if not point_in_envelope(p,group)]
        report[name]={'vertices':len(points),'outside_envelope_count':len(outside),'first_outside_points':outside[:6],'bounds':{'min':[min(p[a] for p in points) for a in range(3)],'max':[max(p[a] for p in points) for a in range(3)]}}
        evaluated.to_mesh_clear()
    return report


def run():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=OUTPUT)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.output.exists():
        raise RuntimeError('Refusing to overwrite prior report: '+str(args.output))
    for path in (SOURCE,CANDIDATE,GLB,MANIFEST,BASELINE,OLD_BASELINE):
        if not path.is_file():
            raise RuntimeError('Required artifact missing: '+str(path))
    started=time.perf_counter()
    preserved,old_preserved=load_json(BASELINE),load_json(OLD_BASELINE)
    files_before=file_changes(preserved)
    before=snapshot(SOURCE)
    plinths_before=plinth_state()
    support_before=connection_probes()
    roof_bounds_before={name:bounds(bpy.data.objects[name]) for name in REPLACE_ROOF}
    front_before=closed_front_probes()
    after=snapshot(CANDIDATE)
    supports=connection_probes()
    routes=check_routes()
    water=verify_background_water()
    front_after=closed_front_probes()
    checks={}
    changed={}
    unexpected={}
    transform_differences={}
    hidden_transform_cache_differences={}
    checks['no_old_objects_removed']=not(before['objects'].keys()-after['objects'].keys())
    added=sorted(after['objects'].keys()-before['objects'].keys())
    for name,previous in before['objects'].items():
        current=after['objects'].get(name)
        if current is None:
            unexpected[name]=['missing']
            continue
        if previous==current:
            continue
        changed[name]=[key for key in previous if previous[key]!=current.get(key)]
        if previous['transform']!=current['transform']:
            transform_differences[name]={key:{'before':value,'after':current['transform'].get(key)} for key,value in previous['transform'].items() if value!=current['transform'].get(key)}
        old,new=dict(previous),dict(current)
        if name in HIDE_ONLY:
            old['visibility']={key:value for key,value in old['visibility'].items() if key not in ('hide_render','hide_viewport')}
            new['visibility']={key:value for key,value in new['visibility'].items() if key not in ('hide_render','hide_viewport')}
            # Hidden objects can reopen with uncomputed world/local matrices.
            # Only normalize this exact cache case; persistent transform fields,
            # matrix_basis, mesh, parent and all other object fields remain strict.
            old_transform,new_transform=old['transform'],new['transform']
            persistent_keys=set(old_transform)-{'matrix_world','matrix_local'}
            identity=[[float(r==c) for c in range(4)] for r in range(4)]
            if old['parent'] is None and new['parent'] is None and all(old_transform[k]==new_transform[k] for k in persistent_keys) and all(old_transform[k]==old_transform['matrix_basis'] and new_transform[k]==identity for k in ('matrix_world','matrix_local')) and old_transform['matrix_basis']!=identity:
                hidden_transform_cache_differences[name]={'world_and_local_cache_in_hidden_candidate':'identity','all_persistent_transform_fields_and_matrix_basis_identical':True,'unparented_source_world_equals_basis':True,'interpretation':'Hidden-object derived matrix cache is not evaluated on load; no stored location, rotation, scale, basis, or parenting change.'}
                old['transform']={k:old_transform[k] for k in persistent_keys}
                new['transform']={k:new_transform[k] for k in persistent_keys}
        elif name in REPLACE_ROOF|REPLACE_PLINTH:
            old.pop('data')
            new.pop('data')
        if old!=new:
            unexpected[name]=[key for key in old if old[key]!=new.get(key)]
    checks['only_whitelisted_old_object_fields_changed']=not unexpected
    checks['all_whitelisted_old_objects_belong_to_opposite_group']=all(HOUSE_GROUP in before['objects'][name]['collections'] for name in HIDE_ONLY|REPLACE_ROOF|REPLACE_PLINTH)
    checks['six_replaced_shell_window_objects_hidden_only']=all(after['objects'][name]['visibility']['hide_render'] and after['objects'][name]['visibility']['hide_viewport'] for name in HIDE_ONLY)
    checks['three_roof_data_replaced_with_new_space03_meshes']=all(after['objects'][name]['data']['name'].startswith('SPACE03_') and after['objects'][name]['data']!=before['objects'][name]['data'] for name in REPLACE_ROOF)
    checks['old_roof_material_slots_unchanged']=all(after['objects'][name]['material_slots']==before['objects'][name]['material_slots'] and after['objects'][name]['data']['materials']==['roof','plaster_alt'] for name in REPLACE_ROOF)
    checks['three_plinth_data_replaced_material_slots_preserved']=all(after['objects'][name]['data']['name'].startswith('SPACE03_') and after['objects'][name]['data']!=before['objects'][name]['data'] and after['objects'][name]['material_slots']==before['objects'][name]['material_slots'] and after['objects'][name]['data']['materials']==before['objects'][name]['data']['materials'] for name in REPLACE_PLINTH)
    plinth_checks,plinth_report=plinth_notch_probes(plinths_before,before)
    checks.update(plinth_checks)
    checks['new_objects_space03_geometry_only']=bool(added) and all(name.startswith('SPACE03_') and after['objects'][name]['type'] in ('MESH','CURVE') and after['objects'][name]['data']['name'].startswith('SPACE03_') for name in added)
    checks['new_objects_independent_facade_roof_collections']=all(len(after['objects'][name]['collections'])==1 and after['objects'][name]['collections'][0] in (FACADES,ROOFS) for name in added)
    checks['no_new_lights_or_cameras']=before['counts']['lights']==after['counts']['lights'] and before['counts']['cameras']==after['counts']['cameras']
    data_changes={}
    for category in ('materials','node_groups'):
        previous,current=before[category],after[category]
        missing=sorted(previous.keys()-current.keys())
        altered=[name for name in previous.keys()&current.keys() if previous[name]!=current[name]]
        new_names=sorted(current.keys()-previous.keys())
        data_changes[category]={'missing':missing,'changed':altered,'new':new_names}
        checks['old_'+category+'_fully_frozen']=not missing and not altered
        checks['new_'+category+'_space03_prefix']=all(name.startswith('SPACE03_') for name in new_names)
    for category in ('worlds','view_layers'):
        checks[category+'_fully_frozen']=before[category]==after[category]
    prior_report=load_json(ROOT/'assets/space-03-postcheck-final.json')
    checks['r2_adds_no_objects_or_materials_beyond_prior_space03']=added==prior_report['added_objects'] and data_changes['materials']['new']==prior_report['material_node_group_differences']['materials']['new']
    old_groups,groups=before['locked_scene']['collections'],after['locked_scene']['collections']
    checks['old_collection_members_and_visibility_frozen']=all(name in groups and group==groups[name] for name,group in old_groups.items())
    new_groups=sorted(groups.keys()-old_groups.keys())
    checks['only_facade_and_roof_collections_added']=set(new_groups)=={FACADES,ROOFS}
    checks['old_layer_collection_flags_frozen']=all(after['layer_collection_flags'].get(name)==flags for name,flags in before['layer_collection_flags'].items())
    checks['scene_settings_camera_world_compositor_frozen']=all(value==after['locked_scene'].get(key) for key,value in before['locked_scene'].items() if key!='collections')
    roof_bounds_after={name:bounds(bpy.data.objects[name]) for name in REPLACE_ROOF}
    checks['replaced_roofs_stay_within_original_horizontal_envelope_plus015m']=all(all(roof_bounds_after[name]['min'][a]>=roof_bounds_before[name]['min'][a]-.151 and roof_bounds_after[name]['max'][a]<=roof_bounds_before[name]['max'][a]+.151 for a in (0,1)) for name in REPLACE_ROOF)
    scope=new_geometry_scope(added)
    checks['new_detail_geometry_stays_at_three_existing_houses']=all(row.get('outside_envelope_count')==0 for row in scope.values())
    fixed_groups={'01 Cafe','02 Bookshop','03 Pottery shop','Bridge','Bridge railings','SPACE01_Buildings','SPACE01_Ground','ROAM01_Landscape'}
    fixed_names=[name for name,obj in before['objects'].items() if fixed_groups.intersection(obj['collections']) or name.startswith(('SPACE01_','ROAM01_'))]
    checks['ground_water_main_shops_bridges_courts_fully_frozen']=all(before['objects'][name]==after['objects'].get(name) for name in fixed_names)
    checks['background_water_rays_pass']=water['passed']
    checks['original522_route_samples_pass']=sum(row['sample_count'] for row in routes['routes'].values())==522 and all(row['sampled_checks_passed'] for row in routes['routes'].values())
    checks['all33_bridgehead_rear_alley_supports_hit']=len(supports)==33 and all(row['hit'] for row in supports.values())
    doorstep_keys={f'far_house_{i:02d}_front' for i in (1,2,3)}
    checks['other30_bridgehead_rear_alley_supports_unchanged']=all(supports[name]==row for name,row in support_before.items() if name not in doorstep_keys)
    checks['three_front_samples_only_gain_expected075m_door_threshold']=all(support_before[f'far_house_{i:02d}_front']['object']=='EXT_B02_OppositeBuildingsContinuousSupport' and supports[f'far_house_{i:02d}_front']['object']==f'SPACE03_Opposite_{i:02d}_WindowDoorJoinery' and abs(support_before[f'far_house_{i:02d}_front']['height']-.85)<1e-5 and abs(supports[f'far_house_{i:02d}_front']['height']-.925)<1e-5 for i in (1,2,3))
    checks['three_fronts_remain_blocked_at_cat_and_human_heights']=all(row['hit'] for row in front_before.values()) and all(row['hit'] for row in front_after.values())
    checks['previous124_hashes_included_unchanged']=len(old_preserved)==124 and all(name in preserved and preserved[name].lower()==value.lower() for name,value in old_preserved.items())
    files_after=file_changes(preserved)
    checks['all130_old_files_preserved']=len(preserved)==130 and not files_before and not files_after
    old_manifest=load_json(ROOT/'web/models/space-02-manifest.json')
    manifest=load_json(MANIFEST)
    checks['source_hash_matches_previous_manifest']=before['sha256']==old_manifest['integrated_blend']['sha256']
    checks['saved_blend_and_glb_match_new_manifest']=after['sha256']==manifest['integrated_blend']['sha256'] and file_hash(GLB)==manifest['sha256']
    document,glb_counts=read_glb(GLB)
    delta=glb_counts['triangles']-old_manifest['geometry']['triangles']
    checks['export_triangle_increase_within15000']=0<delta<=15000
    checks['glb_has_no_cameras_or_lights']=not document.get('cameras') and not document.get('extensions',{}).get('KHR_lights_punctual')
    checks['audit_did_not_change_saved_blends']=before['sha256']==file_hash(SOURCE) and after['sha256']==file_hash(CANDIDATE)
    report={'schema_version':1,'checked_utc':datetime.now(timezone.utc).isoformat(),'passed':all(checks.values()),'checks':checks,
        'source':{'file':SOURCE.name,'sha256':before['sha256'],'counts':before['counts']},'candidate':{'file':CANDIDATE.name,'sha256':after['sha256'],'counts':after['counts']},
        'allowed_changes':{'hide_render_and_hide_viewport_only':sorted(HIDE_ONLY),'data_replacement_only':sorted(REPLACE_ROOF|REPLACE_PLINTH),'new_collections':[FACADES,ROOFS]},
        'changed_old_objects':changed,'unexpected_old_object_changes':unexpected,'transform_differences':transform_differences,'hidden_transform_cache_differences':hidden_transform_cache_differences,'added_objects':added,'new_collections':new_groups,'material_node_group_differences':data_changes,
        'roof_bounds_before':roof_bounds_before,'roof_bounds_after':roof_bounds_after,'plinth_notch_audit':plinth_report,'new_geometry_scope':scope,'fixed_environment_object_count':len(fixed_names),
        'background_water_checks':water,'route_checks':routes,'support_samples':supports,'doorstep_support_changes':{name:{'before':support_before[name],'after':supports[name]} for name in sorted(doorstep_keys)},'front_barrier_probes':{'before':front_before,'after':front_after},
        'preservation':{'baseline':BASELINE.relative_to(ROOT).as_posix(),'baseline_sha256':file_hash(BASELINE),'old_file_count':len(old_preserved),'checked_file_count':len(preserved),'changes_before':files_before,'changes_after':files_after},
        'glb':{'file':GLB.name,'sha256':file_hash(GLB),'bytes':GLB.stat().st_size,**glb_counts,'triangle_increase':delta},'seconds':round(time.perf_counter()-started,3),
        'limitations':['No scene save, render or browser action. The six old shell/window batches are retained but intentionally hidden in the new copy.','The three closed-roof objects retain their transforms and material slots, while their mesh data is intentionally replaced.','522 route samples, 33 support samples and nine facade barrier rays do not certify arbitrary movement or real building interiors.','Geometric scope and preservation checks do not certify visual realism or reference-image fidelity.']}
    with args.output.open('x',encoding='utf-8') as stream:
        json.dump(report,stream,ensure_ascii=False,indent=2,allow_nan=False)
        stream.write('\n')
    print('SPACE03_POSTCHECK',json.dumps({'passed':report['passed'],'failed':[name for name,ok in checks.items() if not ok],'report':str(args.output),'changed_old_objects':len(changed),'new_objects':len(added),'triangles':glb_counts['triangles'],'triangle_increase':delta,'preserved_files':len(preserved),'seconds':report['seconds']},ensure_ascii=False),flush=True)
    if not report['passed']:
        raise RuntimeError('SPACE03 independent audit failed; inspect report.')


if __name__=='__main__':
    run()
