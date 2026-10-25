"""Read-only source components and passage-clearance diagnostics."""
import json
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'artifacts/rainy-canal-space-03.blend'),use_scripts=False)
bpy.context.view_layer.update()
rows=[]
for name in ('SPACE01_Opposite row courtyard boundaries','SPACE01_Backland garden compartments','EXT_Opposite rear boundary'):
    obj=bpy.data.objects[name]
    if name=='EXT_Opposite rear boundary':
        components=[list(range(len(obj.data.vertices)))];faces=[list(range(len(obj.data.polygons)))]
    else:
        components=[list(range(i,i+8)) for i in range(0,len(obj.data.vertices),8)]
        faces=[list(range(i,i+6)) for i in range(0,len(obj.data.polygons),6)]
    for index,(vertices,polygons) in enumerate(zip(components,faces)):
        pts=[obj.matrix_world@obj.data.vertices[i].co for i in vertices]
        bounds={'min':[min(p[a] for p in pts) for a in range(3)],'max':[max(p[a] for p in pts) for a in range(3)]}
        if name=='SPACE01_Backland garden compartments' and bounds['min'][1]>0:continue
        rows.append({'object':name,'component':index,'vertices':vertices,'polygons':polygons,
                     'material':obj.data.materials[obj.data.polygons[polygons[0]].material_index].name,'bounds':bounds})
graph=bpy.context.evaluated_depsgraph_get()
ray_rows=[]
for y in (-15.8,-16.48,-17.2,-18.85,-20.6,-21.5,-22.35,-22.6,-24,-25.6):
    for z in (1.0,1.25,1.65,2.2,2.65):
        points=[]
        for side in (-1,1):
            hit,p,n,f,obj,mat=bpy.context.scene.ray_cast(graph,Vector((-7.05,y,z)),Vector((side,0,0)),distance=2)
            points.append({'side':side,'hit':bool(hit),'x':p.x if hit else None,'object':obj.name if hit else None})
        ray_rows.append({'y':y,'z':z,'sides':points})
out=ROOT/'artifacts/scene-space-05'
out.mkdir(exist_ok=True)
(out/'source-courtyard-components.json').write_text(json.dumps({'components':rows,'lateral_rays':ray_rows},indent=2),encoding='utf-8')
print(json.dumps({'components':[row for row in rows if row['bounds']['min'][0]<-5 and row['bounds']['max'][0]>-13], 'passage_lateral_rays':[row for row in ray_rows if -21.4<row['y']<-16.6]},indent=2))
