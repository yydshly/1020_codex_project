import bpy, json, sys
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:]
source, output = map(Path, args[:2])
bpy.ops.wm.read_factory_settings(use_empty=True)
if source.suffix.lower() == '.fbx':
    bpy.ops.import_scene.fbx(filepath=str(source))
else:
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
report = {
    'source': str(source), 'fps': bpy.context.scene.render.fps,
    'range': [bpy.context.scene.frame_start, bpy.context.scene.frame_end],
    'objects': [{'name': o.name, 'type': o.type, 'vertices': len(o.data.vertices) if o.type=='MESH' else None,
                 'dimensions': list(o.dimensions), 'bones': len(o.data.bones) if o.type=='ARMATURE' else None,
                 'modifiers': [{'type':m.type, 'name':m.name} for m in o.modifiers],
                 'materials':[m.name for m in o.data.materials if m] if o.type=='MESH' else [],
                 'nla': [{'name':t.name,'strips':[{'name':s.name,'action':s.action.name if s.action else None,'range':[s.frame_start,s.frame_end]} for s in t.strips]} for t in o.animation_data.nla_tracks] if o.animation_data else [],
                 'action':o.animation_data.action.name if o.animation_data and o.animation_data.action else None} for o in bpy.data.objects],
    'actions':[{'name':a.name,'range':list(a.frame_range)} for a in bpy.data.actions],
    'images':[{'name':i.name,'path':i.filepath,'size':list(i.size),'packed':bool(i.packed_file)} for i in bpy.data.images],
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2),encoding='utf-8')
print(json.dumps(report))
