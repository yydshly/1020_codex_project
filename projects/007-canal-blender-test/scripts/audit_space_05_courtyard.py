"""Build and check SPACE05 in memory, preserving the source .blend bytes."""
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import build_space_05_courtyard as court
from extend_scene import check_routes

SOURCE=ROOT/'artifacts/rainy-canal-space-03.blend'
source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE),use_scripts=False)
bpy.context.view_layer.update()
before=check_routes()
build=court.build()
after=check_routes()
graph=bpy.context.evaluated_depsgraph_get()
samples=[]
for a,b in zip(court.ROUTE[:-1],court.ROUTE[1:]):
    length=math.dist(a,b);n=math.ceil(length/.10)
    for i in range(n):
        t=i/n;samples.append([a[j]+(b[j]-a[j])*t for j in range(2)])
samples.append(court.ROUTE[-1])
unsupported=[];blocked=[];max_error=0;max_new_error=0
for i,(x,y) in enumerate(samples):
    expected=court.ground_height(y)
    hit,p,n,f,obj,mat=bpy.context.scene.ray_cast(graph,Vector((x,y,expected+.25)),Vector((0,0,-1)),distance=.7)
    error=abs(p.z-expected) if hit else 999
    max_error=max(max_error,error)
    fresh=y<=build['paving']['passage_surface_xy'][3]
    if fresh:max_new_error=max(max_new_error,error)
    if not hit or error>(.01 if fresh else .17):
        unsupported.append({'point':[x,y],'expected':expected,'actual':p.z if hit else None,'object':obj.name if hit else None})
    if i==len(samples)-1:continue
    next_x,next_y=samples[i+1]
    direction=Vector((next_x-x,next_y-y,court.ground_height(next_y)-expected))
    length=direction.length
    if not length:continue
    lateral=Vector((-direction.y,direction.x,0)).normalized()
    for offset in (-.24,0,.24):
        for height in (.08,.40,1.0,1.65,1.80):
            origin=Vector((x,y,expected+height))+lateral*offset
            body,p,n,f,obj,mat=bpy.context.scene.ray_cast(graph,origin,direction.normalized(),distance=length)
            if body:blocked.append({'point':[x,y],'offset':offset,'height':height,'object':obj.name,'position':list(p)})
hit,p,n,f,obj,mat=bpy.context.scene.ray_cast(graph,Vector((-7.05,-16.48,court.FLOOR+.02)),Vector((0,0,1)),distance=4)
entry_clearance=p.z-court.FLOOR if hit else None
report={'build':build,'old_routes':after,'old_route_reports_unchanged':before==after,
        'new_route':{'waypoints_blender':court.ROUTE,'sample_count':len(samples),
                     'maximum_global_floor_error':max_error,'maximum_new_surface_floor_error':max_new_error,
                     'unsupported_samples':unsupported,'body_ray_obstructions':blocked,
                     'body_width':.48,'body_probe_heights':[.08,.40,1.0,1.65,1.80],
                     'entry_vertical_clearance':entry_clearance,
                     'passed':not unsupported and not blocked and entry_clearance>=2.0},
        'source_disk_sha256_before':source_hash,
        'source_disk_sha256_after':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'no_blend_saved_or_exported':True}
out=ROOT/'artifacts/scene-space-05/courtyard-route-audit.json'
out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
assert report['old_route_reports_unchanged']
assert report['new_route']['passed'],{'unsupported':unsupported[:3],'blocked':blocked[:3],'clearance':entry_clearance}
assert report['source_disk_sha256_before']==report['source_disk_sha256_after']
print(json.dumps({'result':'PASS','new_objects':build['added_object_count'],'new_triangles':build['added_triangles'],
                  'old_route_samples':sum(r['sample_count'] for r in after['routes'].values()),
                  'new_route_samples':len(samples),'new_floor_max_error':max_new_error,
                  'entry_clearance':entry_clearance,'report':str(out)},ensure_ascii=False))
