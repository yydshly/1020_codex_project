import bpy, json, sys
from pathlib import Path
source, dest = map(Path, sys.argv[sys.argv.index('--')+1:][:2])
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
scene=bpy.context.scene
scene.frame_set(1)
report={'objects':[],'bones':[],'particles':[]}
for o in bpy.data.objects:
    d={'name':o.name,'type':o.type,'location':list(o.location),'rotation':list(o.rotation_euler),'scale':list(o.scale),'parent':o.parent.name if o.parent else None,'parent_type':o.parent_type,'parent_bone':o.parent_bone,'hidden':o.hide_viewport,'hide_render':o.hide_render,'matrix_world':[list(r) for r in o.matrix_world]}
    if o.type=='MESH':
        d.update(uv=[u.name for u in o.data.uv_layers], material_counts={str(i):sum(p.material_index==i for p in o.data.polygons) for i in range(len(o.data.materials))}, shape_keys=[k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else [], modifiers=[{'name':m.name,'type':m.type,'levels':getattr(m,'levels',None),'show_viewport':m.show_viewport,'show_render':m.show_render} for m in o.modifiers])
    report['objects'].append(d)
    for ps in o.particle_systems:
        s=ps.settings
        report['particles'].append({'object':o.name,'name':ps.name,'settings':s.name,'type':s.type,'count':s.count,'children':s.child_percent,'rendered_children':s.rendered_child_count,'hair_length':s.hair_length,'hair_step':s.hair_step,'material':s.material,'vertex_group_density':ps.vertex_group_density,'vertex_group_length':ps.vertex_group_length,'particles':len(ps.particles),'keys_first':[list(k.co) for k in ps.particles[0].hair_keys] if len(ps.particles) else []})
    if o.type=='ARMATURE':
        for b in o.pose.bones:
            report['bones'].append({'name':b.name,'parent':b.parent.name if b.parent else None,'head':list(b.head),'tail':list(b.tail),'deform':b.bone.use_deform,'constraints':[{'name':c.name,'type':c.type,'target':getattr(getattr(c,'target',None),'name',None),'subtarget':getattr(c,'subtarget',None),'influence':c.influence} for c in b.constraints]})
dest.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='bones'}))
