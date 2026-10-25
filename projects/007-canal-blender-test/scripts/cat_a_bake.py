"""Bake the original Skater Cat rig into deterministic glTF-friendly actions.

Call only on a working scene; the source .blend is never saved by this module.
No gait or loop-end correction is authored.  Legacy IK is evaluated in its
original form for three forward cycles; the last original pose is cached.
All 85 bones are retained, including the controllers and the eye rig.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Matrix


def _snapshot(armature):
    bpy.context.view_layer.update()
    evaluated = armature.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return {bone.name: bone.matrix.copy() for bone in evaluated.pose.bones}


def _quat_distance(a, b):
    qa, qb = a.to_quaternion().normalized(), b.to_quaternion().normalized()
    return math.degrees(2 * math.acos(min(1., abs(qa.dot(qb)))))


def _set_action(armature, action):
    armature.animation_data.action = action
    if action.slots:
        armature.animation_data.action_slot = action.slots[0]


def bake_original_actions(armature, report_path=None, warmup_cycles=3):
    """Return {'actions': [Walk, Run], 'report': dict, 'source_cache': dict}.

    This changes the passed working armature: original NLA is unlinked and pose
    constraints/drivers are removed AFTER both motions have been sampled. The
    original Actions remain in memory as SOURCE_Walk / SOURCE_run with fake users.
    Caller should export only returned baked Actions (active/NLA track actions),
    and use export_anim_single_armature=False to exclude unlinked source actions.
    No modifier, material, mesh, bone count, rest pose, source file or fps is
    changed. Bone connected flags are disabled (parents/rest matrices preserved)
    so cached legacy IK offsets can be represented as explicit translations.
    The report explicitly records the original legacy tail loop discontinuity.
    """
    if warmup_cycles < 3:
        raise ValueError('At least 3 fixed forward cycles are required for this legacy rig.')
    if armature.type != 'ARMATURE':
        raise TypeError('Expected original Armature object')
    scene = bpy.context.scene
    fps = scene.render.fps / scene.render.fps_base
    sources = [('Walk', bpy.data.actions.get('Walk')), ('Run', bpy.data.actions.get('run'))]
    if any(action is None for _, action in sources):
        raise ValueError('Original Walk and run Actions must exist before baking')
    armature.animation_data_create()
    armature.animation_data.use_nla = False
    original_frame = scene.frame_current
    cache = {}
    report = {'fps':fps, 'warmup_cycles':warmup_cycles, 'bone_count':len(armature.pose.bones),
              'ik_solver':armature.pose.ik_solver, 'source_constraints':sum(len(b.constraints) for b in armature.pose.bones),
              'source_nla':[{'name':t.name, 'mute':t.mute, 'strips':[{'name':s.name,'action':s.action.name if s.action else None} for s in t.strips]} for t in armature.animation_data.nla_tracks],
              'actions':{}, 'limitations':['Original legacy tail IK has a nonzero endpoint seam; no new endpoint motion or loop correction was authored.']}

    # Do not mute/remove any original constraints before this cache is complete.
    for exported_name, original_action in sources:
        _set_action(armature, original_action)
        for bone in armature.pose.bones:
            bone.matrix_basis = Matrix.Identity(4)
        start, end = map(int, original_action.frame_range)
        previous = None
        per_cycle = []
        per_cycle_matrix = []
        for cycle in range(warmup_cycles):
            frames = {}
            for frame in range(start, end + 1):
                scene.frame_set(frame)
                frames[frame] = _snapshot(armature)
            delta = None if previous is None else max(
                (frames[f][b].translation - previous[f][b].translation).length
                for f in frames for b in frames[f])
            matrix_delta = None if previous is None else max(
                abs(frames[f][b][r][c] - previous[f][b][r][c])
                for f in frames for b in frames[f] for r in range(4) for c in range(4))
            per_cycle.append(delta)
            per_cycle_matrix.append(matrix_delta)
            previous = frames
        cache[exported_name] = frames
        seam = {bone.name:{'position':(frames[end][bone.name].translation-frames[start][bone.name].translation).length,
                                'rotation_degrees':_quat_distance(frames[start][bone.name],frames[end][bone.name])}
                for bone in armature.pose.bones}
        report['actions'][exported_name] = {'source_action':original_action.name, 'frame_start':start,'frame_end':end,
                     'sample_count':end-start+1,'duration_seconds':(end-start)/fps,
                     'cycle_max_position_deltas':per_cycle,'cycle_max_matrix_deltas':per_cycle_matrix,
                     'tail_endpoint_seam':{k:v for k,v in seam.items() if k.startswith('Tail')},
                     'original_object_matrix':[[float(x) for x in row] for row in armature.matrix_world]}
        if per_cycle_matrix[-1] is not None and per_cycle_matrix[-1] > 1e-5:
            report['limitations'].append(exported_name+' last two warmup cycles differ; the final fixed-order sample is baked as-is.')

    # Cached evaluated matrices now contain original constraints and IK results.
    armature.animation_data.action = None
    for track in list(armature.animation_data.nla_tracks):
        armature.animation_data.nla_tracks.remove(track)
    for curve in list(armature.animation_data.drivers):
        armature.animation_data.drivers.remove(curve)
    for bone in armature.pose.bones:
        for constraint in list(bone.constraints):
            bone.constraints.remove(constraint)
        bone.rotation_mode = 'QUATERNION'
        bone.matrix_basis = Matrix.Identity(4)
    # The legacy cyclic tail evaluates with child heads offset from parent tips.
    # Blender's connected-bone flag would silently discard those translations.
    # glTF has no connected flag: retain all parents and rest matrices, only
    # unlock explicit child translation in this export-only working skeleton.
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    report['disconnected_for_bake'] = []
    for bone in armature.data.edit_bones:
        if bone.use_connect:
            report['disconnected_for_bake'].append(bone.name)
            bone.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for _, original_action in sources:
        original_action.name = 'SOURCE_' + original_action.name
        original_action.use_fake_user = True
    bpy.context.view_layer.update()

    baked_actions = []
    for exported_name, _ in sources:
        frames = cache[exported_name]
        action = bpy.data.actions.new(exported_name)
        action.use_fake_user = True
        _set_action(armature, action)
        previous_quats = {}
        for frame, poses in frames.items():
            # Bone.convert_local_to_pose handles inherit_scale/local_location.
            # Supplying cached parent matrices avoids order-sensitive solving.
            for bone in armature.pose.bones:
                kwargs = {'parent_matrix':poses[bone.parent.name],
                          'parent_matrix_local':bone.parent.bone.matrix_local} if bone.parent else {}
                basis = bone.bone.convert_local_to_pose(poses[bone.name], bone.bone.matrix_local,
                                                       invert=True, **kwargs)
                location, rotation, scale = basis.decompose()
                if bone.name in previous_quats and rotation.dot(previous_quats[bone.name]) < 0:
                    rotation.negate()
                previous_quats[bone.name] = rotation.copy()
                bone.location = location
                bone.rotation_quaternion = rotation
                bone.scale = scale
                for channel in ('location', 'rotation_quaternion', 'scale'):
                    bone.keyframe_insert(data_path=channel, frame=frame, group=bone.name)
        for curve in action.fcurves:
            for key in curve.keyframe_points:
                key.interpolation = 'LINEAR'
        baked_actions.append(action)
        # Compare the no-constraints rig with the exact evaluated source cache.
        max_pos, max_matrix, max_angle = 0., 0., 0.
        worst_bone = None
        bone_errors = {b.name:0. for b in armature.pose.bones}
        for frame, source in frames.items():
            scene.frame_set(frame)
            current = _snapshot(armature)
            for name, matrix in current.items():
                pos_error = (matrix.translation-source[name].translation).length
                matrix_error = max(abs(matrix[r][c]-source[name][r][c]) for r in range(4) for c in range(4))
                max_pos = max(max_pos, pos_error)
                max_angle = max(max_angle, _quat_distance(matrix,source[name]))
                bone_errors[name] = max(bone_errors[name], matrix_error)
                if matrix_error > max_matrix:
                    max_matrix, worst_bone = matrix_error, name
        report['actions'][exported_name]['bake_verification'] = {'max_head_position_error':max_pos,
                'max_matrix_element_error':max_matrix,'max_rotation_error_degrees':max_angle,
                'worst_bone':worst_bone, 'bone_matrix_errors':bone_errors,
                'pose_matches_source_at_integer_frames':max_matrix < 1e-3,
                'matrix_element_tolerance':1e-3}
        if max_matrix >= 1e-3:
            report['limitations'].append(exported_name+' cannot be represented exactly by bone TRS; see verification errors.')

    # Two explicitly named tracks make normal ACTIONS / NLA export unambiguous.
    armature.animation_data.action = None
    for action in baked_actions:
        track = armature.animation_data.nla_tracks.new()
        track.name = action.name
        track.mute = True
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.name = action.name
    _set_action(armature, baked_actions[0])
    armature.animation_data.use_nla = False
    scene.frame_set(original_frame)
    if report_path:
        target = Path(report_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report,indent=2),encoding='utf-8')
    return {'actions':baked_actions,'report':report,'source_cache':cache}


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    bpy.ops.wm.open_mainfile(filepath=str(root/'artifacts/cat-a/source/original/cat.blend'),load_ui=False,use_scripts=False)
    for obj in bpy.data.objects:
        for modifier in obj.modifiers:
            if modifier.type == 'PARTICLE_SYSTEM': modifier.show_viewport = False
    result = bake_original_actions(bpy.data.objects['Armature'],root/'artifacts/cat-a/bake-verification.json')
    for name, item in result['report']['actions'].items():
        verify = item['bake_verification']
        print('BAKE_RESULT',name,item['duration_seconds'],verify['max_matrix_element_error'],verify['worst_bone'],item['cycle_max_position_deltas'])
    print('BAKE_LIMITATIONS',result['report']['limitations'])
