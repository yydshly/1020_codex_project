"""Build an additive, scene-first block completion; preserve all previous files."""
import json
from pathlib import Path
import sys
import time
from datetime import datetime, timezone

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_roam_scene as exporter
import complete_space_buildings
import complete_space_ground
from audit_v5 import mesh_state, curve_state, settings
from export_viewer import digest
from extend_scene import PLAN, check_routes
from scene_utils import collection

SOURCE = ROOT / 'artifacts/rainy-canal-roam-02.blend'
DEST = ROOT / 'artifacts/rainy-canal-space-01.blend'
GLB = ROOT / 'web/models/space-01.glb'
MANIFEST = ROOT / 'web/models/space-01-manifest.json'


def snapshot():
    result = {}
    for obj in bpy.data.objects:
        result[obj.name] = {
            'transform': [list(row) for row in obj.matrix_world],
            'data': mesh_state(obj.data) if obj.type == 'MESH' else curve_state(obj.data) if obj.type == 'CURVE' else obj.data.name if obj.data else None,
            'collections': sorted(item.name for item in obj.users_collection),
            'materials': [slot.material.name if slot.material else None for slot in obj.material_slots],
            'modifiers': [settings(item) for item in obj.modifiers],
            'visibility': [obj.hide_render, obj.hide_viewport],
        }
    return result


def run():
    started = time.perf_counter()
    if any(path.exists() for path in (DEST, GLB, MANIFEST)):
        raise RuntimeError('New version already exists; refusing to overwrite a saved version.')
    source_hash = digest(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE), load_ui=False, use_scripts=False)
    before = snapshot()
    before_names = set(bpy.data.objects.keys())
    ground = complete_space_ground.build()
    buildings = complete_space_buildings.build()
    # Review cameras are additional objects, keeping original camera objects intact.
    camera_group = collection('SPACE01_ReviewCameras')
    cameras = [
        ('Overview', (-34,-39,34),(-4,-5,1.6),36),
        ('RearLane',(10.9,8,2.5),(-10,7.4,2.5),28),
        ('OppositeRow',(-16,-12.8,2.5),(1,-19,3),28),
        ('MainBridge',(9.4,-6.1,3.9),(-7,1,3),26),
        ('Reverse',(16,14,11),(-5,3,2.8),28),
    ]
    for name, position, target, lens in cameras:
        data = bpy.data.cameras.new('SPACE01_' + name)
        obj = bpy.data.objects.new('SPACE01_Camera_' + name, data)
        camera_group.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
        data.lens = lens
    bpy.context.scene.camera = bpy.data.objects['SPACE01_Camera_Overview']
    bpy.context.view_layer.update()
    after = snapshot()
    changed = [name for name in before if name not in after or before[name] != after[name]]
    if changed:
        raise RuntimeError('Original objects changed: ' + repr(changed[:12]))
    added = sorted(set(bpy.data.objects.keys())-before_names)
    if not all(name.startswith('SPACE01_') for name in added):
        raise RuntimeError('Unexpected object prefix.')
    routes = check_routes()
    water = exporter.verify_background_water()
    if not all(item['sampled_checks_passed'] for item in routes['routes'].values()) or not water['passed']:
        raise RuntimeError('Route or background water verification failed: '+json.dumps({'routes':routes,'water':water}))
    bpy.ops.wm.save_as_mainfile(filepath=str(DEST), check_existing=True)
    blend_hash = digest(DEST)
    bpy.ops.wm.open_mainfile(filepath=str(DEST), load_ui=False, use_scripts=False)
    exporter.DESTINATION = GLB
    exported = exporter.export_compact_scene()
    if digest(SOURCE) != source_hash or digest(DEST) != blend_hash:
        raise RuntimeError('Saved source or candidate bytes changed during export.')
    report = {
        'created_utc': datetime.now(timezone.utc).isoformat(), 'asset': GLB.name,
        'sha256': digest(GLB), 'bytes': GLB.stat().st_size,
        'source': {'file': SOURCE.name, 'sha256': source_hash, 'unchanged': True, 'object_count': len(before_names)},
        'integrated_blend': {'file': DEST.name, 'sha256': blend_hash, 'object_count': len(before_names)+len(added)},
        'original_objects_unchanged': not changed, 'added_objects': added,
        'additions': {'ground': ground, 'buildings': buildings},
        'sampled_route_checks': routes, 'background_water_checks': water,
        'walk_routes_blender_xy': PLAN['routes'], **exported,
        'scope': 'Finite exterior spatial completion: courtyards, facade closure, bridgeheads and perimeter transitions.',
        'limitations': ['Closed building interiors.', 'Far buildings remain simple exterior masses.', 'Only existing navigation routes verified; orbit camera is an inspection camera.', 'No Cycles match or photorealistic finish claimed.'],
        'elapsed_seconds': round(time.perf_counter()-started,2), 'published': False,
    }
    MANIFEST.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('SPACE01_RESULT',json.dumps({k:report[k] for k in ('asset','bytes','geometry','original_objects_unchanged','elapsed_seconds')},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    run()
