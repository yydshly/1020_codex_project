import hashlib
import json
import math
from pathlib import Path
import time

import bpy

PROJECT_DIR = Path(__file__).resolve().parent.parent


def run():
    start = time.perf_counter()
    bpy.ops.wm.open_mainfile(filepath=str(PROJECT_DIR / 'artifacts' / 'rainy-canal.blend'))
    scene = bpy.context.scene
    invalid_objects = []
    for obj in scene.objects:
        if not all(math.isfinite(component) for row in obj.matrix_world for component in row):
            invalid_objects.append(obj.name)
        if obj.type == 'MESH' and not all(math.isfinite(component) for vertex in obj.data.vertices for component in vertex.co):
            invalid_objects.append(obj.name)
    checks = {
        'reopened_saved_blend': True,
        'finite_geometry': not invalid_objects,
        'invalid_objects': invalid_objects,
        'object_count': len(scene.objects),
        'collections': {group.name: len(group.objects) for group in bpy.data.collections if len(group.objects)},
        'cameras': [obj.name for obj in scene.objects if obj.type == 'CAMERA'],
        'saved_active_camera': scene.camera.name,
        'saved_render_resolution': [scene.render.resolution_x, scene.render.resolution_y],
        'external_image_dependencies': [image.filepath for image in bpy.data.images if image.source == 'FILE'],
        'reference_used_as_texture': scene.get('reference_used_as_texture'),
        'reference_sha256': scene.get('reference_sha256'),
        'reference_hash_matches': scene.get('reference_sha256') == hashlib.sha256((PROJECT_DIR / 'assets' / 'reference.png').read_bytes()).hexdigest(),
        'scope': 'Basic artifact and geometry checks, not a similarity score or production topology certification.',
    }
    preferences = bpy.context.preferences.addons['cycles'].preferences
    try:
        preferences.compute_device_type = 'OPTIX'
        preferences.get_devices()
        for device in preferences.devices:
            device.use = device.type == 'OPTIX'
        scene.cycles.device = 'GPU' if any(device.use for device in preferences.devices) else 'CPU'
    except Exception:
        scene.cycles.device = 'CPU'
    scene.camera = bpy.data.objects['Independent side overview']
    scene.camera.data.lens = 32
    scene.cycles.samples = 40
    scene.cycles.adaptive_threshold = .05
    scene.render.resolution_x = 1104
    scene.render.resolution_y = 622
    scene.render.filepath = str(PROJECT_DIR / 'assets' / 'overview.png')
    bpy.ops.render.render(write_still=True)
    checks['reopen_check_and_render_seconds'] = round(time.perf_counter() - start, 2)
    (PROJECT_DIR / 'assets' / 'scene-checks.json').write_text(json.dumps(checks, indent=2), encoding='utf-8')
    print('CHECKS', json.dumps(checks))
    if invalid_objects:
        raise RuntimeError('Non-finite geometry found')
    if not checks['reference_hash_matches']:
        raise RuntimeError('Reference image hash mismatch')


if __name__ == '__main__':
    run()
