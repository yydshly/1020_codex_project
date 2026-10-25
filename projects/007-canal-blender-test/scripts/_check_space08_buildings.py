import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'));sys.dont_write_bytecode=True
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'artifacts/rainy-canal-space-06.blend'),load_ui=False,use_scripts=False)
bpy.context.view_layer.update()
before={obj.name:(obj.data.as_pointer() if obj.data else 0,tuple(obj.location),tuple(obj.rotation_euler),
                  tuple(obj.scale),tuple(m.name for m in obj.data.materials) if obj.type=='MESH' else ())
        for obj in bpy.data.objects}
from build_space_08_buildings import build
layout=json.loads((ROOT/'assets/space-08-layout.json').read_text(encoding='utf-8-sig'))
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
    obj=bpy.data.objects['SPACE08_'+house['id']+'_WindowsAndDoors']
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
target=ROOT/'artifacts/scene-space-08/buildings-build-audit.json';target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({key:report[key] for key in ('building_count','object_count','triangles','original_data_transforms_materials_unchanged',
    'hidden_replacements','party_openings_suppressed','secondary_entries_present','thresholds_035','all_own_and_visible_thresholds_match','new_footprint_overlaps')}),flush=True)
