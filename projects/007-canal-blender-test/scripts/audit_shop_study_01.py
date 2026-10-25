"""Read-only source audit for the independent shop material study."""
import bpy
import hashlib
import json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'artifacts/rainy-canal-roam-02.blend'
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before=digest(SOURCE)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
def three(v):return [round(v.x,5),round(v.z,5),round(-v.y,5)]
def bounds(obj):
    pts=[three(obj.matrix_world@Vector(p)) for p in obj.bound_box]
    return {'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]}
rows=[]
for obj in bpy.data.objects:
    collections=[c.name for c in obj.users_collection]
    if '02 Bookshop' not in collections:continue
    row={'name':obj.name,'type':obj.type,'collections':collections,'position':three(obj.matrix_world.translation)}
    if obj.type=='MESH':
        row.update(bounds(obj));row['materials']=[m.name for m in obj.data.materials];row['uv_layers']=[u.name for u in obj.data.uv_layers]
    if obj.type=='LIGHT':row.update({'power':obj.data.energy,'light_type':obj.data.type,'color':list(obj.data.color),'size':getattr(obj.data,'size',None)})
    rows.append(row)
lights=[]
for obj in bpy.data.objects:
    if obj.type=='LIGHT':
        lights.append({'name':obj.name,'position':three(obj.matrix_world.translation),'power':obj.data.energy,'color':list(obj.data.color),'light_type':obj.data.type,'size':getattr(obj.data,'size',None)})
result={'source':str(SOURCE),'sha256':before,'unchanged':digest(SOURCE)==before,'objects':rows,'all_lights':lights}
(ROOT/'assets/shop-study-01-source-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'objects':len(rows),'lights':lights,'key_objects':[r for r in rows if any(s in r['name'].lower() for s in ['glass','plaster','lamp','light','floor','back wall'])]},ensure_ascii=False))
