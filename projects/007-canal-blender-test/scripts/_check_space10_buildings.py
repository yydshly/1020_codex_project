import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'));sys.dont_write_bytecode=True
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'artifacts/rainy-canal-space-08.blend'),load_ui=False,use_scripts=False)
bpy.context.view_layer.update()
before={obj.name:(obj.data.as_pointer() if obj.data else 0,tuple(obj.location),tuple(obj.rotation_euler),
                  tuple(obj.scale),tuple(m.name for m in obj.data.materials) if obj.type=='MESH' else ())
        for obj in bpy.data.objects}
from build_space_10_buildings import build
layout=json.loads((ROOT/'assets/space-10-layout.json').read_text(encoding='utf-8-sig'))
report=build(layout)
bpy.context.view_layer.update()
report['original_data_transforms_materials_unchanged']=all(
    name in bpy.data.objects and state==(obj.data.as_pointer() if obj.data else 0,tuple(obj.location),tuple(obj.rotation_euler),
      tuple(obj.scale),tuple(m.name for m in obj.data.materials) if obj.type=='MESH' else ())
    for name,state in before.items() for obj in [bpy.data.objects[name]])
report['hidden_replacements']=all(bpy.data.objects[name].hide_render and bpy.data.objects[name].hide_viewport for name in report['replacedObjects'])
report['party_openings_suppressed']=all(not any(w['side']==party['side'] for w in house['windows']) and
    not any(d['side']==party['side'] for d in house['doors']) and house['eave_overhangs_local'][party['side']]==0
    for house in report['houses'] for party in house['party_walls'])
report['secondary_entries_present']=all(any(d['side']==house['secondary_front'] and d['secondary'] for d in house['doors'])
    for house in report['houses'] if house['secondary_front'])
report['thresholds_035']=all(abs(d['threshold_top']-d['ground_base_z']-.035)<1e-6 for house in report['houses'] for d in house['doors'])
threshold_rays=[];deps=bpy.context.evaluated_depsgraph_get()
for house in report['houses']:
    obj=bpy.data.objects['SPACE10_'+house['id']+'_WindowsAndDoors']
    for door in house['doors']:
        x,y,_=door['threshold_center'];start=Vector((x,y,door['threshold_top']+.20));down=Vector((0,0,-1))
        own=obj.ray_cast(obj.matrix_world.inverted()@start,down,distance=.7)
        world=bpy.context.scene.ray_cast(deps,start,down,distance=.7)
        threshold_rays.append({'id':door['id'],'expected':door['threshold_top'],
                              'own_top':own[1].z if own[0] else None,'visible_top':world[1].z if world[0] else None,
                              'visible_object':world[4].name if world[0] else None})
report['actual_threshold_rays']=threshold_rays
report['all_own_and_visible_thresholds_match']=all(r['own_top'] is not None and r['visible_top'] is not None
    and abs(r['own_top']-r['expected'])<1e-4 and abs(r['visible_top']-r['expected'])<1e-4 for r in threshold_rays)
report['new_footprint_overlaps']=[]
for i,a in enumerate(report['houses']):
    for b in report['houses'][i+1:]:
        A,B=a['footprint'],b['footprint']
        if min(A[2],B[2])-max(A[0],B[0])>1e-5 and min(A[3],B[3])-max(A[1],B[1])>1e-5:
            report['new_footprint_overlaps'].append([a['id'],b['id']])

frozen=[]
for identifier in layout['frozen_house_ids']:
    same=True
    for suffix in ('WallsAndPlinth','WindowsAndDoors','RoofAndEaves'):
        old=bpy.data.objects['SPACE08_'+identifier+'_'+suffix].data
        new=bpy.data.objects['SPACE10_'+identifier+'_'+suffix].data
        same=same and [tuple(v.co) for v in old.vertices]==[tuple(v.co) for v in new.vertices]
        same=same and [tuple(p.vertices) for p in old.polygons]==[tuple(p.vertices) for p in new.polygons]
        same=same and [p.material_index for p in old.polygons]==[p.material_index for p in new.polygons]
    frozen.append({'id':identifier,'identical_mesh_coordinates_and_faces':same})
report['legacy_eight_actual_geometry']=frozen
report['all_eight_legacy_geometry_identical']=len(frozen)==8 and all(r['identical_mesh_coordinates_and_faces'] for r in frozen)
report['one_storey_houses']=[h['id'] for h in report['houses'] if h['floors']==1]
report['hip_roof_samples']=[]
for house in report['houses']:
    if house['roof_style']=='gable':continue
    obj=bpy.data.objects['SPACE10_'+house['id']+'_RoofAndEaves']
    from build_space_10_buildings import transform_for
    spec=next(s for s in layout['buildings'] if s['id']==house['id']);point,_=transform_for(spec)
    for end in spec['hip_ends']:
        sign=-1 if end=='left' else 1
        local_x=sign*(spec['width']/2-.12)
        x,y,_=point((local_x,0,0));start=Vector((x,y,house['ridge_z']+1))
        hit=obj.ray_cast(start,Vector((0,0,-1)),distance=4)
        report['hip_roof_samples'].append({'id':house['id'],'end':end,'top':hit[1].z if hit[0] else None,
            'normal':list(hit[2]) if hit[0] else None,'ridge':house['ridge_z'],
            'slope_visible':bool(hit[0] and house['eaves_z']<hit[1].z<house['ridge_z']-.25)})
report['hip_end_slopes_are_actual_geometry']=len(report['hip_roof_samples'])==3 and all(r['slope_visible'] for r in report['hip_roof_samples'])
target=ROOT/'artifacts/scene-space-10/buildings-build-audit.json';target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({key:report[key] for key in ('building_count','object_count','triangles','original_data_transforms_materials_unchanged',
    'hidden_replacements','party_openings_suppressed','secondary_entries_present','thresholds_035','all_own_and_visible_thresholds_match','new_footprint_overlaps',
    'all_eight_legacy_geometry_identical','hip_end_slopes_are_actual_geometry','one_storey_houses')}),flush=True)
