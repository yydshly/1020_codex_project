import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Matrix, Vector, noise

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from build_scene import configure_render
from refine_scene import complexity, validate_geometry
from scene_utils import rgb
from weathered_materials import improve_weathering


def clear_glazing():
    material = bpy.data.materials['glass']
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .008
    shader.inputs['Base Color'].default_value = (.98, .99, 1, 1)
    shader.inputs['IOR'].default_value = 1.45
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    path = nodes.new('ShaderNodeLightPath')
    shadow_mix = nodes.new('ShaderNodeMixShader')
    shadow_mix.name = 'Thin glazing transparent to shadow rays only'
    links.new(path.outputs['Is Shadow Ray'], shadow_mix.inputs[0])
    links.new(shader.outputs['BSDF'], shadow_mix.inputs[1])
    links.new(transparent.outputs[0], shadow_mix.inputs[2])
    links.new(shadow_mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH' and 'glass' in obj.name.lower() and obj.name.startswith(('Display', 'Door', 'Entry', 'Upper')):
            obj.scale.y *= .24


def polish_water():
    material = bpy.data.materials['Canal water']
    nodes = material.node_tree.nodes
    nodes['Short irregular cross ripples'].inputs[1].default_value = (3.2, 1.1, 1)
    nodes['Fine broken water reflection'].inputs['Scale'].default_value = 2.7
    nodes['Broad irregular water ripple'].inputs['Scale'].default_value = .85
    nodes['Gentle broad water normal'].inputs['Strength'].default_value = .20
    nodes['Gentle broad water normal'].inputs['Distance'].default_value = .035
    nodes['Small reflection breakup'].inputs['Strength'].default_value = .20
    nodes['Small reflection breakup'].inputs['Distance'].default_value = .028
    nodes['Water reflection variation'].inputs['To Min'].default_value = .035
    nodes['Water reflection variation'].inputs['To Max'].default_value = .085
    obj = bpy.data.objects['Continuous canal with real ripple geometry']
    for vertex in obj.data.vertices:
        position_x, position_y = vertex.co.x, vertex.co.y
        broad = noise.noise(Vector((position_x * .95, position_y * .32, 2.37)), noise_basis='PERLIN_ORIGINAL')
        fine = noise.noise(Vector((position_x * 3.4, position_y * .8, 7.31)), noise_basis='PERLIN_ORIGINAL')
        vertex.co.z = .038 * broad + .009 * fine
    obj.data.update()


def continue_distant_banks():
    targets = list(bpy.data.collections['Canal banks'].objects)
    targets.extend(bpy.data.collections['Water'].objects)
    targets.extend(obj for obj in bpy.data.collections['Background'].objects if obj.name.startswith('Continuous'))
    for obj in targets:
        if obj.type != 'MESH':
            continue
        inverse = obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            position = obj.matrix_world @ vertex.co
            if position.x > 30:
                position.x = 30 + (position.x - 30) * 6
                vertex.co = inverse @ position
        obj.data.update()
    bpy.context.scene.camera.data.clip_end = 1200
    depth = next(node for node in bpy.context.scene.node_tree.nodes if node.bl_idname == 'CompositorNodeMapRange')
    depth.inputs['From Max'].default_value = 220
    depth.inputs['To Max'].default_value = .78
    geometry_mask = next(node for node in bpy.context.scene.node_tree.nodes if node.bl_idname == 'CompositorNodeMath' and node.operation == 'LESS_THAN')
    geometry_mask.inputs[1].default_value = 1500


def balance_lights():
    glow = bpy.data.materials['warm_glow'].node_tree.nodes.get('Principled BSDF')
    glow.inputs['Emission Color'].default_value = rgb('ffb64e')
    glow.inputs['Emission Strength'].default_value = 2.2
    for obj in bpy.context.scene.objects:
        if obj.type != 'LIGHT':
            continue
        if obj.name.startswith('Lamp ') and 'warm light' in obj.name:
            obj.data.energy = 250
            obj.data.color = (1, .44, .14)
        elif obj.name.startswith('Interior warm fill'):
            obj.data.energy *= .78
        elif obj.name.startswith('Warm upstairs room'):
            obj.data.energy *= .9
    bpy.data.objects['Evening horizon glow'].data.energy = 135


def orient_existing_distant_shops():
    sources = ((28, -16.6), (30, 5.7), (39, -17), (43, 6), (52, -17.4))
    destinations = ((39, -15), (30, 5.7), (56, -15), (43, 6), (77, -15))
    for obj in bpy.data.collections['Background'].objects:
        if obj.name.startswith('Continuous'):
            continue
        center = sum((obj.matrix_world @ Vector(corner) for corner in obj.bound_box), Vector()) / 8
        nearest = min(range(len(sources)), key=lambda index: (center.x - sources[index][0]) ** 2 + (center.y - sources[index][1]) ** 2)
        if nearest not in (0, 2, 4):
            continue
        source_center = Vector((*sources[nearest], 0))
        destination_center = Vector((*destinations[nearest], 0))
        obj.matrix_world = Matrix.Translation(destination_center) @ Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation(-source_center) @ obj.matrix_world
    for obj in bpy.data.collections['Background planting'].objects:
        index = int(obj.name.split()[2])
        if index == 1:
            obj.location += Vector((17, 0, 0))
        elif index == 3:
            obj.location += Vector((22, 1, 0))
    shader = bpy.data.materials['Distant dim amber window'].node_tree.nodes.get('Principled BSDF')
    shader.inputs['Emission Color'].default_value = rgb('ffd09c')
    shader.inputs['Emission Strength'].default_value = 1.5


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--quality', choices=['preview', 'final'], default='preview')
    parser.add_argument('--label', default='01')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    started = time.perf_counter()
    source = PROJECT_DIR / 'artifacts' / 'rainy-canal-v2.blend'
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    before = complexity()
    material_changes = improve_weathering()
    clear_glazing()
    polish_water()
    continue_distant_banks()
    balance_lights()
    orient_existing_distant_shops()
    devices = configure_render(options.quality)
    scene = bpy.context.scene
    scene.cycles.samples = 32 if options.quality == 'preview' else 112
    scene.view_settings.exposure = .85
    after = complexity()
    if after != before:
        raise RuntimeError(f'Scene complexity changed: {before} -> {after}')
    validate_geometry()
    name = f'polish-preview-{options.label}' if options.quality == 'preview' else 'render-v3'
    scene.render.filepath = str(PROJECT_DIR / 'assets' / f'{name}.png')
    scene['polish'] = 'Weathering, patchy rainwater film, clearer glazing, cross-channel ripples and extended existing distant banks.'
    scene['glazing_shadow_method'] = 'Transparent shadow-ray approximation for thin panes; camera rays retain Principled transmission and reflection.'
    scene['v2_source_sha256'] = source_hash
    if options.quality == 'final':
        destination = PROJECT_DIR / 'artifacts' / 'rainy-canal-v3.blend'
        bpy.ops.wm.save_as_mainfile(filepath=str(destination))
        bpy.ops.wm.open_mainfile(filepath=str(destination))
        validate_geometry()
        if complexity() != before:
            raise RuntimeError('Reopened artifact complexity mismatch')
        scene = bpy.context.scene
    setup_seconds = time.perf_counter() - started
    render_started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    stats = {
        'quality': options.quality,
        'blender': bpy.app.version_string,
        'devices': devices,
        'resolution': [scene.render.resolution_x, scene.render.resolution_y],
        'samples_max': scene.cycles.samples,
        'complexity_before': before,
        'complexity_after': after,
        'complexity_unchanged': before == after,
        'v2_source_sha256': source_hash,
        'v2_unchanged': source_hash == hashlib.sha256(source.read_bytes()).hexdigest(),
        'final_artifact_reopened': options.quality == 'final',
        'finite_geometry': True,
        'external_images': [item.filepath for item in bpy.data.images if item.source == 'FILE'],
        'weathering': material_changes,
        'setup_seconds': round(setup_seconds, 2),
        'render_seconds': round(time.perf_counter() - render_started, 2),
        'total_seconds': round(time.perf_counter() - started, 2),
    }
    (PROJECT_DIR / 'assets' / f'{name}-stats.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')
    print('POLISH', json.dumps(stats))


if __name__ == '__main__':
    run()
