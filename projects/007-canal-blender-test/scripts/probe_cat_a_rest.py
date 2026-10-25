import bpy,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/'artifacts/cat-a/source/original/cat.blend'),load_ui=False,use_scripts=False)
rig=bpy.data.objects['Armature']; rig.data.pose_position='REST'
bpy.context.view_layer.update()
ob=bpy.data.objects['Cat']; ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
r={'bounds':[list(v) for v in ev.bound_box],'systems':[]}
for ps in ev.particle_systems:
    n=len(ps.particles); end=2**ps.settings.display_step
    r['systems'].append({'name':ps.name,'parents':n,'children':len(ps.child_particles),'samples':[
        {'i':i,'path':[list(ps.co_hair(ob,particle_no=i,step=s)) for s in [0,end//4,end//2,end]]}
        for i in [0,n-1,n,n+1,n+100] if i<n+len(ps.child_particles)]})
(root/'artifacts/cat-a/source/rest-hair-probe.json').write_text(json.dumps(r,indent=2))
print(json.dumps(r))
