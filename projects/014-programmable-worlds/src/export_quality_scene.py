"""Immutable 007 -> evaluated, textured 014 canal asset.

Run with Blender --background --factory-startup --python this_file -- --prepare.
Preparation is CPU only. --bake is a separate, explicitly scheduled GPU stage.
The source .blend is never saved or changed. This is geometry/UV baking, never
a camera render or a photograph projected onto a backdrop.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import sys
import time

import bpy
import numpy as np
from mathutils import Vector


PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT.parent / '007-canal-blender-test/artifacts/rainy-canal-v4.blend'
ARTIFACT = PROJECT / 'artifacts/quality-canal-evaluated.blend'
ROOT = PROJECT / 'web/shared-scene'
MODELS = ROOT / 'models'
TEXTURES = ROOT / 'textures'
MANIFEST = ROOT / 'manifest.json'
PROVENANCE = ROOT / 'provenance.json'
PAUSE_FILE = PROJECT / 'artifacts/quality-bake.pause'
BAKED = {'plaster', 'plaster_alt', 'stone', 'stone_light', 'mortar', 'paving',
         'paving_alt', 'wood', 'wood_light', 'teal', 'olive', 'fabric', 'roof',
         'roof_alt', 'terracotta'}
LARGE = {'plaster', 'plaster_alt', 'stone', 'stone_light', 'paving', 'paving_alt',
         'wood', 'wood_light', 'roof', 'roof_alt'}
ATTR_OBJECT = 'quality_original_object'
ATTR_GENERATED = 'quality_original_generated'
BAKE_PIPELINE_VERSION = 2
_source_hash_cache = None


def digest(path):
    hasher = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            hasher.update(block)
    return hasher.hexdigest()


def emit(event, **data):
    print('QUALITY_' + event.upper(), json.dumps(data, ensure_ascii=False), flush=True)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')


def wait_at_checkpoint(group, kind):
    if not PAUSE_FILE.exists():
        return
    emit('paused', group=group, last_completed_pass=kind, flag=str(PAUSE_FILE))
    while PAUSE_FILE.exists():
        time.sleep(0.5)
    emit('resumed', group=group, last_completed_pass=kind)


def gltf_vector(value):
    return [float(value[0]), float(value[2]), -float(value[1])]


def principal(material):
    return next((node for node in material.node_tree.nodes
                 if node.bl_idname == 'ShaderNodeBsdfPrincipled'), None)


def scalar(shader, name, default):
    if shader is None or name not in shader.inputs:
        return default
    socket = shader.inputs[name]
    if socket.is_linked:
        node = socket.links[0].from_node
        if node.bl_idname == 'ShaderNodeMapRange':
            return float((node.inputs['To Min'].default_value + node.inputs['To Max'].default_value) / 2)
    return float(socket.default_value)


def source_description(scene):
    modifiers = Counter(mod.type for obj in scene.objects for mod in obj.modifiers
                        if mod.show_render and obj.type in {'MESH', 'CURVE'})
    lights = []
    for obj in scene.objects:
        if obj.type != 'LIGHT':
            continue
        data = obj.data
        lights.append({'name': obj.name, 'type': data.type,
                       'position': gltf_vector(obj.matrix_world.translation),
                       'direction': gltf_vector(obj.matrix_world.to_quaternion() @ Vector((0, 0, -1))),
                       'color_linear': list(data.color), 'energy_watts': data.energy,
                       'size_m': float(getattr(data, 'size', getattr(data, 'shadow_soft_size', 0))),
                       'shape': getattr(data, 'shape', None)})
    return {'objects': len(scene.objects), 'mesh_objects': sum(o.type == 'MESH' for o in scene.objects),
            'curve_objects': sum(o.type == 'CURVE' for o in scene.objects),
            'render_modifiers': dict(modifiers), 'lights': lights,
            'color_management': {'view_transform': scene.view_settings.view_transform,
                                 'look': scene.view_settings.look,
                                 'exposure': scene.view_settings.exposure,
                                 'gamma': scene.view_settings.gamma}}


def preserve_procedural_coordinates(material):
    """Merging must not turn object-space grain into a single scene-sized texture."""
    if not material.use_nodes:
        return
    nodes, links = material.node_tree.nodes, material.node_tree.links
    attributes = {}
    for name in (ATTR_OBJECT, ATTR_GENERATED):
        node = nodes.new('ShaderNodeAttribute')
        node.attribute_name = name
        node.name = name
        attributes[name] = node.outputs['Vector']
    for node in list(nodes):
        if node.bl_idname == 'ShaderNodeTexCoord':
            for output, attr in [('Object', ATTR_OBJECT), ('Generated', ATTR_GENERATED)]:
                for link in list(node.outputs[output].links):
                    links.new(attributes[attr], link.to_socket)
        elif node.bl_idname.startswith('ShaderNodeTex') and 'Vector' in node.inputs:
            # Procedural textures' unconnected vectors implicitly use Generated.
            if node.bl_idname not in {'ShaderNodeTexImage', 'ShaderNodeTexEnvironment'} and not node.inputs['Vector'].is_linked:
                links.new(attributes[ATTR_GENERATED], node.inputs['Vector'])


def make_uv(obj, resolution):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    obj.data.uv_layers.new(name='QualityAtlas')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    # Explicit pixel padding, unlike the former 0.02 relative island margin.
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0,
                             area_weight=1.0, correct_aspect=True, scale_to_bounds=True)
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='FRACTION',
                            margin=5.0 / resolution, shape_method='AABB')
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh = obj.data
    uv = mesh.uv_layers.active.data
    areas = []
    world_areas = []
    for polygon in mesh.polygons:
        loops = polygon.loop_indices
        points = [uv[index].uv for index in loops]
        area = abs(sum(points[i].x * points[(i + 1) % len(points)].y -
                       points[(i + 1) % len(points)].x * points[i].y
                       for i in range(len(points)))) / 2
        areas.append(area)
        world_areas.append(polygon.area)
    arr = np.asarray(areas)
    return {'resolution': [resolution, resolution], 'padding_pixels': 5,
            'uv_coverage': round(float(arr.sum()), 6),
            'triangle_texel_area_percentiles': [round(float(v), 4) for v in np.percentile(arr * resolution ** 2, [0, 10, 50, 90, 100])],
            'surface_area_m2': round(sum(world_areas), 3),
            'degenerate_uv_triangles': int(np.sum(arr < 1e-12))}


def prepare(options):
    started = time.perf_counter()
    source_hash = digest(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    source_scene = bpy.context.scene
    description = source_description(source_scene)
    # The depsgraph evaluates every render-visible modifier, including bevels.
    for obj in source_scene.objects:
        for mod in obj.modifiers:
            mod.show_viewport = mod.show_render
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    materials = {m.name: m.copy() for m in list(bpy.data.materials)}
    for name, material in materials.items():
        material.name = 'Source bake / ' + name
        preserve_procedural_coordinates(material)
    batches = {}
    included = 0
    for obj in source_scene.objects:
        if obj.type not in {'MESH', 'CURVE', 'SURFACE', 'FONT'} or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
        if mesh is None:
            continue
        mesh.calc_loop_triangles()
        matrix = obj.matrix_world
        normal_matrix = matrix.to_3x3().inverted().transposed()
        reverse = matrix.determinant() < 0
        world = [matrix @ v.co for v in mesh.vertices]
        local = [tuple(v.co) for v in mesh.vertices]
        if local:
            minima = [min(v[axis] for v in local) for axis in range(3)]
            extents = [max(v[axis] for v in local) - minima[axis] for axis in range(3)]
        vertex_maps = {}
        for triangle in mesh.loop_triangles:
            source_mat = mesh.materials[triangle.material_index] if triangle.material_index < len(mesh.materials) else None
            name = source_mat.name if source_mat else 'Unassigned'
            center_x = sum(world[i].x for i in triangle.vertices) / 3
            center_y = sum(world[i].y for i in triangle.vertices) / 3
            # Long canal continuation must not steal UV density from the shops.
            zone = 'distant' if center_x > 31 or center_y > 20 or center_y < -34 else 'near'
            key = name + ('__distant' if zone == 'distant' and name in BAKED else '')
            if key not in batches:
                batches[key] = {'vertices': [], 'faces': [], 'normals': [], 'smooth': [],
                                'original': [], 'generated': [], 'source': name, 'zone': zone,
                                'objects': set()}
            batch = batches[key]
            batch['objects'].add(obj.name)
            vertex_map = vertex_maps.setdefault(key, {})
            face, normals = [], []
            vertex_indices = list(triangle.vertices)
            loop_indices = list(triangle.loops)
            if reverse:
                vertex_indices.reverse()
                loop_indices.reverse()
            for index, loop in zip(vertex_indices, loop_indices):
                if index not in vertex_map:
                    vertex_map[index] = len(batch['vertices'])
                    batch['vertices'].append(tuple(world[index]))
                    batch['original'].append(local[index])
                    batch['generated'].append(tuple((local[index][a] - minima[a]) / extents[a]
                                                     if extents[a] > 1e-10 else 0 for a in range(3)))
                face.append(vertex_map[index])
                normals.append(tuple((normal_matrix @ mesh.corner_normals[loop].vector).normalized()))
            batch['faces'].append(face)
            batch['normals'].extend(normals)
            batch['smooth'].append(mesh.polygons[triangle.polygon_index].use_smooth)
        evaluated.to_mesh_clear()
        included += 1
        if included % 300 == 0:
            emit('evaluated', objects=included)
    scene = bpy.data.scenes.new('Quality canal evaluated - editable working copy')
    scene.world = source_scene.world.copy()
    scene.render.engine = 'CYCLES'
    scene.view_settings.view_transform = source_scene.view_settings.view_transform
    scene.view_settings.look = source_scene.view_settings.look
    scene.view_settings.exposure = source_scene.view_settings.exposure
    bpy.context.window.scene = scene
    for obj in source_scene.objects:
        if obj.type in {'LIGHT', 'CAMERA'}:
            copy = obj.copy()
            copy.data = obj.data.copy()
            scene.collection.objects.link(copy)
            if obj == source_scene.camera:
                scene.camera = copy
    groups = []
    for key, batch in sorted(batches.items()):
        mesh = bpy.data.meshes.new('Evaluated / ' + key)
        mesh.from_pydata(batch['vertices'], [], batch['faces'])
        mesh.update()
        for polygon, smooth in zip(mesh.polygons, batch['smooth']):
            polygon.use_smooth = smooth
        mesh.normals_split_custom_set(batch['normals'])
        for name, values in [(ATTR_OBJECT, batch['original']), (ATTR_GENERATED, batch['generated'])]:
            attribute = mesh.attributes.new(name=name, type='FLOAT_VECTOR', domain='POINT')
            attribute.data.foreach_set('vector', np.asarray(values, dtype=np.float32).ravel())
        mesh.materials.append(materials.get(batch['source']) or next(iter(materials.values())))
        obj = bpy.data.objects.new('Quality / ' + key, mesh)
        scene.collection.objects.link(obj)
        obj['quality_group'] = key
        obj['source_material'] = batch['source']
        resolution = 1024 if key.endswith('__distant') else (3072 if batch['source'] in LARGE else 2048)
        obj['texture_resolution'] = resolution
        obsolete = (key.endswith('__distant') or batch['source'].startswith('Distant ')
                    or batch['source'] in {'soil', 'Canal water'})
        group = {'key': key, 'mesh': obj.name, 'source_material': batch['source'],
                 'vertices': len(mesh.vertices), 'triangles': len(mesh.polygons),
                 'source_objects': len(batch['objects']),
                 'runtime_export': not obsolete,
                 'baked': batch['source'] in BAKED and not obsolete,
                 'resolution': resolution}
        if group['baked']:
            group['uv'] = make_uv(obj, resolution)
        groups.append(group)
        emit('prepared_group', **group)
    # A copy of the world is an exact source-derived procedural environment.
    source_hdr = PROJECT.parent / '007-canal-blender-test/web/textures/lookdev-v4-world.hdr'
    TEXTURES.mkdir(parents=True, exist_ok=True)
    if source_hdr.exists():
        shutil.copy2(source_hdr, TEXTURES / 'quality-world.hdr')
    ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
    # Save a fresh 014 file; old scenes retained in this file are non-exported provenance.
    bpy.ops.wm.save_as_mainfile(filepath=str(ARTIFACT), check_existing=False)
    manifest = {'schema_version': 1, 'stage': 'prepared-awaiting-bake',
                'prepared_blend': {'file': 'artifacts/quality-canal-evaluated.blend',
                                   'sha256': digest(ARTIFACT), 'bytes': ARTIFACT.stat().st_size},
                'source': {'path': str(SOURCE), 'sha256': source_hash, **description},
                'geometry': {'source_objects_evaluated': included,
                             'evaluated_render_modifiers': description['render_modifiers'],
                             'omitted_modifier_types': {},
                             'groups': len(groups), 'vertices': sum(g['vertices'] for g in groups),
                             'triangles': sum(g['triangles'] for g in groups),
                             'normals': 'Evaluated source corner normals transformed by inverse transpose; custom split normals retained.'},
                'groups': groups, 'prepare_seconds': round(time.perf_counter() - started, 2),
                'runtime': {'uv_channel': 0, 'lightmap': 'indirect-only scene-linear diffuse radiance without albedo',
                            'direct_lights': 'Use live direct lighting/shadows; source light transforms are listed above.',
                            'material_prefix': 'Quality / ', 'environment': 'textures/quality-world.hdr'},
                'limitations': ['No GPU bakes have run at the prepared stage.',
                                'Water is a separate live continuous river; the original long flat water/soil meshes remain only in the editable working blend.',
                                'The unfinished source background is preserved; composition/landscape refinement belongs to the runtime scene.']}
    export_runtime(manifest)
    write_json(MANIFEST, manifest)
    if digest(SOURCE) != source_hash:
        raise RuntimeError('Preserved source changed.')
    write_json(PROVENANCE, {'source': str(SOURCE), 'source_sha256': source_hash,
                           'source_unchanged': True, 'asset_script': 'src/export_quality_scene.py',
                           'prepared_blend': 'artifacts/quality-canal-evaluated.blend',
                           'bevels_preserved': description['render_modifiers'].get('BEVEL', 0),
                           'camera_image_used_as_texture': False,
                           'stage': manifest['stage']})
    emit('prepare_complete', **manifest['geometry'], seconds=manifest['prepare_seconds'])


def configure_cycles(scene, samples):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.max_bounces = 8
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 4
    scene.cycles.transmission_bounces = 8
    scene.cycles.use_denoising = False  # Bake pass is saved unfiltered; details never blurred.
    preferences = bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type = 'OPTIX'
    preferences.get_devices()
    devices = []
    for device in preferences.devices:
        device.use = device.type == 'OPTIX'
        if device.use:
            devices.append(device.name)
    scene.cycles.device = 'GPU' if devices else 'CPU'
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 12
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '16'
    return devices


def denoise_indirect(image, key, resolution):
    """OIDN on UV irradiance, guided by source albedo, without touching PBR detail.

    A 1x1 empty CPU render executes the compositor. There is no scene-camera
    render hidden in this step, and EXR keeps the compositor output linear.
    """
    working = bpy.context.scene
    scene = bpy.data.scenes.new('Indirect atlas filtering / ' + key)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.cycles.device = 'CPU'
    scene.render.resolution_x = 1
    scene.render.resolution_y = 1
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    camera_data = bpy.data.cameras.new('Empty filtering camera / ' + key)
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.use_nodes = True
    nodes, links = scene.node_tree.nodes, scene.node_tree.links
    nodes.clear()
    source = nodes.new('CompositorNodeImage')
    source.image = image
    denoise = nodes.new('CompositorNodeDenoise')
    denoise.prefilter = 'ACCURATE'
    links.new(source.outputs['Image'], denoise.inputs['Image'])
    albedo_path = TEXTURES / f'{key}-albedo.png'
    guide_image = None
    if albedo_path.exists():
        guide_image = bpy.data.images.load(str(albedo_path), check_existing=False)
        guide_image.colorspace_settings.name = 'sRGB'
        guide = nodes.new('CompositorNodeImage')
        guide.image = guide_image
        links.new(guide.outputs['Image'], denoise.inputs['Albedo'])
    folder = PROJECT / 'artifacts/bake-work'
    folder.mkdir(parents=True, exist_ok=True)
    output = nodes.new('CompositorNodeOutputFile')
    output.base_path = str(folder)
    output.file_slots[0].path = key + '-indirect-filtered-'
    output.format.file_format = 'OPEN_EXR'
    output.format.color_mode = 'RGB'
    output.format.color_depth = '32'
    links.new(denoise.outputs['Image'], output.inputs[0])
    composite = nodes.new('CompositorNodeComposite')
    links.new(denoise.outputs['Image'], composite.inputs['Image'])
    bpy.context.window.scene = scene
    bpy.ops.render.render()
    bpy.context.window.scene = working
    filtered_path = folder / (key + '-indirect-filtered-0001.exr')
    filtered = bpy.data.images.load(str(filtered_path), check_existing=False)
    filtered.colorspace_settings.name = 'Non-Color'
    if tuple(filtered.size) != (resolution, resolution):
        raise RuntimeError('Denoised atlas resolution changed.')
    pixels = np.empty(resolution * resolution * 4, dtype=np.float32)
    filtered.pixels.foreach_get(pixels)
    # Denoisers can have tiny negative overshoots around black atlas boundaries.
    np.maximum(pixels, 0, out=pixels)
    image.pixels.foreach_set(pixels)
    bpy.data.images.remove(filtered)
    if guide_image:
        bpy.data.images.remove(guide_image)
    bpy.data.scenes.remove(scene)


def bake_signature(obj):
    global _source_hash_cache
    if _source_hash_cache is None:
        _source_hash_cache = digest(SOURCE)
    hasher = hashlib.sha256((_source_hash_cache + str(BAKE_PIPELINE_VERSION)).encode('ascii'))
    for collection, width, property_name in [(obj.data.vertices, 3, 'co'),
                                               (obj.data.uv_layers.active.data, 2, 'uv')]:
        values = np.empty(len(collection) * width, dtype=np.float32)
        collection.foreach_get(property_name, values)
        hasher.update(values.tobytes())
    return hasher.hexdigest()


def bake_map(obj, key, kind, resolution, samples):
    path = TEXTURES / f'{key}-{kind}.png'
    # Metadata is required alongside a radiance map: a file alone loses its scale.
    sidecar = path.with_suffix('.json')
    signature = bake_signature(obj)
    if path.exists() and sidecar.exists():
        result = json.loads(sidecar.read_text(encoding='utf-8'))
        existing = ROOT / result['file']
        if (result['resolution'] == [resolution, resolution] and existing.exists()
                and result['sha256'] == digest(existing)
                and result.get('bake_signature') == signature
                and (kind != 'indirect' or result.get('denoising'))):
            if kind == 'indirect' and result.get('encoding') != 'RGBE scene-linear':
                result = publish_indirect_hdr(path, result)
                write_json(sidecar, result)
            return {**result, 'cached': True}
    scene = bpy.context.scene
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    material = obj.data.materials[0]
    nodes, links = material.node_tree.nodes, material.node_tree.links
    image = bpy.data.images.new('Quality bake / ' + key + ' / ' + kind,
                                width=resolution, height=resolution, alpha=False, float_buffer=True)
    image.colorspace_settings.name = 'sRGB' if kind == 'albedo' else 'Non-Color'
    image.generated_color = (0.5, 0.5, 1, 1) if kind == 'normal' else (0, 0, 0, 1)
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    nodes.active = target
    shader = principal(material)
    output = next(n for n in nodes if n.bl_idname == 'ShaderNodeOutputMaterial')
    original_surface = output.inputs['Surface'].links[0].from_socket if output.inputs['Surface'].is_linked else None
    temporary = []
    started = time.perf_counter()
    scene.cycles.samples = samples if kind == 'indirect' else 1
    if kind in {'albedo', 'roughness', 'coat', 'coat-roughness'}:
        socket_name = {'albedo': 'Base Color', 'roughness': 'Roughness', 'coat': 'Coat Weight', 'coat-roughness': 'Coat Roughness'}[kind]
        socket = shader.inputs[socket_name]
        emission = nodes.new('ShaderNodeEmission')
        temporary.append(emission)
        if socket.is_linked:
            links.new(socket.links[0].from_socket, emission.inputs['Color'])
        else:
            value = socket.default_value
            emission.inputs['Color'].default_value = tuple(value) if kind == 'albedo' else (value, value, value, 1)
        links.new(emission.outputs[0], output.inputs['Surface'])
        bpy.ops.object.bake(type='EMIT', use_clear=True, margin=12)
    elif kind == 'normal':
        scene.render.bake.normal_space = 'TANGENT'
        scene.render.bake.normal_r = 'POS_X'
        scene.render.bake.normal_g = 'POS_Y'
        scene.render.bake.normal_b = 'POS_Z'
        bpy.ops.object.bake(type='NORMAL', use_clear=True, margin=12)
    elif kind == 'indirect':
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'INDIRECT'}, use_clear=True, margin=12)
    if original_surface:
        links.new(original_surface, output.inputs['Surface'])
    for node in temporary:
        nodes.remove(node)
    if kind == 'indirect':
        denoise_indirect(image, key, resolution)
    radiance_scale = 1.0
    pixel_summary = None
    if kind == 'indirect':
        # PNG is portable in the runtime, but radiance is not restricted to 0..1.
        # Store normalized scene-linear radiance and publish its exact multiplier.
        pixels = np.empty(resolution * resolution * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        pixels = pixels.reshape(-1, 4)
        peak = float(np.max(pixels[:, :3]))
        if peak > 1:
            radiance_scale = float(2 ** math.ceil(math.log2(peak)))
            pixels[:, :3] /= radiance_scale
            image.pixels.foreach_set(pixels.ravel())
        pixel_summary = {'peak_scene_linear': peak,
                         'rgb_mean_scene_linear': [float(v) * radiance_scale for v in pixels[:, :3].mean(axis=0)]}
    image.filepath_raw = str(path)
    image.file_format = 'PNG'
    image.save()
    nodes.remove(target)
    bpy.data.images.remove(image)
    result = {'file': 'textures/' + path.name, 'sha256': digest(path), 'bytes': path.stat().st_size,
              'resolution': [resolution, resolution], 'samples': samples if kind == 'indirect' else 1,
              'seconds': round(time.perf_counter() - started, 2),
              'color_space': 'sRGB' if kind == 'albedo' else 'linear / Non-Color'}
    result['bake_signature'] = signature
    if kind == 'indirect':
        result['radiance_scale'] = radiance_scale
        result['radiance_summary'] = pixel_summary
        result['denoising'] = 'OpenImageDenoise, ACCURATE prefilter, linear irradiance + source albedo guide; PBR albedo/normal/roughness are unfiltered.'
        result = publish_indirect_hdr(path, result)
    write_json(sidecar, result)
    emit('baked_map', group=key, kind=kind, **result)
    return result


def publish_indirect_hdr(path, result):
    """Preserve dim indirect-light gradients beyond HTMLImageElement's 8 bits."""
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = 'Non-Color'
    resolution = int(image.size[0])
    pixels = np.empty(resolution * resolution * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(-1, 4)
    diagnostic_scale = result.get('radiance_scale', 1)
    pixels[:, :3] *= diagnostic_scale
    image.pixels.foreach_set(pixels.ravel())
    hdr = path.with_suffix('.hdr')
    image.filepath_raw = str(hdr)
    image.file_format = 'HDR'
    image.save()
    bpy.data.images.remove(image)
    return {**result, 'file': 'textures/' + hdr.name,
            'sha256': digest(hdr), 'bytes': hdr.stat().st_size,
            'encoding': 'RGBE scene-linear', 'radiance_scale': 1,
            'color_space': 'linear RGBE; use RGBELoader / HalfFloat DataTexture',
            'diagnostic_png': {'file': 'textures/' + path.name,
                               'sha256': digest(path), 'radiance_scale': diagnostic_scale,
                               'encoding': 'linear RGB16 PNG; not the browser runtime source'}}


def runtime_material(obj, group):
    source = obj.data.materials[0]
    original = principal(source)
    material = bpy.data.materials.new('Quality / ' + group['key'])
    material.use_nodes = True
    material['source_material'] = group['source_material']
    shader = principal(material)
    color = source.diffuse_color
    if original and not original.inputs['Base Color'].is_linked:
        color = original.inputs['Base Color'].default_value
    shader.inputs['Base Color'].default_value = color
    for name, fallback in [('Roughness', .65), ('Metallic', 0), ('IOR', 1.5),
                           ('Specular IOR Level', .5),
                           ('Coat Weight', 0), ('Coat Roughness', .15),
                           ('Emission Strength', 0)]:
        shader.inputs[name].default_value = scalar(original, name, fallback)
    if original:
        shader.inputs['Emission Color'].default_value = original.inputs['Emission Color'].default_value
    if 'glass' in group['source_material'].lower():
        # Preserve the source's physical glazing. An opaque white diffuse lobe
        # with low alpha produces a milky overlay and loses transmission/IOR.
        shader.inputs['Alpha'].default_value = 1
        shader.inputs['Transmission Weight'].default_value = 1
        shader.inputs['IOR'].default_value = scalar(original, 'IOR', 1.45)
        shader.inputs['Roughness'].default_value = scalar(original, 'Roughness', .008)
    for kind, socket in [('albedo', 'Base Color'), ('roughness', 'Roughness'),
                         ('coat', 'Coat Weight'), ('coat-roughness', 'Coat Roughness'),
                         ('normal', 'Normal')]:
        descriptor = group.get('textures', {}).get(kind)
        if descriptor is None:
            continue
        path = ROOT / descriptor['file']
        if not path.exists():
            raise RuntimeError('Missing described PBR texture: ' + str(path))
        texture = material.node_tree.nodes.new('ShaderNodeTexImage')
        texture.image = bpy.data.images.load(str(path), check_existing=True)
        texture.image.colorspace_settings.name = 'sRGB' if kind == 'albedo' else 'Non-Color'
        if kind == 'normal':
            normal = material.node_tree.nodes.new('ShaderNodeNormalMap')
            material.node_tree.links.new(texture.outputs['Color'], normal.inputs['Color'])
            material.node_tree.links.new(normal.outputs['Normal'], shader.inputs[socket])
        else:
            material.node_tree.links.new(texture.outputs['Color'], shader.inputs[socket])
    material.use_backface_culling = False
    obj.data.materials[0] = material
    return material


def export_runtime(manifest, stem='quality-canal', texture_staging='gltf-textures', packed_subdir='gltf'):
    by_key = {g['key']: g for g in manifest['groups']}
    geometry = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.get('quality_group')
                and by_key[obj['quality_group']].get('runtime_export', True)]
    for obj in geometry:
        runtime_material(obj, by_key[obj['quality_group']])
    bpy.ops.object.select_all(action='DESELECT')
    for obj in geometry:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = geometry[0]
    MODELS.mkdir(parents=True, exist_ok=True)
    destination = MODELS / (stem + '.glb')
    intermediate = MODELS / (stem + '.gltf')
    # glTF may channel-pack/re-encode scalar textures. Never let it overwrite
    # immutable 16-bit bake masters in the public texture directory.
    bpy.ops.export_scene.gltf(filepath=str(intermediate), export_format='GLTF_SEPARATE',
                             export_texture_dir='../../../artifacts/' + texture_staging, use_selection=True,
                             use_active_scene=True, export_cameras=False, export_lights=False,
                             export_animations=False, export_extras=True, export_yup=True,
                             export_apply=False, export_normals=True, export_texcoords=True,
                             export_tangents=True, export_materials='EXPORT')
    # Keep high-resolution textures external instead of making a >100 MB GLB.
    # A GLB may legally contain external image URIs while its geometry is binary.
    document = json.loads(intermediate.read_text(encoding='utf-8'))
    for entry in document.get('images', []):
        generated = (MODELS / entry['uri']).resolve()
        original = TEXTURES / generated.name
        if original.exists() and digest(original) == digest(generated):
            entry['uri'] = '../textures/' + original.name
        else:
            packed_dir = TEXTURES / packed_subdir
            packed_dir.mkdir(parents=True, exist_ok=True)
            packed = packed_dir / generated.name
            shutil.copy2(generated, packed)
            entry['uri'] = '../textures/' + packed_subdir + '/' + packed.name
    binary_path = MODELS / document['buffers'][0].pop('uri')
    binary = binary_path.read_bytes()
    document['buffers'][0]['byteLength'] = len(binary)
    json_chunk = json.dumps(document, separators=(',', ':')).encode('utf-8')
    json_chunk += b' ' * ((-len(json_chunk)) % 4)
    binary += b'\0' * ((-len(binary)) % 4)
    total = 12 + 8 + len(json_chunk) + 8 + len(binary)
    raw = (struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(json_chunk), b'JSON') +
           json_chunk + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    destination.write_bytes(raw)
    accessors = document.get('accessors', [])
    primitives = [p for m in document['meshes'] for p in m['primitives']]
    triangles = sum(accessors[p['indices']]['count'] // 3 for p in primitives)
    expected_triangles = sum(g['triangles'] for g in manifest['groups'] if g.get('runtime_export', True))
    if triangles != expected_triangles:
        raise RuntimeError(f'Export triangle mismatch: {triangles}.')
    manifest['asset'] = {'file': 'models/' + destination.name, 'bytes': len(raw),
                         'sha256': digest(destination), 'meshes': len(document['meshes']),
                         'primitives': len(primitives), 'triangles': triangles,
                         'vertices_with_uv_normal_seams': sum(accessors[p['attributes']['POSITION']]['count'] for p in primitives),
                         'pbr_materials': [m['name'] for m in document['materials']]}
    manifest['asset']['external_images'] = [image['uri'] for image in document.get('images', [])]
    manifest['asset']['external_image_assets'] = [
        {'uri': entry['uri'], 'sha256': digest(destination.parent / entry['uri']),
         'bytes': (destination.parent / entry['uri']).stat().st_size}
        for entry in document.get('images', [])]
    manifest['asset']['validation'] = validate_runtime_asset(document, binary, destination)
    emit('export_complete', **manifest['asset'])


def validate_runtime_asset(document, binary, destination):
    missing = [image['uri'] for image in document.get('images', [])
               if not (destination.parent / image['uri']).exists()]
    if missing:
        raise RuntimeError('Missing GLB image dependencies: ' + repr(missing))
    bounds = []
    normal_error = 0
    tested_accessors = set()
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            for name, index in primitive['attributes'].items():
                if index in tested_accessors:
                    continue
                tested_accessors.add(index)
                accessor = document['accessors'][index]
                if accessor['componentType'] != 5126:
                    continue
                view = document['bufferViews'][accessor['bufferView']]
                offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
                components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
                values = np.frombuffer(binary, dtype='<f4', count=accessor['count'] * components,
                                       offset=offset).reshape(-1, components)
                if not np.isfinite(values).all():
                    raise RuntimeError('Non-finite exported ' + name)
                if name == 'NORMAL':
                    normal_error = max(normal_error, float(np.max(np.abs(np.linalg.norm(values, axis=1) - 1))))
                if name == 'POSITION':
                    bounds.append((values.min(axis=0), values.max(axis=0)))
    if normal_error > 0.002:
        raise RuntimeError('Non-unit exported normals: ' + str(normal_error))
    return {'external_images_present': True, 'geometry_attributes_finite': True,
            'maximum_normal_unit_error': normal_error,
            'bounds': {'minimum': np.min([b[0] for b in bounds], axis=0).tolist(),
                       'maximum': np.max([b[1] for b in bounds], axis=0).tolist()},
            'uv_atlases': 'Prepared-stage per-group coverage and triangle texel statistics recorded above.'}


def bake(options):
    started = time.perf_counter()
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    for group in manifest['groups']:
        if group['source_material'] == 'soil':
            group['runtime_export'] = False
    if digest(SOURCE) != manifest['source']['sha256']:
        raise RuntimeError('Source hash no longer matches prepared source.')
    if manifest.get('prepared_blend') and digest(ARTIFACT) != manifest['prepared_blend']['sha256']:
        raise RuntimeError('Prepared blend changed; regenerate geometry/UVs and matching bakes together.')
    bpy.ops.wm.open_mainfile(filepath=str(ARTIFACT))
    devices = configure_cycles(bpy.context.scene, options.samples)
    emit('bake_devices', devices=devices, samples=options.samples)
    selected_groups = set(options.groups.split(',')) if options.groups else None
    passes = options.passes.split(',')
    for group in manifest['groups']:
        if not group['baked'] or (selected_groups is not None and group['key'] not in selected_groups):
            continue
        obj = bpy.data.objects[group['mesh']]
        resolution = options.resolution or group['resolution']
        group.setdefault('textures', {})
        chosen = list(passes)
        shader = principal(obj.data.materials[0])
        if not shader.inputs['Coat Weight'].is_linked and shader.inputs['Coat Weight'].default_value < .001:
            chosen = [k for k in chosen if k not in {'coat', 'coat-roughness'}]
        for kind in chosen:
            group['textures'][kind] = bake_map(obj, group['key'], kind, resolution, options.samples)
            write_json(MANIFEST, manifest)
            wait_at_checkpoint(group['key'], kind)
    complete = all(not g['baked'] or all(k in g.get('textures', {}) for k in ['albedo', 'roughness', 'normal', 'indirect'])
                   for g in manifest['groups'])
    manifest['stage'] = 'baked' if complete else 'partially-baked'
    if manifest.get('bake'):
        manifest.setdefault('bake_runs', []).append(manifest['bake'])
    manifest['bake'] = {'devices': devices, 'indirect_samples': options.samples,
                        'seconds_this_run': round(time.perf_counter() - started, 2),
                        'passes': passes, 'lightmap_contains_direct_light': False,
                        'albedo_contains_lighting': False, 'normal_convention': '+X +Y +Z tangent space (OpenGL)',
                        'indirect_encoding': 'Radiance RGBE HDR scene-linear; RGBELoader HalfFloatType; flipY=false; UVMapping; channel=0; lightMapIntensity=1.'}
    environment = TEXTURES / 'quality-world.hdr'
    manifest['environment'] = {'file': 'textures/quality-world.hdr', 'bytes': environment.stat().st_size,
                               'sha256': digest(environment),
                               'source': 'Unchanged 007 V4 procedural world-only Radiance RGBE environment; no camera-view image or geometry.',
                               'source_world_strength_already_included': True}
    if complete or options.export_partial:
        export_runtime(manifest)
    write_json(MANIFEST, manifest)
    provenance = json.loads(PROVENANCE.read_text(encoding='utf-8'))
    provenance.update({'source_unchanged': digest(SOURCE) == manifest['source']['sha256'],
                       'stage': manifest['stage'], 'geometry': manifest['geometry'],
                       'asset': manifest.get('asset'), 'texture_bakes': manifest['bake']})
    write_json(PROVENANCE, provenance)
    emit('bake_stage_complete', stage=manifest['stage'], seconds=manifest['bake']['seconds_this_run'])


def finalize(options):
    """CPU-only validation/repack of already completed bake products."""
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if digest(SOURCE) != manifest['source']['sha256']:
        raise RuntimeError('Preserved source hash mismatch.')
    if manifest.get('prepared_blend') and digest(ARTIFACT) != manifest['prepared_blend']['sha256']:
        raise RuntimeError('Prepared blend hash mismatch.')
    for group in manifest['groups']:
        if group['source_material'] in {'soil', 'Canal water'}:
            group['runtime_export'] = False
    for group in manifest['groups']:
        if not group['baked']:
            continue
        for kind in ['albedo', 'roughness', 'normal', 'indirect']:
            texture = group.get('textures', {}).get(kind)
            if not texture or not (ROOT / texture['file']).exists():
                raise RuntimeError('Incomplete texture set for ' + group['key'] + ' / ' + kind)
            if digest(ROOT / texture['file']) != texture['sha256']:
                raise RuntimeError('Texture hash mismatch.')
    bpy.ops.wm.open_mainfile(filepath=str(ARTIFACT))
    # The first in-flight formal bake predates the explicit signature field;
    # stamp its verified, unchanged source/geometry/UV identity before reuse.
    for group in manifest['groups']:
        if not group['baked']:
            continue
        signature = bake_signature(bpy.data.objects[group['mesh']])
        for kind, texture in group['textures'].items():
            if texture.get('bake_signature') and texture['bake_signature'] != signature:
                raise RuntimeError('Texture geometry/UV signature mismatch for ' + group['key'])
            texture['bake_signature'] = signature
            sidecar = TEXTURES / f"{group['key']}-{kind}.json"
            write_json(sidecar, texture)
    export_runtime(manifest)
    for group in manifest['groups']:
        for texture in group.get('textures', {}).values():
            if digest(ROOT / texture['file']) != texture['sha256']:
                raise RuntimeError('glTF packaging changed a baked source texture: ' + texture['file'])
    environment = TEXTURES / 'quality-world.hdr'
    manifest['environment'] = {'file': 'textures/quality-world.hdr', 'bytes': environment.stat().st_size,
                               'sha256': digest(environment),
                               'source': 'Unchanged 007 V4 procedural world-only Radiance RGBE environment; no camera-view image or geometry.',
                               'source_world_strength_already_included': True}
    world_sidecar = TEXTURES / 'quality-world.json'
    if world_sidecar.exists():
        manifest['environment'].update(json.loads(world_sidecar.read_text(encoding='utf-8')))
    manifest['stage'] = 'baked'
    manifest['prepared_blend'] = {'file': 'artifacts/quality-canal-evaluated.blend',
                                   'sha256': digest(ARTIFACT), 'bytes': ARTIFACT.stat().st_size}
    manifest['validation'] = {'source_unchanged': True,
                               'required_texture_hashes_verified': True,
                               'visual_acceptance': 'Asset preparation validation only; full-frame visual/runtime acceptance is performed separately.'}
    manifest.setdefault('bake', {})['timing_scope'] = ('Wall-clock asset work, not device render FPS. '
        'The initial bake process was suspended at a saved paving/indirect checkpoint for a separate source-runtime QA run; '
        'that waiting interval is included in wall-clock/per-map time where applicable.')
    write_json(MANIFEST, manifest)
    provenance = json.loads(PROVENANCE.read_text(encoding='utf-8'))
    provenance.update({'stage': 'baked', 'source_unchanged': True,
                       'asset': manifest['asset'], 'validation': manifest['validation'],
                       'environment': manifest['environment']})
    write_json(PROVENANCE, provenance)
    emit('finalized', **manifest['asset'])


def world(options):
    started = time.perf_counter()
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    manifest['stage'] = 'finalizing-world'
    write_json(MANIFEST, manifest)
    bpy.ops.wm.open_mainfile(filepath=str(ARTIFACT))
    source_world = bpy.context.scene.world
    scene = bpy.data.scenes.new('Procedural world panorama only - no scene geometry')
    scene.world = source_world.copy()
    bpy.context.window.scene = scene
    devices = configure_cycles(scene, options.samples)
    data = bpy.data.cameras.new('World-only panorama camera')
    data.type = 'PANO'
    data.panorama_type = 'EQUIRECTANGULAR'
    camera = bpy.data.objects.new(data.name, data)
    camera.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    width = options.resolution or 4096
    scene.render.resolution_x = width
    scene.render.resolution_y = width // 2
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.image_settings.file_format = 'HDR'
    scene.render.image_settings.color_mode = 'RGB'
    destination = TEXTURES / 'quality-world.hdr'
    scene.render.filepath = str(destination)
    bpy.ops.render.render(write_still=True)
    information = {'file': 'textures/quality-world.hdr', 'bytes': destination.stat().st_size,
                   'sha256': digest(destination), 'resolution': [width, width // 2],
                   'samples': options.samples, 'devices': devices,
                   'source': 'World-only panorama rerendered from untouched 007 V4 procedural World; no scene geometry, reference photo or scene-camera projection.',
                   'source_world_strength_already_included': True,
                   'seconds': round(time.perf_counter() - started, 2)}
    write_json(TEXTURES / 'quality-world.json', information)
    emit('world_complete', **information)


def main():
    parser = argparse.ArgumentParser()
    stage = parser.add_mutually_exclusive_group(required=True)
    stage.add_argument('--prepare', action='store_true')
    stage.add_argument('--bake', action='store_true')
    stage.add_argument('--finalize', action='store_true')
    stage.add_argument('--world', action='store_true')
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--groups', help='Comma-separated group keys; default all')
    parser.add_argument('--passes', default='albedo,roughness,coat,coat-roughness,normal,indirect')
    parser.add_argument('--resolution', type=int, help='Explicit override for bounded benchmark only')
    parser.add_argument('--export-partial', action='store_true')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if options.prepare:
        prepare(options)
    elif options.finalize:
        finalize(options)
    elif options.world:
        world(options)
    else:
        bake(options)


if __name__ == '__main__':
    main()
