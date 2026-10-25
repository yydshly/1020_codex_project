"""Preserve JonasDichelle's original colour maps in glTF-compatible materials.

Call prepare_materials(output_dir) on a loaded *working copy* of cat.blend.
No original file is overwritten and no replacement textures are generated.
The eyes are baked from their original Generated-coordinate colour chain to UV.
Particle hair conversion is deliberately left to the export/geometry pipeline.
"""
import json
from pathlib import Path
import bpy


def _save_image(image, destination):
    destination = Path(destination)
    image.filepath_raw = str(destination)
    image.file_format = 'PNG'
    image.save()
    return str(destination)


def _pbr(name, image=None, roughness=0.84, specular=0.18, color=(1,1,1,1)):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    pbr = nodes.new('ShaderNodeBsdfPrincipled')
    pbr.inputs['Base Color'].default_value = color
    pbr.inputs['Roughness'].default_value = roughness
    pbr.inputs['Metallic'].default_value = 0
    pbr.inputs['Specular IOR Level'].default_value = specular
    links.new(pbr.outputs['BSDF'],out.inputs['Surface'])
    if image:
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.interpolation = 'Linear'
        texture.extension = 'REPEAT'
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UVMap'
        links.new(uv.outputs['UV'],texture.inputs['Vector'])
        links.new(texture.outputs['Color'],pbr.inputs['Base Color'])
    return material


def _bake_eye_color(obj, output_dir):
    """Bake source RGB Curves, not shaded lighting or a different green-eye map."""
    source = obj.data.materials[0]
    original_path = output_dir / (obj.name.replace('.','-') + '-original-color.png')
    # Use one independently assigned material per eye to avoid shared-slot mutation.
    temp = source.copy()
    temp.name = 'cat_a_eye_bake_' + obj.name
    obj.data = obj.data.copy()
    obj.data.materials[0] = temp
    nodes, links = temp.node_tree.nodes, temp.node_tree.links
    source_curve = nodes.get('RGB Curves')
    source_texture = nodes.get('Image Texture')
    if source_curve is None or source_texture is None or source_texture.image is None:
        raise RuntimeError('Unexpected original eye material; refusing to invent eye colours')
    source_image_name = source_texture.image.name
    image = bpy.data.images.new('cat_a_' + obj.name + '_baked_color',width=1024,height=1024,alpha=False)
    image.colorspace_settings.name = 'sRGB'
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    nodes.active = target
    emit = nodes.new('ShaderNodeEmission')
    links.new(source_curve.outputs['Color'],emit.inputs['Color'])
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
    for link in list(out.inputs['Surface'].links):
        links.remove(link)
    links.new(emit.outputs['Emission'],out.inputs['Surface'])
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='EMIT',use_clear=True,margin=8)
    _save_image(image,original_path)
    image.pack()
    final = _pbr('cat_a_eye_' + obj.name,image,roughness=0.12,specular=0.4)
    obj.data.materials[0] = final
    return {'object':obj.name,'originalMaterial':source.name,'originalImage':source_image_name,
            'coordinateConversion':'Original Generated -> Mapping -> Image -> RGB Curves baked to existing UVMap',
            'image':str(original_path),'colorSpace':'sRGB','material':final.name}


def prepare_materials(output_dir):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True,exist_ok=True)
    cat = bpy.data.objects.get('Cat')
    source_image = bpy.data.images.get('Untitled')
    if cat is None or source_image is None or tuple(source_image.size) != (1500,1500):
        raise RuntimeError('Expected original JonasDichelle cat and packed 1500px colour texture')
    if 'UVMap' not in cat.data.uv_layers:
        raise RuntimeError('Original cat UVMap missing')
    selected = list(bpy.context.selected_objects)
    active = bpy.context.view_layer.objects.active
    scene = bpy.context.scene
    engine, device, samples = scene.render.engine,scene.cycles.device,scene.cycles.samples
    original_selected_to_active=scene.render.bake.use_selected_to_active
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        # Use the author's actual RGB body texture unchanged, with the original UVs.
        body_path=_save_image(source_image,output_dir/'cat-original-calico.png')
        source_image.pack()
        body=_pbr('cat_a_skin',source_image)
        fur=_pbr('cat_a_fur',source_image,roughness=0.9,specular=0.12)
        whisker=_pbr('cat_a_whisker',roughness=0.68,specular=0.1,color=(0.88,0.88,0.83,1))
        cat.data.materials[0]=body
        if len(cat.data.materials)>1:cat.data.materials[1]=fur
        if len(cat.data.materials)>2:cat.data.materials[2]=whisker
        scene.render.engine='CYCLES'
        scene.cycles.device='CPU'
        scene.cycles.samples=1
        scene.render.bake.use_selected_to_active=False
        eyes=[_bake_eye_color(bpy.data.objects[name],output_dir) for name in ('Sphere','Sphere.001') if name in bpy.data.objects]
        report={
            'author':'JonasDichelle','source':'https://blendswap.com/blend/18519',
            'body':{'sourceImage':'Untitled','savedImage':body_path,'size':[1500,1500],
                    'colorSpace':source_image.colorspace_settings.name,'UV':'UVMap','material':body.name,
                    'change':'Diffuse BSDF replaced with glTF-compatible Principled; colour pixels and UVs preserved'},
            'eyes':eyes,
            'materials':{'skin':body.name,'fur':fur.name,'whiskers':whisker.name},
            'limitations':['Cycles Hair BSDF and particle strand dynamics are not represented by these materials.',
                            'Skin/fur roughness and eye reflections are web approximations; no anatomy or animation was modified.',
                            'The packed green_eye_diff image belongs to the unused empty eye mesh and is not used.']
        }
        (output_dir/'material-adaptation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        return report
    finally:
        scene.render.engine=engine
        scene.cycles.device=device
        scene.cycles.samples=samples
        scene.render.bake.use_selected_to_active=original_selected_to_active
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected:
            if obj.name in bpy.context.view_layer.objects:obj.select_set(True)
        if active and active.name in bpy.context.view_layer.objects:bpy.context.view_layer.objects.active=active


if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    bpy.ops.wm.open_mainfile(filepath=str(root/'artifacts/cat-a/source/original/cat.blend'),load_ui=False,use_scripts=False)
    print(json.dumps(prepare_materials(root/'artifacts/cat-a/materials'),indent=2))
