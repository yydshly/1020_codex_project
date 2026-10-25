import bpy,sys,json,time
from pathlib import Path
root=Path(r'F:\codex_project\1020_codex_project\projects\007-canal-blender-test');sys.path.insert(0,str(root/'scripts'))
bpy.ops.wm.open_mainfile(filepath=str(root/'artifacts/rainy-canal-space-05.blend'),load_ui=False,use_scripts=False)
bpy.context.view_layer.update()
before={o.name:(o.data.as_pointer() if o.data else 0,tuple(o.location),tuple(o.rotation_euler),tuple(o.scale),tuple(c.name for c in o.users_collection),o.hide_render,o.hide_viewport) for o in bpy.data.objects}
from build_space_06_buildings import build
report=build();bpy.context.view_layer.update()
report['original_objects_unchanged']=all(name in bpy.data.objects and state==(o.data.as_pointer() if o.data else 0,tuple(o.location),tuple(o.rotation_euler),tuple(o.scale),tuple(c.name for c in o.users_collection),o.hide_render,o.hide_viewport) for name,state in before.items() for o in [bpy.data.objects[name]])
from extend_scene import check_routes
report['old_route_checks']={name:{'passed':r['sampled_checks_passed'],'sample_count':r['sample_count']} for name,r in check_routes()['routes'].items()}
(root/'artifacts/space-06-buildings-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({key:report[key] for key in ('building_count','object_count','triangles','original_objects_unchanged','old_route_checks','new_materials')}),flush=True)
