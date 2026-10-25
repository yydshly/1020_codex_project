import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from build_scene import configure_render
from scene_utils import rgb


def complexity():
    scene = bpy.context.scene
    return {
        'objects': len(scene.objects),
        'mesh_vertices': sum(len(obj.data.vertices) for obj in scene.objects if obj.type == 'MESH'),
        'mesh_faces': sum(len(obj.data.polygons) for obj in scene.objects if obj.type == 'MESH'),
        'modifiers': sum(len(obj.modifiers) for obj in scene.objects),
        'lights': sum(obj.type == 'LIGHT' for obj in scene.objects),
    }


def aim(obj, center, target):
    obj.location = center
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def refine_camera():
    scene = bpy.context.scene
    camera = bpy.data.objects['Hero canal perspective']
    aim(camera, (-15, -10, 3.6), (5, -1, 3.8))
    camera.data.lens = 28
    camera.data.dof.use_dof = False
    scene.camera = camera
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'


def refine_sky():
    world = bpy.context.scene.world
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputWorld')
    background = nodes.new('ShaderNodeBackground')
    background.inputs['Strength'].default_value = .65
    links.new(background.outputs[0], output.inputs['Surface'])
    coordinates = nodes.new('ShaderNodeTexCoord')
    separate = nodes.new('ShaderNodeSeparateXYZ')
    links.new(coordinates.outputs['Normal'], separate.inputs[0])
    altitude = nodes.new('ShaderNodeMath')
    altitude.operation = 'ABSOLUTE'
    links.new(separate.outputs['Z'], altitude.inputs[0])
    gradient = nodes.new('ShaderNodeValToRGB')
    gradient.color_ramp.elements.remove(gradient.color_ramp.elements[1])
    for index, (height, color) in enumerate(((0, 'ff9e5f'), (.065, 'cc8b87'), (.14, '8c8fac'), (.28, '5277a6'), (.6, '29466c'), (1, '263b5b'))):
        element = gradient.color_ramp.elements[0] if index == 0 else gradient.color_ramp.elements.new(height)
        element.position = height
        element.color = rgb(color)
    links.new(altitude.outputs[0], gradient.inputs[0])
    stretch = nodes.new('ShaderNodeVectorMath')
    stretch.operation = 'MULTIPLY'
    stretch.inputs[1].default_value = (3, 3, 7)
    links.new(coordinates.outputs['Normal'], stretch.inputs[0])
    cloud_noise = nodes.new('ShaderNodeTexNoise')
    cloud_noise.inputs['Scale'].default_value = 4
    cloud_noise.inputs['Detail'].default_value = 4
    cloud_noise.inputs['Roughness'].default_value = .72
    links.new(stretch.outputs[0], cloud_noise.inputs['Vector'])
    cloud_colors = nodes.new('ShaderNodeValToRGB')
    cloud_colors.color_ramp.elements[0].position = .37
    cloud_colors.color_ramp.elements[0].color = (.24, .3, .42, 1)
    cloud_colors.color_ramp.elements[1].position = .62
    cloud_colors.color_ramp.elements[1].color = (.95, .95, .95, 1)
    links.new(cloud_noise.outputs['Fac'], cloud_colors.inputs[0])
    multiply = nodes.new('ShaderNodeMixRGB')
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs[0].default_value = .58
    links.new(gradient.outputs[0], multiply.inputs[1])
    links.new(cloud_colors.outputs[0], multiply.inputs[2])
    links.new(multiply.outputs[0], background.inputs['Color'])


def refine_lighting():
    cool = bpy.data.objects['Soft cool dusk fill']
    cool.data.energy = 1700
    cool.data.color = (.65, .77, 1)
    warm = bpy.data.objects['Evening horizon glow']
    aim(warm, (-5, -2.6, 4.5), (-4, 1.2, 3.2))
    warm.data.energy = 190
    warm.data.size = 5
    warm.data.color = (1, .49, .22)
    for obj in bpy.context.scene.objects:
        if obj.type != 'LIGHT':
            continue
        if obj.name.startswith('Lamp ') and 'warm light' in obj.name:
            obj.data.energy = 300
            obj.data.color = (1, .47, .18)
        elif obj.name.startswith('Interior warm fill'):
            obj.data.energy *= .85
        elif obj.name.startswith('Warm upstairs room'):
            obj.data.energy *= 1.25


def refine_background():
    source_centers = ((29, 19), (35, 21), (42, 19), (50, 21), (57, 19))
    target_centers = ((28, -16.6), (30, 5.7), (39, -17), (43, 6), (52, -17.4))
    for obj in bpy.data.collections['Background'].objects:
        if obj.name.startswith('Continuous'):
            obj.scale.x = 3
            continue
        center = sum((obj.matrix_world @ Vector(corner) for corner in obj.bound_box), Vector()) / 8
        nearest = min(range(len(source_centers)), key=lambda index: abs(center.x - source_centers[index][0]))
        original_x, original_y = source_centers[nearest]
        target_x, target_y = target_centers[nearest]
        obj.location += Vector((target_x - original_x, target_y - original_y, 0))
    tree_sources = ((16, 5), (23, 7), (30, 8), (39, 11))
    tree_targets = ((19, 4.2), (28, -15), (36, 4), (45, -16))
    for obj in bpy.data.collections['Background planting'].objects:
        index = int(obj.name.split()[2])
        original_x, original_y = tree_sources[index]
        target_x, target_y = tree_targets[index]
        obj.location += Vector((target_x - original_x, target_y - original_y, 0))
    geometry_groups = ('Canal banks', 'Water')
    for group_name in geometry_groups:
        for obj in bpy.data.collections[group_name].objects:
            if obj.type != 'MESH':
                continue
            world_to_local = obj.matrix_world.inverted()
            for vertex in obj.data.vertices:
                world_position = obj.matrix_world @ vertex.co
                if world_position.x > 19:
                    world_position.x = 19 + (world_position.x - 19) * 2.6
                    vertex.co = world_to_local @ world_position
            obj.data.update()
    for obj in bpy.context.scene.objects:
        if obj.name.startswith('Lamp 1 '):
            obj.location.x += 1.6
        elif obj.name.startswith('Corner masonry quoin'):
            obj.data.materials[0] = bpy.data.materials['plaster_alt']


def refine_surface_relief():
    for name in ('paving', 'paving_alt', 'stone', 'stone_light'):
        material = bpy.data.materials[name]
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        broad_bump = nodes.new('ShaderNodeBump')
        broad_bump.name = 'Shallow worn stone undulation'
        broad_bump.inputs['Strength'].default_value = .30
        broad_bump.inputs['Distance'].default_value = .045
        links.new(nodes['Subtle mineral variation'].outputs['Fac'], broad_bump.inputs['Height'])
        links.new(broad_bump.outputs['Normal'], nodes['Fine mineral relief'].inputs['Normal'])
    for name in ('plaster', 'plaster_alt'):
        material = bpy.data.materials[name]
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        stretch = nodes.new('ShaderNodeVectorMath')
        stretch.operation = 'MULTIPLY'
        stretch.inputs[1].default_value = (3, 3, .3)
        links.new(nodes['Continuous world coordinates'].outputs['Position'], stretch.inputs[0])
        stain = nodes.new('ShaderNodeTexNoise')
        stain.inputs['Scale'].default_value = 2
        stain.inputs['Detail'].default_value = 3
        links.new(stretch.outputs[0], stain.inputs['Vector'])
        ramp = nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = .3
        ramp.color_ramp.elements[0].color = (.3, .27, .23, 1)
        ramp.color_ramp.elements[1].position = .65
        links.new(stain.outputs['Fac'], ramp.inputs[0])
        mix = nodes.new('ShaderNodeMixRGB')
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = .28
        links.new(nodes['Restrained mineral colors'].outputs['Color'], mix.inputs[1])
        links.new(ramp.outputs['Color'], mix.inputs[2])
        links.new(mix.outputs[0], nodes['Principled BSDF'].inputs['Base Color'])


def refine_atmosphere():
    scene = bpy.context.scene
    bpy.context.view_layer.use_pass_z = True
    scene.use_nodes = True
    nodes = scene.node_tree.nodes
    links = scene.node_tree.links
    nodes.clear()
    rendered = nodes.new('CompositorNodeRLayers')
    depth = nodes.new('CompositorNodeMapRange')
    depth.inputs['From Min'].default_value = 35
    depth.inputs['From Max'].default_value = 140
    depth.inputs['To Min'].default_value = 0
    depth.inputs['To Max'].default_value = .55
    depth.use_clamp = True
    links.new(rendered.outputs['Depth'], depth.inputs['Value'])
    geometry_only = nodes.new('CompositorNodeMath')
    geometry_only.operation = 'LESS_THAN'
    geometry_only.inputs[1].default_value = 1000
    links.new(rendered.outputs['Depth'], geometry_only.inputs[0])
    factor = nodes.new('CompositorNodeMath')
    factor.operation = 'MULTIPLY'
    links.new(depth.outputs[0], factor.inputs[0])
    links.new(geometry_only.outputs[0], factor.inputs[1])
    haze = nodes.new('CompositorNodeMixRGB')
    links.new(factor.outputs[0], haze.inputs[0])
    links.new(rendered.outputs['Image'], haze.inputs[1])
    haze.inputs[2].default_value = rgb('76838c')
    output = nodes.new('CompositorNodeComposite')
    links.new(haze.outputs[0], output.inputs['Image'])


def validate_geometry():
    invalid = []
    for obj in bpy.context.scene.objects:
        valid_transform = all(math.isfinite(component) for row in obj.matrix_world for component in row)
        valid_mesh = obj.type != 'MESH' or all(math.isfinite(component) for vertex in obj.data.vertices for component in vertex.co)
        if not valid_transform or not valid_mesh:
            invalid.append(obj.name)
    if invalid:
        raise RuntimeError(f'Invalid geometry: {invalid}')


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--quality', choices=['preview', 'final'], default='preview')
    parser.add_argument('--label', default='01')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    started = time.perf_counter()
    source = PROJECT_DIR / 'artifacts' / 'rainy-canal.blend'
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    before = complexity()
    from lookdev_materials import refine_materials
    material_changes = refine_materials()
    refine_camera()
    refine_sky()
    refine_lighting()
    refine_background()
    refine_surface_relief()
    refine_atmosphere()
    devices = configure_render(options.quality)
    scene = bpy.context.scene
    scene.cycles.samples = 32 if options.quality == 'preview' else 112
    scene.view_settings.exposure = .85
    after = complexity()
    if after != before:
        raise RuntimeError(f'Scene complexity changed: {before} -> {after}')
    validate_geometry()
    name = f'lookdev-preview-{options.label}' if options.quality == 'preview' else 'render-v2'
    scene.render.filepath = str(PROJECT_DIR / 'assets' / f'{name}.png')
    scene['refinement'] = 'No topology added; camera, materials, water heights, lighting and existing background placement refined.'
    scene['baseline_blend_sha256'] = source_hash
    if options.quality == 'final':
        destination = PROJECT_DIR / 'artifacts' / 'rainy-canal-v2.blend'
        bpy.ops.wm.save_as_mainfile(filepath=str(destination))
        bpy.ops.wm.open_mainfile(filepath=str(destination))
        validate_geometry()
        if complexity() != before:
            raise RuntimeError('Reopened artifact complexity mismatch')
        scene = bpy.context.scene
    setup_seconds = time.perf_counter() - started
    render_started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    checks = {
        'quality': options.quality,
        'blender': bpy.app.version_string,
        'devices': devices,
        'resolution': [scene.render.resolution_x, scene.render.resolution_y],
        'samples_max': scene.cycles.samples,
        'complexity_before': before,
        'complexity_after': after,
        'complexity_unchanged': before == after,
        'baseline_unchanged': source_hash == hashlib.sha256(source.read_bytes()).hexdigest(),
        'baseline_blend_sha256': source_hash,
        'final_artifact_reopened': options.quality == 'final',
        'finite_geometry': True,
        'external_images': [item.filepath for item in bpy.data.images if item.source == 'FILE'],
        'material_changes': material_changes,
        'postprocessing': 'Subtle geometry-depth haze beyond 35 scene units; sky and foreground excluded.',
        'setup_seconds': round(setup_seconds, 2),
        'render_seconds': round(time.perf_counter() - render_started, 2),
        'total_seconds': round(time.perf_counter() - started, 2),
    }
    (PROJECT_DIR / 'assets' / f'{name}-stats.json').write_text(json.dumps(checks, indent=2), encoding='utf-8')
    print('REFINEMENT', json.dumps(checks))


if __name__ == '__main__':
    run()
