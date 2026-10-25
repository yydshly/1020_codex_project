import bpy, sys, json
from pathlib import Path
root=Path(r'F:\codex_project\1020_codex_project\projects\007-canal-blender-test')
sys.path.insert(0,str(root/'scripts'))
bpy.ops.wm.open_mainfile(filepath=str(root/'artifacts/rainy-canal-roam-02.blend'))
bpy.context.view_layer.update()
before={o.name:(o.data.as_pointer() if o.data else 0,tuple(v for row in o.matrix_world for v in row),tuple(c.name for c in o.users_collection)) for o in bpy.data.objects}
from complete_space_buildings import build
report=build()
bpy.context.view_layer.update()
report['original_objects_unchanged']=all(n in bpy.data.objects and state==(bpy.data.objects[n].data.as_pointer() if bpy.data.objects[n].data else 0,tuple(v for row in bpy.data.objects[n].matrix_world for v in row),tuple(c.name for c in bpy.data.objects[n].users_collection)) for n,state in before.items())
from extend_scene import check_routes
routes=check_routes()
report['route_results']={n:{'pass':r['sampled_checks_passed'],'samples':r['sample_count'],'obstructions':r['body_ray_obstructions'][:4],'unsupported':r['unsupported_samples'][:4]} for n,r in routes['routes'].items()}
(root/'assets/space-01-buildings-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
