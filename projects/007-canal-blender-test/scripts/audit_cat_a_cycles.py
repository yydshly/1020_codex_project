"""Read-only repeat-cycle diagnostic; never saves or changes the source file."""
import bpy, json
from pathlib import Path
from mathutils import Matrix
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'artifacts/cat-a/source/original/cat.blend'
OUT = ROOT/'artifacts/cat-a/rig-cycle-audit.json'
report = {}
for name in ('Walk', 'run'):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE), load_ui=False, use_scripts=False)
    rig = bpy.data.objects['Armature']
    for obj in bpy.data.objects:
        for mod in obj.modifiers:
            if mod.type == 'PARTICLE_SYSTEM': mod.show_viewport = False
    action = bpy.data.actions[name]
    rig.animation_data.use_nla = False
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]
    for b in rig.pose.bones: b.matrix_basis = Matrix.Identity(4)
    start, end = map(int, action.frame_range)
    records = []
    previous = None
    for cycle in range(8):
        cache = {}
        for f in range(start, end + 1):
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            er = rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
            cache[f] = {b.name:b.matrix.copy() for b in er.pose.bones}
        changes = {} if previous is None else {b.name:max((cache[f][b.name].translation-previous[f][b.name].translation).length for f in cache) for b in rig.pose.bones}
        seam = {b.name:(cache[start][b.name].translation-cache[end][b.name].translation).length for b in rig.pose.bones}
        records.append({'cycle':cycle, 'max_cycle_position_delta':max(changes.values()) if changes else None, 'tail_cycle_position_delta':{k:v for k,v in changes.items() if k.startswith('Tail')}, 'tail_seam_position_delta':{k:v for k,v in seam.items() if k.startswith('Tail')}})
        previous = cache
    report[name] = {'ik_solver':rig.pose.ik_solver, 'records':records}
OUT.write_text(json.dumps(report,indent=2),encoding='utf-8')
for name,data in report.items():
    print('CYCLE_RESULT',name,data['ik_solver'],[(r['cycle'],r['max_cycle_position_delta'],max(r['tail_seam_position_delta'].values())) for r in data['records']])
print('AUDIT_FILE',OUT)
