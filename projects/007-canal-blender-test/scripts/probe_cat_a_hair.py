import bpy,json,sys
from pathlib import Path
src=Path(sys.argv[sys.argv.index('--')+1])
bpy.ops.wm.open_mainfile(filepath=str(src),load_ui=False,use_scripts=False)
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
ob=bpy.data.objects['Cat']; ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
r={'cat_mesh':len(ev.data.vertices),'bound':[list(v) for v in ev.bound_box],'systems':[]}
for ps in ev.particle_systems:
    d={'name':ps.name,'particles':len(ps.particles),'child_particles':len(ps.child_particles),'display_step':ps.settings.display_step,'render_step':ps.settings.render_step,'samples':[]}
    for i in range(min(3,len(ps.particles))):
        p=ps.particles[i]
        s={'location':list(p.location),'keys':[list(k.co) for k in p.hair_keys[:5]]}
        try:s['co_hair']=[list(ps.co_hair(ob,particle_no=i,step=j)) for j in [0,1,4,8,16,32,64,128,256,512,1024]]
        except Exception as e:s['err']=str(e)
        d['samples'].append(s)
    r['systems'].append(d)
(src.parent.parent/'hair-probe.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
print(json.dumps(r))
