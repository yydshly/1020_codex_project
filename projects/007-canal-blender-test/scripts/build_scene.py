import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import sys
import time

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from scene_utils import box, collection, light, mesh, rgb


def material(name, color, roughness=0.6, metallic=0, texture=0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = rgb(color)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    links = result.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = rgb(color)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    if texture:
        coordinates = nodes.new('ShaderNodeTexCoord')
        noise = nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = texture
        noise.inputs['Detail'].default_value = 4
        noise.inputs['Roughness'].default_value = 0.72
        links.new(coordinates.outputs['Object'], noise.inputs['Vector'])
        ramp = nodes.new('ShaderNodeValToRGB')
        base = rgb(color)
        ramp.color_ramp.elements[0].position = .2
        ramp.color_ramp.elements[0].color = tuple(channel * .48 for channel in base[:3]) + (1,)
        ramp.color_ramp.elements[1].position = .8
        ramp.color_ramp.elements[1].color = tuple(min(channel * 1.35, 1) for channel in base[:3]) + (1,)
        links.new(noise.outputs['Fac'], ramp.inputs[0])
        links.new(ramp.outputs[0], shader.inputs['Base Color'])
        fine_noise = nodes.new('ShaderNodeTexNoise')
        fine_noise.inputs['Scale'].default_value = 90
        fine_noise.inputs['Detail'].default_value = 2
        links.new(coordinates.outputs['Object'], fine_noise.inputs['Vector'])
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .22
        bump.inputs['Distance'].default_value = .045
        links.new(fine_noise.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs[0], shader.inputs['Normal'])
    return result


def make_materials():
    palette = {
        'plaster': ('d0c4aa', .78, 0, 2.5),
        'plaster_alt': ('b9b3a1', .78, 0, 2.8),
        'stone': ('8e897d', .58, 0, 3),
        'stone_light': ('b3a994', .56, 0, 4),
        'mortar': ('53534c', .88, 0, 8),
        'paving': ('6a655a', .24, 0, 2),
        'paving_alt': ('80786b', .3, 0, 3),
        'roof': ('3c4545', .45, 0, 5),
        'roof_alt': ('535e5c', .42, 0, 5),
        'wood': ('4b3020', .38, 0, 4),
        'wood_light': ('947251', .48, 0, 4),
        'teal': ('254f52', .4, 0, 4),
        'olive': ('596345', .43, 0, 4),
        'fabric': ('692d33', .9, 0, 20),
        'brass': ('b4944c', .25, .78, 0),
        'iron': ('252c2d', .32, .7, 0),
        'glass': ('d9e2da', .08, 0, 0),
        'warm_glow': ('ffd78a', .4, 0, 0),
        'book_red': ('9b463e', .65, 0, 0),
        'book_blue': ('38606c', .65, 0, 0),
        'book_tan': ('d1b58a', .65, 0, 0),
        'leaf': ('355d32', .65, 0, 0),
        'leaf_light': ('738044', .65, 0, 0),
        'terracotta': ('8f4f35', .75, 0, 5),
        'soil': ('302b21', .95, 0, 5),
        'rubber': ('15191a', .6, 0, 0),
    }
    materials = {key: material(key, *values) for key, values in palette.items()}
    glass_shader = materials['glass'].node_tree.nodes.get('Principled BSDF')
    glass_shader.inputs['Transmission Weight'].default_value = 1
    glass_shader.inputs['IOR'].default_value = 1.45
    glow_shader = materials['warm_glow'].node_tree.nodes.get('Principled BSDF')
    glow_shader.inputs['Emission Color'].default_value = rgb('ffd191')
    glow_shader.inputs['Emission Strength'].default_value = 3
    for key in ('wood', 'wood_light'):
        nodes = materials[key].node_tree.nodes
        links = materials[key].node_tree.links
        coordinates = nodes.get('Texture Coordinate')
        mapping = nodes.new('ShaderNodeVectorMath')
        mapping.operation = 'MULTIPLY'
        mapping.inputs[1].default_value = (8, 8, .3)
        links.new(coordinates.outputs['Object'], mapping.inputs[0])
        links.new(mapping.outputs[0], nodes.get('Noise Texture').inputs['Vector'])
    for key in ('paving', 'paving_alt'):
        nodes = materials[key].node_tree.nodes
        links = materials[key].node_tree.links
        ramp = nodes.new('ShaderNodeMapRange')
        ramp.inputs['From Min'].default_value = .25
        ramp.inputs['From Max'].default_value = .75
        ramp.inputs['To Min'].default_value = .11
        ramp.inputs['To Max'].default_value = .43
        links.new(nodes.get('Noise Texture').outputs['Fac'], ramp.inputs['Value'])
        links.new(ramp.outputs[0], nodes.get('Principled BSDF').inputs['Roughness'])
        nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = .35
        nodes.get('Principled BSDF').inputs['Coat Roughness'].default_value = .14
    return materials


def build_water():
    water_material = material('Canal water', '25464b', .16, .25)
    nodes = water_material.node_tree.nodes
    links = water_material.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['IOR'].default_value = 1.333
    shader.inputs['Transmission Weight'].default_value = .32
    coordinates = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath')
    mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = (1.2, 5, 1)
    links.new(coordinates.outputs['Object'], mapping.inputs[0])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3
    noise.inputs['Detail'].default_value = 3
    links.new(mapping.outputs[0], noise.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .22
    bump.inputs['Distance'].default_value = .065
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs[0], shader.inputs['Normal'])
    vertices = []
    faces = []
    length_steps = 350
    width_steps = 55
    for length_index in range(length_steps + 1):
        position_x = -40 + 110 * length_index / length_steps
        for width_index in range(width_steps + 1):
            position_y = -10.98 + 7.96 * width_index / width_steps
            height = .013 * math.sin(position_x * 3.4 + position_y * 4.3) + .008 * math.sin(position_x * 7.1 - position_y * 2.9)
            vertices.append((position_x, position_y, height))
    for length_index in range(length_steps):
        for width_index in range(width_steps):
            corner = length_index * (width_steps + 1) + width_index
            faces.append((corner, corner + width_steps + 1, corner + width_steps + 2, corner + 1))
    obj = mesh('Continuous canal with real ripple geometry', vertices, faces, water_material, 'Water')
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def setup_world():
    world = bpy.data.worlds.new('Blue hour cloud sky')
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    background = nodes.get('Background')
    background.inputs['Strength'].default_value = .4
    coordinates = nodes.new('ShaderNodeTexCoord')
    separate = nodes.new('ShaderNodeSeparateXYZ')
    links.new(coordinates.outputs['Normal'], separate.inputs[0])
    remap = nodes.new('ShaderNodeMapRange')
    remap.inputs['From Min'].default_value = -.35
    remap.inputs['From Max'].default_value = .55
    links.new(separate.outputs['Z'], remap.inputs['Value'])
    gradient = nodes.new('ShaderNodeValToRGB')
    gradient.color_ramp.elements.remove(gradient.color_ramp.elements[1])
    colors = [(0, '455e7c'), (.32, '718a9b'), (.4, '8196a4'), (.58, '507197'), (1, '293f60')]
    for index, (position, color) in enumerate(colors):
        element = gradient.color_ramp.elements[0] if index == 0 else gradient.color_ramp.elements.new(position)
        element.position = position
        element.color = rgb(color)
    links.new(remap.outputs[0], gradient.inputs[0])
    stretch = nodes.new('ShaderNodeVectorMath')
    stretch.operation = 'MULTIPLY'
    stretch.inputs[1].default_value = (2, 2, 9)
    links.new(coordinates.outputs['Normal'], stretch.inputs[0])
    cloud_noise = nodes.new('ShaderNodeTexNoise')
    cloud_noise.inputs['Scale'].default_value = 3.5
    cloud_noise.inputs['Detail'].default_value = 5
    cloud_noise.inputs['Roughness'].default_value = .65
    links.new(stretch.outputs[0], cloud_noise.inputs['Vector'])
    cloud_ramp = nodes.new('ShaderNodeValToRGB')
    cloud_ramp.color_ramp.elements[0].color = (.25, .32, .42, 1)
    cloud_ramp.color_ramp.elements[1].color = (.9, .9, .9, 1)
    links.new(cloud_noise.outputs['Fac'], cloud_ramp.inputs[0])
    multiply = nodes.new('ShaderNodeMixRGB')
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs[0].default_value = .7
    links.new(gradient.outputs[0], multiply.inputs[1])
    links.new(cloud_ramp.outputs[0], multiply.inputs[2])
    links.new(multiply.outputs[0], background.inputs['Color'])
    light('Soft cool dusk fill', (-5, -7, 18), (.42, .58, 1), 1350, 15, (0, 1, 2))
    light('Evening horizon glow', (20, 7, 12), (1, .63, .39), 1050, 10, (3, -3, 2))


def camera(name, center, target, lens):
    data = bpy.data.cameras.new(name)
    obj = bpy.data.objects.new(name, data)
    collection('Cameras').objects.link(obj)
    obj.location = center
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data.lens = lens
    data.clip_end = 300
    return obj


def background_buildings(materials):
    box('Continuous solid ground behind shop row', (12, 35, -.18), (100, 67.6, 1.7), materials['soil'], 'Background', 0)
    box('Continuous opposite bank terrain', (12, -29, -.18), (100, 36, 1.7), materials['soil'], 'Background', 0)
    distant_wall = material('Distant blue grey plaster', '68767a', .8, texture=1.8)
    distant_window = material('Distant dim amber window', 'dca66c', .5)
    distant_shader = distant_window.node_tree.nodes.get('Principled BSDF')
    distant_shader.inputs['Emission Color'].default_value = rgb('e0ad72')
    distant_shader.inputs['Emission Strength'].default_value = .45
    for index, position_x in enumerate((29, 35, 42, 50, 57)):
        position_y = 19 + index % 2 * 2
        height = 3.8 + (index % 3) * .8
        box('Distant bank building', (position_x, position_y, .85 + height / 2), (4.3, 4.5, height), distant_wall, 'Background', .035)
        roof_vertices = [(position_x - 2.4, position_y - 2.5, .85 + height),(position_x + 2.4, position_y - 2.5, .85 + height),(position_x + 2.4, position_y + 2.5, .85 + height),(position_x - 2.4, position_y + 2.5, .85 + height),(position_x - 2.4, position_y, height + 2),(position_x + 2.4, position_y, height + 2)]
        mesh('Distant simple tiled roof', roof_vertices, [(0,1,5,4),(4,5,2,3),(0,4,3),(1,2,5)], materials['roof'], 'Background')
        box('Distant chimney', (position_x + 1.1, position_y + .5, height + 1.9), (.55, .7, 1.5), materials['stone'], 'Background', .02)
        for offset in (-1, 1):
            box('Distant recessed window frame', (position_x + offset, position_y - 2.27, height - .2), (.78, .07, 1.12), materials['wood'], 'Background', .01)
            box('Distant warm window', (position_x + offset, position_y - 2.315, height - .2), (.55, .025, .9), distant_window, 'Background', .01)
            box('Distant window mullion', (position_x + offset, position_y - 2.335, height - .2), (.045, .04, .9), materials['wood'], 'Background', 0)
    source_origin = Vector((8, -12.2, .85))
    tree_objects = list(bpy.data.collections['Tree'].objects)
    for index, (position_x, position_y, scale) in enumerate(((16, 5, 1.15), (23, 7, 1.4), (30, 8, 1.25), (39, 11, 1.5))):
        offset = Vector((position_x, position_y, .67)) - source_origin * scale
        for source in tree_objects:
            duplicate = source.copy()
            duplicate.name = f'Distant tree {index} {source.name}'
            collection('Background planting').objects.link(duplicate)
            duplicate.location = source.location * scale + offset
            duplicate.scale = source.scale * scale


def configure_render(quality):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 40 if quality == 'preview' else 144
    scene.cycles.use_denoising = True
    scene.cycles.adaptive_threshold = .04 if quality == 'preview' else .018
    scene.cycles.max_bounces = 8
    scene.cycles.transmission_bounces = 6
    scene.cycles.transparent_max_bounces = 8
    scene.render.resolution_x = 1104 if quality == 'preview' else 1672
    scene.render.resolution_y = 622 if quality == 'preview' else 942
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 1.0
    devices = []
    preferences = bpy.context.preferences.addons['cycles'].preferences
    try:
        preferences.compute_device_type = 'OPTIX'
        preferences.get_devices()
        for device in preferences.devices:
            device.use = device.type == 'OPTIX'
            if device.use:
                devices.append(device.name)
        scene.cycles.device = 'GPU' if devices else 'CPU'
    except Exception as error:
        print('GPU setup fallback:', error)
        scene.cycles.device = 'CPU'
    scene.render.film_transparent = False
    return devices


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--quality', choices=['preview', 'final'], default='preview')
    parser.add_argument('--view', choices=['hero', 'overview'], default='hero')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    start = time.perf_counter()
    random.seed(231026)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    materials = make_materials()
    import shops
    import canal_bridge
    import props
    canal_bridge.build(materials)
    shops.build(materials)
    props.build(materials)
    build_water()
    background_buildings(materials)
    setup_world()
    hero = camera('Hero canal perspective', (-19, -21, 5.2), (1.2, -1.3, 3.9), 32)
    overview = camera('Independent side overview', (26, -24, 19), (1, -2.8, 2.5), 45)
    scene = bpy.context.scene
    scene.camera = hero if options.view == 'hero' else overview
    devices = configure_render(options.quality)
    scene['reference_sha256'] = hashlib.sha256((PROJECT_DIR / 'assets' / 'reference.png').read_bytes()).hexdigest()
    scene['reference_used_as_texture'] = False
    scene['method'] = 'Reference-guided original Blender Python geometry; no image-to-mesh model or MCP bridge.'
    scene['seed'] = 231026
    outputs = PROJECT_DIR / 'assets'
    output_name = 'preview' if options.quality == 'preview' else 'render'
    if options.view == 'overview':
        output_name = 'overview'
    scene.render.filepath = str(outputs / (output_name + '.png'))
    build_seconds = time.perf_counter() - start
    bpy.ops.wm.save_as_mainfile(filepath=str(PROJECT_DIR / 'artifacts' / 'rainy-canal.blend'))
    render_start = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    stats = {
        'blender': bpy.app.version_string,
        'quality': options.quality,
        'view': options.view,
        'resolution': [scene.render.resolution_x, scene.render.resolution_y],
        'samples_max': scene.cycles.samples,
        'devices': devices,
        'object_count': len(scene.objects),
        'mesh_vertices': sum(len(obj.data.vertices) for obj in scene.objects if obj.type == 'MESH'),
        'reference_sha256': scene['reference_sha256'],
        'external_image_dependencies': [image.filepath for image in bpy.data.images if image.source == 'FILE'],
        'build_seconds': round(build_seconds, 2),
        'render_seconds': round(time.perf_counter() - render_start, 2),
        'total_seconds': round(time.perf_counter() - start, 2),
    }
    (outputs / (output_name + '-stats.json')).write_text(json.dumps(stats, indent=2), encoding='utf-8')
    print('RESULT', json.dumps(stats))


if __name__ == '__main__':
    run()
