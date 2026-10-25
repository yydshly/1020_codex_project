"""Read-only audit of the Skater Cat legacy rig; never saves the source blend."""
import bpy, json, math, re, sys
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'artifacts/cat-a/source/original/cat.blend'
OUT = ROOT/'artifacts/cat-a/rig-audit.json'

def open_source():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE), load_ui=False, use_scripts=False)
    for obj in bpy.data.objects:
        for mod in obj.modifiers:
            if mod.type == 'PARTICLE_SYSTEM':
                mod.show_viewport = False
    return bpy.data.objects['Armature']

def constraint_info(c):
    d = {'name':c.name,'type':c.type,'mute':c.mute,'influence':c.influence}
    for key in ('subtarget','owner_space','target_space','chain_count','use_tail','use_stretch','use_x','use_y','use_z','invert_x','invert_y','invert_z','mix_mode','pole_subtarget','pole_angle','head_tail','use_offset'):
        if hasattr(c,key): d[key] = getattr(c,key)
    for key in ('target','pole_target'):
        if hasattr(c,key): d[key] = getattr(c,key).name if getattr(c,key) else None
    return d

rig = open_source()
report = {
    'source':str(SOURCE), 'fps':bpy.context.scene.render.fps, 'fps_base':bpy.context.scene.render.fps_base,
    'object_transform':{'location':list(rig.location),'rotation':list(rig.rotation_euler),'scale':list(rig.scale)},
    'nla': [{'name':t.name,'mute':t.mute,'solo':t.is_solo,'strips':[{'name':s.name,'action':s.action.name if s.action else None,'frame':[s.frame_start,s.frame_end],'action_frame':[s.action_frame_start,s.action_frame_end],'scale':s.scale,'repeat':s.repeat,'blend_type':s.blend_type,'influence':s.influence} for s in t.strips]} for t in rig.animation_data.nla_tracks],
    'bones': [{'name':b.name,'parent':b.parent.name if b.parent else None,'deform':b.bone.use_deform,'head_rest':list(b.bone.head_local),'tail_rest':list(b.bone.tail_local),'constraints':[constraint_info(c) for c in b.constraints]} for b in rig.pose.bones],
    'actions': {}, 'cases': {},
}
for name in ('Walk','run'):
    a=bpy.data.actions[name]
    report['actions'][name]={'range':list(a.frame_range),'slots':[s.identifier for s in a.slots], 'fcurves':[{'path':f.data_path,'index':f.array_index,'keys':[[k.co[0],k.co[1]] for k in f.keyframe_points],'modifiers':[m.type for m in f.modifiers]} for f in a.fcurves]}

def span(qs):
    ref=qs[0]
    return max(2*math.acos(min(1,abs(ref.dot(q))))*180/math.pi for q in qs)

def sample_case(case, mute_problem=False):
    rig=open_source()
    if mute_problem:
        for b in rig.pose.bones:
            for c in b.constraints:
                if (b.name=='Tail' and c.type=='COPY_ROTATION') or (b.name=='Spine Pivot' and c.type=='COPY_ROTATION'):
                    c.mute=True
    result={}
    for name in ('Walk','run'):
        a=bpy.data.actions[name]
        rig.animation_data.use_nla=False
        rig.animation_data.action=a
        if a.slots: rig.animation_data.action_slot=a.slots[0]
        for b in rig.pose.bones: b.matrix_basis=Matrix.Identity(4)
        start,end=map(int,a.frame_range)
        frame_order=list(range(start,end+1))
        samples={b.name:[] for b in rig.pose.bones}
        root=[]
        for f in frame_order:
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            er=rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
            root.append(list(er.matrix_world.translation))
            for b in er.pose.bones:
                world=er.matrix_world@b.matrix
                local=(b.parent.matrix.inverted_safe()@b.matrix) if b.parent else b.matrix
                samples[b.name].append({'head':list(world.translation),'tail':list(er.matrix_world@b.tail),'rot':list(world.to_quaternion()),'local_rot':list(local.to_quaternion())})
        from mathutils import Quaternion
        stats={}
        for b,arr in samples.items():
            pos=[Vector(s['head']) for s in arr]
            first,last=pos[0],pos[-1]
            stats[b]={'head_range':[max(p[i] for p in pos)-min(p[i] for p in pos) for i in range(3)],'rotation_span_deg':span([Quaternion(s['rot']) for s in arr]),'local_rotation_span_deg':span([Quaternion(s['local_rot']) for s in arr]),'seam_position_delta':(last-first).length,'seam_rotation_deg':2*math.acos(min(1,abs(Quaternion(arr[0]['rot']).dot(Quaternion(arr[-1]['rot'])))))*180/math.pi, 'frames':{str(frame_order[i]):arr[i] for i in sorted(set([0,(end-start)//4,(end-start)//2,3*(end-start)//4,end-start]))}}
        # Re-evaluate reverse and repeat forward to reveal history dependent cycle results.
        determinism={b:0.0 for b in samples}
        for f in reversed(frame_order):
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            er=rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
            for b in er.pose.bones:
                current=(er.matrix_world@b.matrix).translation
                old=Vector(samples[b.name][f-start]['head'])
                determinism[b.name]=max(determinism[b.name],(current-old).length)
        result[name]={'frames':[start,end],'duration_seconds':(end-start)/bpy.context.scene.render.fps,'object_positions':root,'bone_stats':stats,'reverse_order_max_position_difference':determinism}
    return result

report['cases']['original']=sample_case('original')
report['cases']['mute_cyclic_copy_rotations']=sample_case('mute_cyclic_copy_rotations',True)
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(report,indent=2),encoding='utf-8')
print('AUDIT_FILE',OUT)
print('BONES',[(b['name'],b['parent'],b['constraints']) for b in report['bones'] if b['constraints']])
for case,data in report['cases'].items():
    for name,a in data.items():
        print('SUMMARY',case,name,a['frames'],a['duration_seconds'])
        for b,s in a['bone_stats'].items():
            if any(t in b.lower() for t in ['head','neck','tail','spine','root','pivot']):
                print(b,'range',s['head_range'],'local_deg',round(s['local_rotation_span_deg'],4),'world_deg',round(s['rotation_span_deg'],4),'seam',round(s['seam_position_delta'],5),'history',a['reverse_order_max_position_difference'][b])
