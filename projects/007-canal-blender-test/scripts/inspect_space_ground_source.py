"""Read-only ground bounds audit for the additive street-space study."""
import json
from pathlib import Path
import sys
import bpy
from mathutils import Vector

PROJECT = Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(PROJECT / 'artifacts/rainy-canal-roam-02.blend'), use_scripts=False)
bpy.context.view_layer.update()
rows = []
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    if not any(key in obj.name.lower() for key in ('ext_b02', 'quay', 'retaining', 'bridge', 'lane', 'boundary', 'infill', 'support', 'apron')):
        continue
    vertices = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
    rows.append({'name': obj.name, 'min': [min(p[i] for p in vertices) for i in range(3)], 'max': [max(p[i] for p in vertices) for i in range(3)], 'materials': [m.name for m in obj.data.materials]})
out = PROJECT / 'artifacts/scene-space-01'
out.mkdir(exist_ok=True)
(out / 'ground-source-bounds.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
for row in rows:
    if any(key in row['name'] for key in ('EXT_B02', 'foundation', 'mortar', 'slab', 'landing', 'boundary', 'coping', 'arch', 'surface')):
        print(row)
