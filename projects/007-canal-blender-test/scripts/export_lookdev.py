import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import time

import bpy


PROJECT_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = PROJECT_DIR / 'web' / 'models'
TEXTURE_DIR = PROJECT_DIR / 'web' / 'textures'
BAKED_GROUPS = ('plaster', 'plaster_alt', 'wood', 'wood_light', 'teal', 'olive', 'fabric', 'roof', 'roof_alt')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb_document(path):
    content = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', content)
    if magic != b'glTF' or version != 2 or length != len(content):
        raise ValueError('Invalid GLB structure.')
    json_length, chunk_type = struct.unpack_from('<II', content, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError('Missing GLB JSON chunk.')
    return json.loads(content[20:20 + json_length].decode('utf-8').rstrip(' \0'))


def convert_baked_materials_to_unlit(path):
    content = path.read_bytes()
    old_json_length = struct.unpack_from('<I', content, 12)[0]
    document = glb_document(path)
    for material in document['materials']:
        if not material['name'].startswith('Baked V4 / '):
            continue
        texture = material.pop('emissiveTexture', None)
        material.pop('emissiveFactor', None)
        if texture is not None:
            material['pbrMetallicRoughness'] = {'baseColorTexture': texture, 'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 1}
        if 'baseColorTexture' not in material.get('pbrMetallicRoughness', {}):
            raise RuntimeError('A baked material has no diffuse texture.')
        material['extensions'] = {'KHR_materials_unlit': {}}
    document['extensionsUsed'] = sorted(set(document.get('extensionsUsed', [])) | {'KHR_materials_unlit'})
    encoded = json.dumps(document, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    binary_chunks = content[20 + old_json_length:]
    result = struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(binary_chunks)) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + binary_chunks
    path.write_bytes(result)
    return document


def finalize_export(manifest, details, environment, source_color_management, devices, seconds, timing_scope):
    source = PROJECT_DIR / 'artifacts' / 'rainy-canal-v4.blend'
    structural = MODEL_DIR / 'canal-v4.glb'
    destination = MODEL_DIR / 'lookdev-v4.glb'
    if digest(source) != manifest['source']['sha256'] or digest(structural) != manifest['sha256']:
        raise RuntimeError('A preserved source file differs from its original manifest.')
    document = convert_baked_materials_to_unlit(destination)
    primitives = [primitive for mesh in document['meshes'] for primitive in mesh['primitives']]
    actual_triangles = sum(document['accessors'][primitive['indices']]['count'] // 3 for primitive in primitives)
    actual_vertices = sum(document['accessors'][primitive['attributes']['POSITION']]['count'] for primitive in primitives)
    unlit_names = [material['name'] for material in document['materials'] if 'KHR_materials_unlit' in material.get('extensions', {})]
    if actual_triangles != manifest['geometry']['triangles'] or len(document['meshes']) != manifest['geometry']['export_meshes']:
        raise RuntimeError('Lookdev export changed the structural mesh or triangle count.')
    if len(unlit_names) != len(BAKED_GROUPS):
        raise RuntimeError('Baked materials must export as unlit to avoid double lighting.')
    manifest['source_structural_asset'] = {'asset': structural.name, 'sha256': manifest['sha256'], 'unchanged': True}
    manifest['asset'] = destination.name
    manifest['label'] = 'v4-lookdev'
    manifest['bytes'] = destination.stat().st_size
    manifest['sha256'] = digest(destination)
    manifest['geometry']['vertices'] = actual_vertices
    manifest['geometry']['export_primitives'] = len(primitives)
    manifest['geometry']['binary_bytes'] = document['buffers'][0]['byteLength']
    manifest['geometry']['uv_seams_may_split_vertices'] = True
    manifest['baked_materials'] = details
    manifest['unlit_material_names'] = unlit_names
    manifest['environment'] = environment
    manifest['source_color_management'] = source_color_management
    manifest['bake_light_count'] = 20
    manifest['bake_devices'] = devices
    manifest['export_seconds'] = seconds
    manifest['timing_scope'] = timing_scope
    manifest['bake_runs'] = {'sample': 1, 'formal': 1, 'formal_resolution': [1024, 1024], 'formal_samples': 16}
    manifest['extensions_used'] = document.get('extensionsUsed', [])
    manifest['limitations'] = [
        'Real V4 diffuse material color, direct lighting and indirect lighting baked into UV textures on nine material groups.',
        'Baked groups use KHR_materials_unlit and must not receive additional viewer diffuse lighting; the source lighting is fixed into those textures.',
        'Water, glass, metal, plants and other unbaked groups retain the structural PBR approximations and can use live viewer lighting.',
        'No camera-view render or reference image is used as a texture; UV atlases are baked from real geometry and source Cycles materials.',
        '1024-pixel atlases and 16-sample diffuse baking are compositor-denoised, which can soften fine material detail; PNG clips scene-linear values above one.',
        'The Cycles AgX display transform is not baked into PNG textures; the viewer applies its own tone mapping and exposure.',
        'Specular reflections, transmission, caustics, procedural normal detail and compositor haze are not baked into the unlit diffuse textures.',
        'Structural meshes and triangles remain unchanged. UV seams can increase exported vertex count and texture memory.',
        'Baking uses the structural GLB geometry with original source shaders; object-relative procedural coordinates can differ after material-group merging.',
        'The world-only HDR contains the original procedural sky, without local objects or local lights.',
    ]
    manifest['external_dependencies'] = []
    manifest['environment_separate_from_glb'] = True
    (MODEL_DIR / 'lookdev-v4-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('LOOKDEV_EXPORT', json.dumps({'asset': destination.name, 'bytes': manifest['bytes'], 'meshes': len(document['meshes']), 'triangles': actual_triangles, 'vertices': actual_vertices, 'baked_materials': unlit_names, 'seconds': seconds}), flush=True)


def finalize_existing(manifest):
    started = time.perf_counter()
    details = []
    for name in BAKED_GROUPS:
        texture = TEXTURE_DIR / f'lookdev-v4-{name}-diffuse.png'
        details.append({'source_material': name, 'material': 'Baked V4 / ' + name, 'texture': '../textures/' + texture.name, 'texture_sha256': digest(texture), 'texture_bytes': texture.stat().st_size, 'resolution': [1024, 1024], 'samples': 16, 'seconds': None, 'color_space': 'sRGB-encoded linear diffuse radiance; no AgX display transform; 16-bit PNG', 'passes': ['COLOR', 'DIRECT', 'INDIRECT'], 'denoising': 'Blender compositor Denoise; diffuse color only, no normal/albedo auxiliary passes'})
    environment_path = TEXTURE_DIR / 'lookdev-v4-world.hdr'
    environment = {'asset': '../textures/' + environment_path.name, 'sha256': digest(environment_path), 'bytes': environment_path.stat().st_size, 'resolution': [1024, 512], 'encoding': 'Radiance RGBE HDR, linear scene radiance, equirectangular', 'source': 'V4 procedural World only; no scene geometry, lights or main-camera render included', 'source_world_strength_already_included': True, 'panorama_camera_rotation_blender': [math.pi / 2, 0, 0], 'seconds': None}
    audit = json.loads((PROJECT_DIR / 'assets' / 'viewer-source-audit.json').read_text(encoding='utf-8'))
    sample = json.loads((MODEL_DIR / 'lookdev-v4-sample.json').read_text(encoding='utf-8'))
    finalize_export(manifest, details, environment, audit['color_management'], sample['devices'], round(time.perf_counter() - started, 2), 'Finalization only; completed formal bake was not repeated. Its exact full duration was not retained after the initial glTF unlit validation failed.')


def configure_cycles(scene, samples):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 3
    scene.cycles.transmission_bounces = 6
    scene.cycles.use_denoising = True
    preferences = bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type = 'OPTIX'
    preferences.get_devices()
    devices = []
    for device in preferences.devices:
        device.use = device.type == 'OPTIX'
        if device.use:
            devices.append(device.name)
    scene.cycles.device = 'GPU' if devices else 'CPU'
    return devices


def bake_material(obj, name, destination, resolution, samples):
    started = time.perf_counter()
    for existing in bpy.context.scene.objects:
        existing.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name='Baked diffuse lighting UV')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02, area_weight=0.0, correct_aspect=True, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    image = bpy.data.images.new('Baked V4 diffuse / ' + name, width=resolution, height=resolution, alpha=False, float_buffer=True)
    image.colorspace_settings.name = 'sRGB'
    material = obj.data.materials[0]
    target = material.node_tree.nodes.new('ShaderNodeTexImage')
    target.name = 'Active diffuse bake destination'
    target.image = image
    material.node_tree.nodes.active = target
    bpy.context.scene.cycles.samples = samples
    bpy.context.scene.render.bake.use_selected_to_active = False
    bpy.context.scene.render.bake.margin = 8
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR', 'DIRECT', 'INDIRECT'}, use_clear=True, margin=8)
    image.filepath_raw = str(destination)
    image.file_format = 'PNG'
    image.save()
    texture = bpy.data.images.load(str(destination), check_existing=False)
    texture.colorspace_settings.name = 'sRGB'
    unlit = bpy.data.materials.new('Baked V4 / ' + name)
    unlit.use_nodes = True
    nodes = unlit.node_tree.nodes
    links = unlit.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = 1
    texture_node = nodes.new('ShaderNodeTexImage')
    texture_node.image = texture
    links.new(texture_node.outputs['Color'], emission.inputs['Color'])
    links.new(emission.outputs['Emission'], output.inputs['Surface'])
    unlit.use_backface_culling = False
    return unlit, {
        'source_material': name,
        'material': unlit.name,
        'texture': '../textures/' + destination.name,
        'texture_sha256': digest(destination),
        'texture_bytes': destination.stat().st_size,
        'resolution': [resolution, resolution],
        'samples': samples,
        'seconds': round(time.perf_counter() - started, 2),
        'color_space': 'sRGB-encoded linear diffuse radiance; no AgX display transform; 16-bit PNG',
        'passes': ['COLOR', 'DIRECT', 'INDIRECT'],
    }


def world_environment(source_world, destination, bake_details):
    started = time.perf_counter()
    environment = bpy.data.scenes.new('World only environment - disposable')
    environment.world = source_world
    bpy.context.window.scene = environment
    configure_cycles(environment, 8)
    camera_data = bpy.data.cameras.new('World only panorama')
    camera_data.type = 'PANO'
    if hasattr(camera_data, 'panorama_type'):
        camera_data.panorama_type = 'EQUIRECTANGULAR'
    else:
        camera_data.cycles.panorama_type = 'EQUIRECTANGULAR'
    camera = bpy.data.objects.new('World only panorama', camera_data)
    camera.rotation_euler = (math.pi / 2, 0, 0)
    environment.collection.objects.link(camera)
    environment.camera = camera
    environment.render.resolution_x = 1024
    environment.render.resolution_y = 512
    environment.render.resolution_percentage = 100
    environment.render.image_settings.file_format = 'HDR'
    environment.render.image_settings.color_mode = 'RGB'
    environment.view_settings.view_transform = 'Standard'
    environment.view_settings.look = 'None'
    environment.view_settings.exposure = 0
    environment.view_settings.gamma = 1
    environment.render.film_transparent = False
    environment.render.filepath = str(destination)
    environment.use_nodes = True
    nodes = environment.node_tree.nodes
    links = environment.node_tree.links
    nodes.clear()
    render_layers = nodes.new('CompositorNodeRLayers')
    composite = nodes.new('CompositorNodeComposite')
    links.new(render_layers.outputs['Image'], composite.inputs['Image'])
    for detail in bake_details:
        texture_path = TEXTURE_DIR / Path(detail['texture']).name
        source_image = nodes.new('CompositorNodeImage')
        source_image.image = bpy.data.images.load(str(texture_path), check_existing=False)
        source_image.image.colorspace_settings.name = 'sRGB'
        denoise = nodes.new('CompositorNodeDenoise')
        denoise.prefilter = 'ACCURATE'
        output = nodes.new('CompositorNodeOutputFile')
        output.base_path = str(TEXTURE_DIR)
        output.file_slots[0].path = texture_path.stem + '-denoised-'
        output.format.file_format = 'PNG'
        output.format.color_mode = 'RGB'
        output.format.color_depth = '16'
        links.new(source_image.outputs['Image'], denoise.inputs['Image'])
        links.new(denoise.outputs['Image'], output.inputs[0])
    bpy.ops.render.render(write_still=True)
    for detail in bake_details:
        texture_path = TEXTURE_DIR / Path(detail['texture']).name
        denoised_path = texture_path.with_name(texture_path.stem + '-denoised-0001.png')
        denoised_path.replace(texture_path)
        detail['texture_sha256'] = digest(texture_path)
        detail['texture_bytes'] = texture_path.stat().st_size
        detail['denoising'] = 'Blender compositor Denoise; diffuse color only, no normal/albedo auxiliary passes'
    for image in bpy.data.images:
        if image.source == 'FILE' and image.filepath and Path(image.filepath).name in {Path(detail['texture']).name for detail in bake_details}:
            image.reload()
    return {
        'asset': '../textures/' + destination.name,
        'sha256': digest(destination),
        'bytes': destination.stat().st_size,
        'resolution': [1024, 512],
        'encoding': 'Radiance RGBE HDR, linear scene radiance, equirectangular',
        'source': 'V4 procedural World only; no scene geometry, lights or main-camera render included',
        'source_world_strength_already_included': True,
        'panorama_camera_rotation_blender': [math.pi / 2, 0, 0],
        'seconds': round(time.perf_counter() - started, 2),
    }


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sample', action='store_true')
    parser.add_argument('--finalize-existing', action='store_true')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    started = time.perf_counter()
    source = PROJECT_DIR / 'artifacts' / 'rainy-canal-v4.blend'
    structural = MODEL_DIR / 'canal-v4.glb'
    source_hash = digest(source)
    structural_hash = digest(structural)
    manifest = json.loads((MODEL_DIR / 'viewer-manifest-v4.json').read_text(encoding='utf-8'))
    if options.finalize_existing:
        finalize_existing(manifest)
        return
    bpy.ops.wm.open_mainfile(filepath=str(source))
    original_scene = bpy.context.scene
    source_world = original_scene.world
    source_materials = {material.name: material for material in bpy.data.materials}
    source_lights = [obj for obj in original_scene.objects if obj.type == 'LIGHT']
    source_color_management = {
        'view_transform': original_scene.view_settings.view_transform,
        'look': original_scene.view_settings.look,
        'exposure': original_scene.view_settings.exposure,
        'gamma': original_scene.view_settings.gamma,
    }
    temporary = bpy.data.scenes.new('V4 look development bake - disposable')
    temporary.world = source_world
    bpy.context.window.scene = temporary
    bpy.ops.import_scene.gltf(filepath=str(structural))
    geometry = [obj for obj in temporary.objects if obj.type == 'MESH']
    if len(geometry) != manifest['geometry']['export_meshes']:
        raise RuntimeError('Imported structural mesh count does not match its manifest.')
    triangle_count = sum(len(obj.data.polygons) for obj in geometry)
    if triangle_count != manifest['geometry']['triangles']:
        raise RuntimeError('Imported triangle count changed.')
    objects_by_material = {}
    structural_materials = {}
    for obj in geometry:
        material = obj.data.materials[0]
        key = material.name.removeprefix('Viewer / ')
        if key not in source_materials:
            raise RuntimeError('Missing source material for ' + key)
        objects_by_material[key] = obj
        structural_materials[key] = material
        copy = source_materials[key].copy()
        copy.name = 'Temporary source shading / ' + key
        obj.data.materials[0] = copy
    for light in source_lights:
        temporary.collection.objects.link(light)
    devices = configure_cycles(temporary, 8 if options.sample else 16)
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    baked = {}
    details = []
    chosen = ('plaster',) if options.sample else BAKED_GROUPS
    resolution = 512 if options.sample else 1024
    for name in chosen:
        suffix = 'sample' if options.sample else 'diffuse'
        destination = TEXTURE_DIR / f'lookdev-v4-{name}-{suffix}.png'
        baked[name], information = bake_material(objects_by_material[name], name, destination, resolution, 8 if options.sample else 16)
        details.append(information)
        print('BAKED_MATERIAL', json.dumps(information), flush=True)
    if options.sample:
        report = {'mode': 'single bounded sample', 'source_sha256': source_hash, 'structural_sha256': structural_hash, 'devices': devices, 'baked_materials': details, 'seconds': round(time.perf_counter() - started, 2), 'source_unchanged': digest(source) == source_hash, 'structural_unchanged': digest(structural) == structural_hash}
        (MODEL_DIR / 'lookdev-v4-sample.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print('LOOKDEV_SAMPLE', json.dumps(report), flush=True)
        return
    for name, obj in objects_by_material.items():
        obj.data.materials[0] = baked.get(name, structural_materials[name])
    environment = world_environment(source_world, TEXTURE_DIR / 'lookdev-v4-world.hdr', details)
    bpy.context.window.scene = temporary
    for obj in temporary.objects:
        obj.select_set(obj.type == 'MESH')
    bpy.context.view_layer.objects.active = geometry[0]
    destination = MODEL_DIR / 'lookdev-v4.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True, use_active_scene=True, export_cameras=False, export_lights=False, export_animations=False, export_extras=False, export_yup=True, export_apply=False, export_normals=True, export_texcoords=True, export_tangents=False, export_materials='EXPORT')
    if digest(source) != source_hash or digest(structural) != structural_hash:
        raise RuntimeError('A preserved source file changed during baking.')
    finalize_export(manifest, details, environment, source_color_management, devices, round(time.perf_counter() - started, 2), 'Full bake, denoising, world-only HDR render, and GLB export')


if __name__ == '__main__':
    run()
