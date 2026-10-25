"""Save the facial trial as a separate editable Blender scene; no rendering."""
from pathlib import Path
import hashlib
import json
import bpy

root = Path(__file__).resolve().parents[1]
source = root/'web/models/cat-v5-face.glb'
before = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH' and obj.data.shape_keys]
assert len(meshes) == 1, [(obj.name, obj.type) for obj in bpy.data.objects]
keys = meshes[0].data.shape_keys
assert keys and all(name in keys.key_blocks for name in ['Blink_Left', 'Blink_Right'])
for key in keys.key_blocks:
    key.value = 0
bpy.context.view_layer.objects.active = meshes[0]
meshes[0].select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'artifacts/cat-v5-face.blend'))
assert hashlib.sha256(source.read_bytes()).hexdigest() == before
print(json.dumps({'asset': 'cat-v5-face.blend', 'shape_keys': list(keys.key_blocks.keys()), 'source_unchanged': True}))
