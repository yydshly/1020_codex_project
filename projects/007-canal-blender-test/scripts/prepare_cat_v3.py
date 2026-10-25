"""Prepare a licensed static cat for a small, conservative walking study.

Only new outputs are written. Source GLB and all earlier work remain intact.
Run with Blender --background --python scripts/prepare_cat_v3.py.
"""
import bpy
import json
import math
import hashlib
from pathlib import Path
from mathutils import Matrix, Vector

PROJECT = Path(__file__).resolve().parents[1]
MODELS = PROJECT / 'web' / 'models'
SOURCE = MODELS / 'cat-v3-reference-source.glb'
OUTPUT = MODELS / 'cat-v3-rig.glb'
MANIFEST = MODELS / 'cat-v3-rig.json'
BLEND = PROJECT / 'artifacts' / 'cat-v3-rig.blend'
SCALE = .9685895306353042

def blend(a,b,t):
    return a+(b-a)*t

def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)

def bpoint(p):
    return Vector((p[0],-p[2],p[1]))

def tpoint(p):
    return (p.x,p.z,-p.y)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

source_hash=digest(SOURCE)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(meshes)==1, 'Expected the documented single static mesh'
cat=meshes[0]
cat.name='CatV3_SkinnedSurface'
transform=Matrix.Translation((.036,0,0)) @ Matrix.Rotation(.7,4,'Z') @ Matrix.Scale(SCALE,4)
cat.data.transform(transform @ cat.matrix_world)
cat.matrix_world=Matrix.Identity(4)
for polygon in cat.data.polygons:
    polygon.use_smooth=True
original_triangles=sum(len(p.vertices)-2 for p in cat.data.polygons)
bpy.context.view_layer.objects.active=cat
cat.select_set(True)
decimate=cat.modifiers.new('Bounded display mesh reduction','DECIMATE')
decimate.ratio=min(1,49000/original_triangles)
decimate.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=decimate.name)
cat.data.update()

bones={
 'root': {'head':[0,0,0],'tail':[0,.06,0],'parent':None},
 'spine': {'head':[0,.235,-.10],'tail':[0,.24,.02],'parent':'root'},
 'chest': {'head':[0,.24,.02],'tail':[0,.275,.12],'parent':'spine'},
 'neck': {'head':[0,.275,.12],'tail':[.005,.325,.15],'parent':'chest'},
 'head': {'head':[.005,.325,.15],'tail':[.025,.38,.18],'parent':'neck'},
}
sole_points={
 'fore_left':[-.0427,.0032,.1127], 'fore_right':[.0422,.0017,.1027],
 'hind_left':[-.0541,.0031,-.1337], 'hind_right':[.052,0,-.1638],
}
legs={}
for name,sole in sole_points.items():
    front=name.startswith('fore')
    hip=[sole[0],.235,.125 if front else -.145]
    knee=[sole[0],.135 if front else .145,.09 if front else -.10]
    ankle=[sole[0],.043,sole[2]-.01]
    toe=[sole[0],sole[1]+.015,sole[2]+.025]
    upper,lower,paw=(name+'_'+part for part in ('upper','lower','paw'))
    bones[upper]={'head':hip,'tail':knee,'parent':'chest' if front else 'spine'}
    bones[lower]={'head':knee,'tail':ankle,'parent':upper}
    bones[paw]={'head':ankle,'tail':toe,'parent':lower}
    legs[name]={'upper':upper,'lower':lower,'paw':paw,'sole':sole,'pawOffset':[ankle[i]-sole[i] for i in range(3)],'hip':hip,'knee':knee,'ankle':ankle}
tail_points=[[.019,.265,-.18],[.024,.33,-.205],[.04,.405,-.235],[.025,.47,-.205],[.015,.475,-.18]]
for index in range(4):
    name=f'tail_{index+1:02d}'
    bones[name]={'head':tail_points[index],'tail':tail_points[index+1],'parent':'spine' if index==0 else f'tail_{index:02d}'}

armature_data=bpy.data.armatures.new('CatV3_Armature')
rig=bpy.data.objects.new('CatV3_Rig',armature_data)
bpy.context.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
for name,spec in bones.items():
    bone=armature_data.edit_bones.new(name)
    bone.head=bpoint(spec['head']);bone.tail=bpoint(spec['tail'])
    if spec['parent']:
        bone.parent=armature_data.edit_bones[spec['parent']]
    bone.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT')
armature_data.bones['root'].use_deform=False

groups={name:cat.vertex_groups.new(name=name) for name in bones if name!='root'}
def add(weights,name,value):
    if value>1e-8:
        weights[name]=weights.get(name,0)+value

def distance_segment(p,a,b):
    dx,dy,dz=(b[i]-a[i] for i in range(3))
    length=dx*dx+dy*dy+dz*dz
    t=max(0,min(1,sum((p[i]-a[i])*(b[i]-a[i]) for i in range(3))/max(1e-8,length)))
    d=sum((p[i]-(a[i]+(b[i]-a[i])*t))**2 for i in range(3))
    return math.sqrt(d),t

weight_counts={name:0 for name in groups}
for vertex in cat.data.vertices:
    p=tpoint(vertex.co);x,y,z=p
    weights={}
    # Tail grows out of the rump and rises behind it. Its root stays shared with
    # spine; the upper tail is blended along the measured curved centre line.
    tail_amount=smooth(.255,.315,y)*(1-smooth(-.185,-.15,z))
    if tail_amount>0:
        distances=[]
        for index in range(4):
            d,t=distance_segment(p,tail_points[index],tail_points[index+1])
            distances.append((d,index,t))
        _,idx,t=min(distances)
        name=f'tail_{idx+1:02d}'
        add(weights,name,tail_amount*(1-.45*smooth(.45,1,t)))
        if idx<3:
            add(weights,f'tail_{idx+2:02d}',tail_amount*.45*smooth(.45,1,t))
        else:
            add(weights,name,tail_amount*.45*smooth(.45,1,t))
    remaining=1-tail_amount
    front=z>.02
    leg_amount=(1-smooth(.155,.265,y))*smooth(.02,.075,abs(z))
    if leg_amount>0 and remaining>0:
        # The separate lower limbs are selected by side/fore-hind position;
        # at shoulders and thighs weights fade into chest/spine smoothly.
        name=('fore_' if front else 'hind_')+('left' if x<0 else 'right')
        spec=legs[name]
        paw_mix=1-smooth(.028,.067,y)
        upper_mix=smooth(.105,.165,y)
        add(weights,spec['paw'],remaining*leg_amount*paw_mix)
        add(weights,spec['lower'],remaining*leg_amount*(1-paw_mix)*(1-upper_mix))
        add(weights,spec['upper'],remaining*leg_amount*(1-paw_mix)*upper_mix)
    body=remaining*(1-leg_amount)
    head_amount=smooth(.29,.345,y)*smooth(.06,.13,z)
    neck_amount=smooth(.25,.31,y)*smooth(.07,.14,z)*(1-head_amount)
    chest_amount=smooth(-.02,.115,z)*(1-head_amount-neck_amount)
    add(weights,'head',body*head_amount)
    add(weights,'neck',body*neck_amount)
    add(weights,'chest',body*chest_amount)
    add(weights,'spine',body*(1-head_amount-neck_amount-chest_amount))
    # glTF portable four-weight budget, normalized after dropping tiny tails.
    selected=sorted(weights.items(),key=lambda item:item[1],reverse=True)[:4]
    total=sum(w for _,w in selected)
    assert total>1e-8
    for name,weight in selected:
        groups[name].add([vertex.index],weight/total,'REPLACE')
        weight_counts[name]+=1
modifier=cat.modifiers.new('CatV3 skinning','ARMATURE');modifier.object=rig
cat.parent=rig

bpy.ops.object.select_all(action='DESELECT')
cat.select_set(True);rig.select_set(True)
bpy.context.view_layer.objects.active=rig
rig.show_in_front=True
triangles=sum(len(p.vertices)-2 for p in cat.data.polygons)
manifest={
 'schema_version':1,'coordinate_system':'Y-up,+Z-forward,metres',
 'source_file':SOURCE.name,'source_sha256':source_hash,
 'license':'CC0-1.0','license_file':'cat-v3-reference-source.LICENSE.txt',
 'source_page':'https://grab3d.com/models/animals/cat/',
 'asset':OUTPUT.name,'source_triangles':original_triangles,'triangles':triangles,
 'source_transform':{'yaw_y':.7,'scale':SCALE,'translation_x':.036},
 'ear_height':.42,'tail_height':.48431,'bones':bones,'legs':legs,
 'weight_assignment':'Measured fore/hind and side regions; smooth body/limb, ankle, neck/head and tail blends, four normalized influences.',
 'limitations':['Weights are hand-authored spatial regions, not a production animal rig.','The source head looks slightly sideways; do not force face straight with large rotations.','Use small walking/turn amplitudes and inspect shoulder and groin deformation.'],
 'vertex_group_counts':weight_counts,
}
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_morph=False,export_yup=True,export_apply=False)
manifest['bytes']=OUTPUT.stat().st_size
manifest['sha256']=digest(OUTPUT)
assert digest(SOURCE)==source_hash
MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('CAT_V3_RESULT '+json.dumps({'vertices':len(cat.data.vertices),'triangles':triangles,'bones':len(bones),'bytes':manifest['bytes'],'asset':str(OUTPUT),'source_unchanged':True}))
