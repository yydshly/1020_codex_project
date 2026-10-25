import bpy,sys,json
from pathlib import Path
from mathutils import Vector
root=Path(r'F:\codex_project\1020_codex_project\projects\007-canal-blender-test');sys.path.insert(0,str(root/'scripts'))
bpy.ops.wm.open_mainfile(filepath=str(root/'artifacts/rainy-canal-space-02.blend'),load_ui=False,use_scripts=False)
bpy.context.view_layer.update()
before={o.name:(o.data.as_pointer() if o.data else 0,tuple(v for row in o.matrix_world for v in row),tuple(s.material.name if s.material else None for s in o.material_slots)) for o in bpy.data.objects}
from refine_space_03_plinths import build,TARGETS
report=build();checks=[]
for house in report['houses']:
 obj=bpy.data.objects[house['object']];inverse=obj.matrix_world.inverted()
 for notch in house['notches']:
  x1,y1,x2,y2=notch['xy'];world_origin=Vector(((x1+x2)/2,(y1+y2)/2,1.5));hit,pos,norm,face=obj.ray_cast(inverse@world_origin,Vector((0,0,-1)));world=obj.matrix_world@pos
  checks.append({'object':obj.name,'side':notch['side'],'hit':hit,'height':round(world.z,6),'passed':hit and abs(world.z-.925)<1e-5})
 for x,y in [(house['unchanged_bounds']['min'][0]+.2,house['unchanged_bounds']['max'][1]-.2),(house['unchanged_bounds']['max'][0]-.2,house['unchanged_bounds']['min'][1]+.2)]:
  hit,pos,normal,face=obj.ray_cast(inverse@Vector((x,y,1.5)),Vector((0,0,-1)));world=obj.matrix_world@pos;checks.append({'outside_notch':True,'height':round(world.z,6),'passed':hit and abs(world.z-1.17)<1e-5})
 for notch in house['notches']:
  x1,y1,x2,y2=notch['xy'];hit,pos,norm,face=obj.ray_cast(inverse@Vector(((x1+x2)/2,(y1+y2)/2,.5)),Vector((0,0,1)));world=obj.matrix_world@pos;checks.append({'base_continuity':True,'height':round(world.z,6),'passed':hit and abs(world.z-.85)<1e-5})
report['surface_checks']=checks
report['all_surface_checks_passed']=all(v['passed'] for v in checks)
report['unchanged_objects_materials_transforms']=set(before)==set(bpy.data.objects.keys()) and all((o.data.as_pointer()==state[0] or name in TARGETS) and tuple(v for row in o.matrix_world for v in row)==state[1] and tuple(s.material.name if s.material else None for s in o.material_slots)==state[2] for name,state in before.items() for o in [bpy.data.objects[name]])
(root/'artifacts/space-03-plinths-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({key:report[key] for key in ('objects_changed','objects_added','materials_added','total_triangles','net_triangle_increase','all_surface_checks_passed','unchanged_objects_materials_transforms')}),flush=True)
