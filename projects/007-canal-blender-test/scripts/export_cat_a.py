"""Export only an adapted copy of the author's complete cat to a new web asset."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(Path(__file__).parent))
from cat_a_materials import prepare_materials
from cat_a_bake import bake_original_actions

def capture_groom(cat):
    evaluated=cat.evaluated_get(bpy.context.evaluated_depsgraph_get())
    systems=[]
    for system_index,ps in enumerate(evaluated.particle_systems):
        parents=len(ps.particles); count=parents+len(ps.child_particles)
        end=2**ps.settings.display_step
        strands=[]
        for i in range(count):
            if system_index==0 and i>=parents and (i-parents)%2: continue
            raw=[]
            for step in range(end+1):
                co=Vector(ps.co_hair(cat,particle_no=i,step=step))
                if step>0 and co.length_squared<1e-14: break
                raw.append(co)
            if len(raw)<2 or (raw[-1]-raw[0]).length<0.01: continue
            samples=5
            path=[]
            for j in range(samples):
                f=j*(len(raw)-1)/(samples-1); k=int(f)
                path.append(raw[k].lerp(raw[min(k+1,len(raw)-1)],f-k))
            strands.append(path)
        systems.append(strands)
    return systems

def apply_surface(obj,level):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    if obj.data.shape_keys and len(obj.data.shape_keys.key_blocks)==1:
        obj.shape_key_clear()
    for mod in list(obj.modifiers):
        if mod.type=='PARTICLE_SYSTEM':obj.modifiers.remove(mod)
    for mod in list(obj.modifiers):
        if mod.type=='SUBSURF':
            mod.levels=level;mod.render_levels=level
            bpy.ops.object.modifier_apply(modifier=mod.name)

def groom_mesh(cat,rig,strands,name,material,radius):
    mesh=cat.data;mesh.calc_loop_triangles()
    coords=[v.co.copy() for v in mesh.vertices]
    tris=list(mesh.loop_triangles)
    bvh=BVHTree.FromPolygons(coords,[t.vertices[:] for t in tris],all_triangles=True)
    uvdata=mesh.uv_layers.active.data
    verts=[];faces=[];uvs=[];strand_weights=[]
    unit=[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))]
    group_names={g.index:g.name for g in cat.vertex_groups}
    for path in strands:
        nearest,normal,tri_index,distance=bvh.find_nearest(path[0])
        if nearest is None:continue
        tri=tris[tri_index];vi=tri.vertices
        bary=barycentric_transform(nearest,coords[vi[0]],coords[vi[1]],coords[vi[2]],*unit)
        uv=Vector((0.,0.));weights={}
        for j,idx in enumerate(vi):
            amount=max(0.,bary[j]);uv+=uvdata[tri.loops[j]].uv*amount
            for group in mesh.vertices[idx].groups:
                if group.group in group_names and group_names[group.group] in rig.data.bones:
                    weights[group.group]=weights.get(group.group,0.)+amount*group.weight
        weights=sorted(weights.items(),key=lambda kv:kv[1],reverse=True)[:4]
        total=sum(w for _,w in weights)
        if not total:continue
        start=len(verts)
        tangent=(path[-1]-path[0]).normalized()
        side=tangent.cross(normal)
        if side.length<.001:side=tangent.cross(Vector((1,0,0)))
        if side.length<.001:side=tangent.cross(Vector((0,1,0)))
        side.normalize();other=tangent.cross(side).normalized()
        for j,co in enumerate(path):
            width=radius*(1.-.94*j/(len(path)-1))
            for k in range(3):
                angle=k*2*math.pi/3
                verts.append(tuple(co+width*(side*math.cos(angle)+other*math.sin(angle))))
                uvs.append(tuple(uv))
        for j in range(len(path)-1):
            for k in range(3):
                a=start+j*3+k;b=start+j*3+(k+1)%3;c=a+3;d=b+3
                faces.extend([(a,b,d),(a,d,c)])
        strand_weights.append((list(range(start,len(verts))),[(g,w/total) for g,w in weights]))
    newmesh=bpy.data.meshes.new(name);newmesh.from_pydata(verts,[],faces);newmesh.update()
    obj=bpy.data.objects.new(name,newmesh);bpy.context.collection.objects.link(obj)
    obj.parent=rig;obj.matrix_world=cat.matrix_world.copy()
    newmesh.materials.append(material)
    layer=newmesh.uv_layers.new(name='UVMap')
    for loop in newmesh.loops:layer.data[loop.index].uv=uvs[loop.vertex_index]
    groups={i:obj.vertex_groups.new(name=group_names[i]) for i in group_names}
    for indices,weights in strand_weights:
        for index,w in weights:groups[index].add(indices,w,'REPLACE')
    for poly in newmesh.polygons:poly.use_smooth=True
    mod=obj.modifiers.new('Original skin weights','ARMATURE');mod.object=rig
    return obj

bpy.ops.wm.open_mainfile(filepath=str(root/'artifacts/cat-a/source/original/cat.blend'),load_ui=False,use_scripts=False)
rig=bpy.data.objects['Armature'];cat=bpy.data.objects['Cat']
prepare_materials(root/'artifacts/cat-a/materials')
rig.data.pose_position='REST';bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
grooms=capture_groom(cat)
print('GROOM_CAPTURE',list(map(len,grooms)),flush=True)
apply_surface(cat,2)
eyes=[bpy.data.objects[name] for name in ('Sphere','Sphere.001')]
for eye in eyes:apply_surface(eye,1)
fur=groom_mesh(cat,rig,grooms[0],'Cat_A_original_groom',bpy.data.materials['cat_a_fur'],.0035)
whiskers=groom_mesh(cat,rig,grooms[1],'Cat_A_original_whiskers',bpy.data.materials['cat_a_whisker'],.006)
rig.data.pose_position='POSE';bpy.context.view_layer.update()
bake=bake_original_actions(rig,root/'artifacts/cat-a/bake-verification.json')
bpy.context.scene.frame_set(1)
selected=[rig,cat,*eyes,fur,whiskers]
bpy.ops.object.select_all(action='DESELECT')
for obj in selected:obj.hide_set(False);obj.hide_render=False;obj.select_set(True)
bpy.context.view_layer.objects.active=rig
rig['source_author']='JonasDichelle';rig['source_url']='https://blendswap.com/blend/18519'
rig['license']='CC BY 3.0';rig['adaptation']='Original Walk/Run sampled; original groom reduced and skinned; PBR material adaptation.'
out=root/'web/models/cat-a-study.glb';out.parent.mkdir(parents=True,exist_ok=True)
rig.animation_data.action=None
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_step=1,
    export_bake_animation=True,export_anim_single_armature=False,export_reset_pose_bones=True,
    export_anim_slide_to_zero=True,export_optimize_animation_size=False,export_def_bones=False,
    export_skins=True,export_rest_position_armature=True,export_apply=False,
    export_cameras=False,export_lights=False,export_extras=True)
report={'asset':str(out),'bytes':out.stat().st_size,'groom_strands':list(map(len,grooms)),
    'meshes':[{'name':o.name,'vertices':len(o.data.vertices),'faces':len(o.data.polygons)} for o in selected if o.type=='MESH'],
    'limits':['Groom geometry follows skinning; original strand dynamics are not simulated.',
              'Original Cycles shading is approximated in web PBR.',
              'Legacy original Run tail has a small loop endpoint seam, retained without invented motion.']}
(root/'artifacts/cat-a/export-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(root/'artifacts/cat-a/cat-a-web-adapted.blend'))
print('EXPORT_COMPLETE',json.dumps(report),flush=True)
