"""Separate, immutable full diffuse lighting version of the shared canal.

CPU --prepare retains all existing PBR UVs and adds UVs to every remaining
opaque source material. --bake traces the ORIGINAL Cycles lights/materials,
direct + indirect, without albedo or emission. --finalize publishes a new GLB.
There is no scene-camera render or background projection in this workflow.
"""
import argparse
import copy
import gzip
import hashlib
import json
from pathlib import Path
import sys
import time

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_quality_scene as base

PROJECT = base.PROJECT
ROOT = base.ROOT
ARTIFACT = PROJECT / 'artifacts/quality-canal-full-diffuse.blend'
MANIFEST = ROOT / 'manifest-full-diffuse.json'
PROVENANCE = ROOT / 'provenance-full-diffuse.json'
TEXTURES = ROOT / 'textures/full-diffuse'
MASTERS = PROJECT / 'artifacts/full-diffuse-masters'
PAUSE = PROJECT / 'artifacts/full-diffuse.pause'


def emit(event, **values):
    print('FULL_DIFFUSE_' + event.upper(), json.dumps(values, ensure_ascii=False), flush=True)


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    temporary.replace(path)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def preserved_files():
    manifest = read_json(base.MANIFEST)
    files = {str(base.SOURCE): manifest['source']['sha256'],
             str(base.ARTIFACT): base.digest(base.ARTIFACT),
             str(base.MANIFEST): base.digest(base.MANIFEST),
             str(base.PROVENANCE): base.digest(base.PROVENANCE),
             str(ROOT / manifest['asset']['file']): manifest['asset']['sha256']}
    for group in manifest['groups']:
        for texture in group.get('textures', {}).values():
            files[str(ROOT / texture['file'])] = texture['sha256']
            if texture.get('diagnostic_png'):
                item = texture['diagnostic_png']
                files[str(ROOT / item['file'])] = item['sha256']
    for image in manifest['asset']['external_image_assets']:
        files[str(base.MODELS / image['uri'])] = image['sha256']
    return files


def verify_preserved(files):
    for name, expected in files.items():
        if base.digest(Path(name)) != expected:
            raise RuntimeError('An immutable source/master changed: ' + name)


def prepare(options):
    started = time.perf_counter()
    original = read_json(base.MANIFEST)
    preserved = preserved_files()
    verify_preserved(preserved)
    bpy.ops.wm.open_mainfile(filepath=str(base.ARTIFACT))
    manifest = copy.deepcopy(original)
    manifest.pop('asset', None)
    manifest['stage'] = 'full-diffuse-prepared'
    manifest['lightingMode'] = 'full-diffuse'
    manifest['parent_manifest'] = 'manifest.json'
    manifest['preserved_files'] = preserved
    existing_uvs, new_uvs, full_groups = {}, {}, []
    for group in manifest['groups']:
        enabled = group.get('runtime_export', True) and group['source_material'] != 'glass'
        group['full_diffuse_enabled'] = enabled
        if not enabled:
            continue
        obj = bpy.data.objects[group['mesh']]
        if obj.data.uv_layers:
            before = base.bake_signature(obj)
            existing_uvs[group['key']] = before
            resolution = group['resolution']
        else:
            name = group['source_material']
            resolution = 2048 if name.startswith('book_') or name in {'leaf', 'leaf_light'} else (512 if name == 'warm_glow' else 1024)
            group['full_diffuse_uv'] = base.make_uv(obj, resolution)
            new_uvs[group['key']] = base.bake_signature(obj)
        group['full_diffuse_resolution'] = resolution
        group['full_diffuse_uv_signature'] = base.bake_signature(obj)
        full_groups.append(group['key'])
        emit('prepared_group', key=group['key'], resolution=resolution,
             existing_pbr_uv_preserved=group['key'] in existing_uvs)
    bpy.ops.wm.save_as_mainfile(filepath=str(ARTIFACT), check_existing=False)
    manifest['full_diffuse_prepare'] = {
        'artifact': 'artifacts/' + ARTIFACT.name, 'artifact_sha256': base.digest(ARTIFACT),
        'source_scene': bpy.context.scene.name, 'source_lights': len([o for o in bpy.context.scene.objects if o.type == 'LIGHT']),
        'groups': full_groups, 'existing_uv_signatures': existing_uvs, 'new_uv_signatures': new_uvs,
        'opaque_groups': len(full_groups), 'new_uv_groups': len(new_uvs),
        'texels': sum(g['full_diffuse_resolution'] ** 2 for g in manifest['groups'] if g['full_diffuse_enabled']),
        'passes': ['DIRECT', 'INDIRECT'], 'contains_albedo': False, 'contains_emission': False,
        'seconds': round(time.perf_counter() - started, 2)}
    manifest['runtime']['full_diffuse'] = {
        'stored_quantity': 'Scene-linear Cycles white diffuse radiance (no albedo), direct + indirect.',
        'diffuse_irradiance_multiplier': 'PI before BRDF_Lambert(material.diffuseColor).',
        'live_diffuse': 'Disabled only on full_diffuse_enabled source meshes.',
        'live_specular': 'Preserve all direct/IBL specular, clearcoat, sheen and emission.',
        'new_geometry': 'New forests, foreground props and dynamic actors retain live lighting.'}
    save_json(MANIFEST, manifest)
    save_json(PROVENANCE, {'stage': manifest['stage'], 'source': original['source'],
                           'prepare': manifest['full_diffuse_prepare'], 'preserved_files': preserved,
                           'scene_camera_projection_used': False})
    verify_preserved(preserved)
    emit('prepared', **manifest['full_diffuse_prepare'])


def activate_target(obj, image):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    material = obj.data.materials[0]
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    material.node_tree.nodes.active = node
    return node


def filter_radiance(image, normal_image, obj, key, resolution):
    working = bpy.context.scene
    scene = bpy.data.scenes.new('Full diffuse UV filtering / ' + key)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.cycles.device = 'CPU'
    scene.render.resolution_x = scene.render.resolution_y = 1
    scene.render.resolution_percentage = 100
    camera_data = bpy.data.cameras.new('Empty full-diffuse filtering camera')
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.use_nodes = True
    nodes, links = scene.node_tree.nodes, scene.node_tree.links
    nodes.clear()
    source = nodes.new('CompositorNodeImage'); source.image = image
    normal = nodes.new('CompositorNodeImage'); normal.image = normal_image
    denoise = nodes.new('CompositorNodeDenoise'); denoise.prefilter = 'ACCURATE'
    links.new(source.outputs['Image'], denoise.inputs['Image'])
    links.new(normal.outputs['Image'], denoise.inputs['Normal'])
    albedo = nodes.new('CompositorNodeImage')
    albedo_path = base.TEXTURES / (key + '-albedo.png')
    if albedo_path.exists():
        guide = bpy.data.images.load(str(albedo_path), check_existing=False)
        guide.colorspace_settings.name = 'sRGB'
    else:
        guide = bpy.data.images.new('Constant source albedo guide / ' + key,
                                    width=resolution, height=resolution, alpha=False, float_buffer=True)
        guide.colorspace_settings.name = 'Non-Color'
        shader = base.principal(obj.data.materials[0])
        if shader.inputs['Base Color'].is_linked:
            raise RuntimeError('An untextured guide unexpectedly has procedural source color: ' + key)
        guide.generated_color = shader.inputs['Base Color'].default_value
    albedo.image = guide
    links.new(albedo.outputs['Image'], denoise.inputs['Albedo'])
    MASTERS.mkdir(parents=True, exist_ok=True)
    output = nodes.new('CompositorNodeOutputFile')
    output.base_path = str(MASTERS)
    output.file_slots[0].path = key + '-radiance-'
    output.format.file_format = 'OPEN_EXR'; output.format.color_mode = 'RGB'; output.format.color_depth = '32'
    links.new(denoise.outputs['Image'], output.inputs[0])
    composite = nodes.new('CompositorNodeComposite')
    links.new(denoise.outputs['Image'], composite.inputs['Image'])
    bpy.context.window.scene = scene
    bpy.ops.render.render()
    bpy.context.window.scene = working
    master = MASTERS / (key + '-radiance-0001.exr')
    filtered = bpy.data.images.load(str(master), check_existing=False)
    filtered.colorspace_settings.name = 'Non-Color'
    if tuple(filtered.size) != (resolution, resolution):
        raise RuntimeError('Filtering changed the atlas dimensions.')
    pixels = np.empty(resolution * resolution * 4, dtype=np.float32)
    filtered.pixels.foreach_get(pixels)
    np.maximum(pixels, 0, out=pixels)
    image.pixels.foreach_set(pixels)
    bpy.data.images.remove(filtered); bpy.data.images.remove(guide); bpy.data.scenes.remove(scene)
    return master


def bake_group(obj, group, resolution, samples, artifact_hash):
    key = group['key']
    signature = hashlib.sha256((base.bake_signature(obj) + artifact_hash + str(resolution) + str(samples) + 'FULL_DIRECT_INDIRECT_NO_COLOR_V1').encode()).hexdigest()
    TEXTURES.mkdir(parents=True, exist_ok=True)
    sidecar = TEXTURES / (key + '-full-diffuse.json')
    if sidecar.exists():
        cached = read_json(sidecar)
        if (cached.get('signature') == signature and base.digest(ROOT / cached['file']) == cached['sha256']
                and base.digest(ROOT / cached['runtime']['file']) == cached['runtime']['sha256']):
            emit('cached', group=key)
            return cached
    started = time.perf_counter()
    scene = bpy.context.scene
    image = bpy.data.images.new('Full diffuse radiance / ' + key, width=resolution,
                                height=resolution, alpha=False, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    node = activate_target(obj, image)
    scene.cycles.samples = samples
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True, margin=12)
    obj.data.materials[0].node_tree.nodes.remove(node)
    normal = bpy.data.images.new('Full diffuse world normal guide / ' + key,
                                 width=resolution, height=resolution, alpha=False, float_buffer=True)
    normal.colorspace_settings.name = 'Non-Color'
    node = activate_target(obj, normal)
    scene.cycles.samples = 1
    scene.render.bake.normal_space = 'OBJECT'  # Evaluated meshes are in identity/world coordinates.
    bpy.ops.object.bake(type='NORMAL', use_clear=True, margin=12)
    obj.data.materials[0].node_tree.nodes.remove(node)
    normals = np.empty(resolution * resolution * 4, dtype=np.float32)
    normal.pixels.foreach_get(normals)
    normals = normals.reshape(-1, 4)
    normals[:, :3] = normals[:, :3] * 2 - 1
    lengths = np.linalg.norm(normals[:, :3], axis=1)
    normals[:, :3] /= np.maximum(lengths[:, None], 1e-6)
    normal.pixels.foreach_set(normals.ravel())
    master = filter_radiance(image, normal, obj, key, resolution)
    bpy.data.images.remove(normal)
    path = TEXTURES / (key + '-full-diffuse.hdr')
    image.filepath_raw = str(path); image.file_format = 'HDR'; image.save()
    pixels = np.empty(resolution * resolution * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(resolution, resolution, 4)
    if not np.isfinite(pixels).all():
        raise RuntimeError('Full diffuse filtering produced a non-finite texel: ' + key)
    peak = float(pixels[:, :, :3].max())
    if peak > 65504:
        raise RuntimeError('Full diffuse radiance exceeds the half-float runtime range.')
    pixels[:, :, 3] = 1
    # Blender image buffers are bottom-first. HDRLoader and glTF flipY=false
    # use top-first input rows, so preserve exactly that runtime orientation.
    runtime_bytes = np.asarray(pixels[::-1], dtype='<f2').tobytes()
    compressed = gzip.compress(runtime_bytes, compresslevel=6, mtime=0)
    runtime = path.with_suffix('.rgba16f.gz'); runtime.write_bytes(compressed)
    result = {'file': 'textures/full-diffuse/' + path.name, 'sha256': base.digest(path),
              'bytes': path.stat().st_size, 'resolution': [resolution, resolution],
              'samples': samples, 'signature': signature,
              'passes': ['DIRECT', 'INDIRECT'], 'contains_albedo': False, 'contains_emission': False,
              'encoding': 'RGBE scene-linear white diffuse radiance', 'radiance_scale': 1,
              'denoising': 'OIDN ACCURATE; source albedo and evaluated world-normal guides; no PBR master altered.',
              'master': {'file': 'artifacts/full-diffuse-masters/' + master.name, 'sha256': base.digest(master)},
              'runtime': {'file': 'textures/full-diffuse/' + runtime.name, 'sha256': base.digest(runtime),
                          'raw_sha256': hashlib.sha256(runtime_bytes).hexdigest(),
                          'type': 'RGBA16F_LE', 'channels': 4, 'width': resolution, 'height': resolution,
                          'bytes': len(compressed), 'raw_bytes': len(runtime_bytes),
                          'row_order': 'top-first, matching HDRLoader; flipY=false',
                          'source': 'Filtered scene-linear float before RGBE quantization'},
              'radiance_peak': peak, 'radiance_mean': pixels[:, :, :3].mean(axis=(0, 1)).tolist(),
              'seconds': round(time.perf_counter() - started, 2)}
    save_json(sidecar, result)
    bpy.data.images.remove(image)
    emit('baked', group=key, **result)
    return result


def bake(options):
    started = time.perf_counter()
    manifest = read_json(MANIFEST)
    prepared = manifest['full_diffuse_prepare']
    if base.digest(ARTIFACT) != prepared['artifact_sha256']:
        raise RuntimeError('Full-diffuse prepared geometry/UV/lighting changed.')
    bpy.ops.wm.open_mainfile(filepath=str(ARTIFACT))
    devices = base.configure_cycles(bpy.context.scene, options.samples)
    selected = set(options.groups.split(',')) if options.groups else None
    for group in manifest['groups']:
        if not group['full_diffuse_enabled'] or selected is not None and group['key'] not in selected:
            continue
        resolution = options.resolution or group['full_diffuse_resolution']
        result = bake_group(bpy.data.objects[group['mesh']], group, resolution, options.samples, prepared['artifact_sha256'])
        group.setdefault('textures', {})['full_diffuse'] = result
        save_json(MANIFEST, manifest)
        if PAUSE.exists():
            emit('paused', completed_group=group['key'], flag=str(PAUSE))
            while PAUSE.exists():
                time.sleep(.5)
            emit('resumed', completed_group=group['key'])
        # A saved group is an interruption boundary. The GPU is already idle
        # during OIDN/compression, and this yield also keeps orchestration quiet.
        time.sleep(.2)
    complete = all(not g['full_diffuse_enabled'] or g.get('textures', {}).get('full_diffuse') for g in manifest['groups'])
    manifest['stage'] = 'full-diffuse-baked-awaiting-packaging' if complete else 'full-diffuse-partially-baked'
    manifest['full_diffuse_bake'] = {'devices': devices, 'samples': options.samples,
                                    'seconds_this_run': round(time.perf_counter() - started, 2),
                                    'source_lighting': 'Original Cycles World +20 source lights, not runtime proxy spots.',
                                    'bake_type': 'DIFFUSE', 'pass_filter': ['DIRECT', 'INDIRECT'],
                                    'contains_color': False, 'scene_camera_render_used': False}
    save_json(MANIFEST, manifest)
    emit('stage_complete', stage=manifest['stage'], seconds=manifest['full_diffuse_bake']['seconds_this_run'])


def finalize(options):
    manifest = read_json(MANIFEST)
    verify_preserved(manifest['preserved_files'])
    for group in manifest['groups']:
        if not group['full_diffuse_enabled']:
            continue
        descriptor = group.get('textures', {}).get('full_diffuse')
        if not descriptor or descriptor['resolution'] != [group['full_diffuse_resolution']] * 2:
            raise RuntimeError('Missing final-size full diffuse map for ' + group['key'])
        for item in [descriptor, descriptor['runtime']]:
            if base.digest(ROOT / item['file']) != item['sha256']:
                raise RuntimeError('Full diffuse cache checksum mismatch.')
        runtime = descriptor['runtime']
        raw = gzip.decompress((ROOT / runtime['file']).read_bytes())
        if len(raw) != runtime['width'] * runtime['height'] * 8 or hashlib.sha256(raw).hexdigest() != runtime['raw_sha256']:
            raise RuntimeError('Full diffuse decoded texel checksum mismatch: ' + group['key'])
        texels = np.frombuffer(raw, dtype='<f2').reshape(-1, 4)
        if not np.isfinite(texels).all() or np.any(texels[:, :3] < 0) or not np.all(texels[:, 3] == 1):
            raise RuntimeError('Invalid full diffuse half-float texels: ' + group['key'])
    bpy.ops.wm.open_mainfile(filepath=str(ARTIFACT))
    base.export_runtime(manifest, stem='quality-canal-full-diffuse',
                        texture_staging='gltf-full-diffuse-textures', packed_subdir='gltf-full-diffuse')
    # Constant-color source groups previously needed no UVs. Their freshly
    # prepared atlases must survive glTF export, despite having no PBR texture.
    asset_bytes = (ROOT / manifest['asset']['file']).read_bytes()
    json_length = int.from_bytes(asset_bytes[12:16], 'little')
    document = json.loads(asset_bytes[20:20 + json_length])
    full_materials = {'Quality / ' + group['key'] for group in manifest['groups'] if group['full_diffuse_enabled']}
    mapped_materials = set()
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            name = document['materials'][primitive['material']]['name']
            if name not in full_materials:
                continue
            if 'TEXCOORD_0' not in primitive['attributes']:
                raise RuntimeError('A full diffuse mesh lost UV0 during glTF export: ' + name)
            mapped_materials.add(name)
    if mapped_materials != full_materials:
        raise RuntimeError('Full diffuse glTF material coverage mismatch.')
    verify_preserved(manifest['preserved_files'])
    for group in manifest['groups']:
        if group['key'] in manifest['full_diffuse_prepare']['existing_uv_signatures']:
            if base.bake_signature(bpy.data.objects[group['mesh']]) != manifest['full_diffuse_prepare']['existing_uv_signatures'][group['key']]:
                raise RuntimeError('An existing PBR UV layout changed.')
    manifest['stage'] = 'baked'
    manifest['runtime']['lightmap'] = 'Full direct + indirect scene-linear white diffuse radiance, no albedo or emission; all24 static opaque source groups.'
    manifest['validation'] = {'source_007_unchanged': True, 'existing_assets_and_masters_unchanged': True,
                               'existing_pbr_uvs_unchanged': True, 'all_opaque_source_groups_lightmapped': True,
                               'all_full_diffuse_glb_meshes_have_uv0': True,
                               'all_decoded_half_float_texels_finite_nonnegative': True,
                               'visual_acceptance': 'Requires actual composed scene review after binding this version.'}
    save_json(MANIFEST, manifest)
    save_json(PROVENANCE, {'stage': 'baked', 'lightingMode': 'full-diffuse',
                           'prepare': manifest['full_diffuse_prepare'], 'bake': manifest['full_diffuse_bake'],
                           'asset': manifest['asset'], 'validation': manifest['validation'],
                           'preserved_files': manifest['preserved_files'], 'scene_camera_projection_used': False})
    emit('finalized', asset=manifest['asset']['file'], bytes=manifest['asset']['bytes'],
         groups=manifest['full_diffuse_prepare']['opaque_groups'], validation=manifest['validation'])


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--prepare', action='store_true'); mode.add_argument('--bake', action='store_true'); mode.add_argument('--finalize', action='store_true')
    parser.add_argument('--groups'); parser.add_argument('--samples', type=int, default=64); parser.add_argument('--resolution', type=int)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if options.prepare: prepare(options)
    elif options.bake: bake(options)
    else: finalize(options)


if __name__ == '__main__':
    main()
