import bpy
from mathutils import Vector, noise

from scene_utils import rgb


def _node(nodes, node_type, label):
    result = nodes.new(node_type)
    result.name = label
    result.label = label
    return result


def _material_tree(name):
    material = bpy.data.materials.get(name)
    if material is None:
        raise RuntimeError('Expected existing material: ' + name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    shader = _node(nodes, 'ShaderNodeBsdfPrincipled', 'Principled BSDF')
    output = _node(nodes, 'ShaderNodeOutputMaterial', 'Material Output')
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    geometry = _node(nodes, 'ShaderNodeNewGeometry', 'Continuous world coordinates')
    return material, nodes, links, shader, geometry


def _noise(nodes, links, coordinates, scale, detail, label):
    texture = _node(nodes, 'ShaderNodeTexNoise', label)
    texture.inputs['Scale'].default_value = scale
    texture.inputs['Detail'].default_value = detail
    texture.inputs['Roughness'].default_value = 0.62
    links.new(coordinates, texture.inputs['Vector'])
    return texture


def _range(nodes, links, source, output_minimum, output_maximum, label):
    remap = _node(nodes, 'ShaderNodeMapRange', label)
    remap.inputs['From Min'].default_value = 0.24
    remap.inputs['From Max'].default_value = 0.76
    remap.inputs['To Min'].default_value = output_minimum
    remap.inputs['To Max'].default_value = output_maximum
    remap.clamp = True
    links.new(source, remap.inputs['Value'])
    return remap.outputs['Result']


def _mineral(name, dark_color, light_color, scale, roughness, relief, wet=False):
    material, nodes, links, shader, geometry = _material_tree(name)
    material.diffuse_color = rgb(light_color)
    broad = _noise(nodes, links, geometry.outputs['Position'], scale, 3.0, 'Subtle mineral variation')
    color_source = broad.outputs['Fac']
    if wet:
        island_weight = _node(nodes, 'ShaderNodeMath', 'Small variation between separate stones')
        island_weight.operation = 'MULTIPLY'
        island_weight.inputs[1].default_value = 0.17
        links.new(geometry.outputs['Random Per Island'], island_weight.inputs[0])
        mineral_weight = _node(nodes, 'ShaderNodeMath', 'Continuous mineral contribution')
        mineral_weight.operation = 'MULTIPLY'
        mineral_weight.inputs[1].default_value = 0.83
        links.new(color_source, mineral_weight.inputs[0])
        combined = _node(nodes, 'ShaderNodeMath', 'Stone variation combined')
        combined.operation = 'ADD'
        links.new(island_weight.outputs[0], combined.inputs[0])
        links.new(mineral_weight.outputs[0], combined.inputs[1])
        color_source = combined.outputs[0]
    colors = _node(nodes, 'ShaderNodeValToRGB', 'Restrained mineral colors')
    colors.color_ramp.elements[0].position = 0.22
    colors.color_ramp.elements[0].color = rgb(dark_color)
    colors.color_ramp.elements[1].position = 0.80
    colors.color_ramp.elements[1].color = rgb(light_color)
    links.new(color_source, colors.inputs['Fac'])
    links.new(colors.outputs['Color'], shader.inputs['Base Color'])
    fine = _noise(nodes, links, geometry.outputs['Position'], 62.0, 2.0, 'Fine restrained surface grain')
    bump = _node(nodes, 'ShaderNodeBump', 'Fine mineral relief')
    bump.inputs['Strength'].default_value = 0.19
    bump.inputs['Distance'].default_value = relief
    links.new(fine.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    roughness_source = broad.outputs['Fac']
    if wet:
        wetness = _noise(nodes, links, geometry.outputs['Position'], 1.15, 2.0, 'Patchy retained rainwater')
        roughness_source = wetness.outputs['Fac']
        shader.inputs['Coat Weight'].default_value = 0.30
        shader.inputs['Coat Roughness'].default_value = 0.10
        links.new(bump.outputs['Normal'], shader.inputs['Coat Normal'])
    links.new(_range(nodes, links, roughness_source, roughness[0], roughness[1], 'Natural roughness range'), shader.inputs['Roughness'])
    shader.inputs['Specular IOR Level'].default_value = 0.34 if wet else 0.28
    return name


def _soften_existing(name, roughness, grain_strength=0.10):
    material = bpy.data.materials.get(name)
    if material is None or not material.use_nodes:
        return None
    shader = material.node_tree.nodes.get('Principled BSDF')
    if shader is None:
        return None
    shader.inputs['Roughness'].default_value = roughness
    for node in material.node_tree.nodes:
        if node.bl_idname == 'ShaderNodeBump':
            node.inputs['Strength'].default_value = grain_strength
            node.inputs['Distance'].default_value = 0.018
        elif node.bl_idname == 'ShaderNodeValToRGB':
            base_color = material.diffuse_color
            node.color_ramp.elements[0].color = tuple(channel * 0.76 for channel in base_color[:3]) + (1.0,)
            node.color_ramp.elements[-1].color = tuple(min(1.0, channel * 1.12) for channel in base_color[:3]) + (1.0,)
    return name


def _water():
    material, nodes, links, shader, geometry = _material_tree('Canal water')
    material.diffuse_color = rgb('263E3C')
    shader.inputs['Base Color'].default_value = rgb('263E3C')
    shader.inputs['Roughness'].default_value = 0.125
    shader.inputs['Metallic'].default_value = 0.0
    shader.inputs['IOR'].default_value = 1.333
    shader.inputs['Transmission Weight'].default_value = 0.32
    shader.inputs['Specular IOR Level'].default_value = 0.5
    mapping = _node(nodes, 'ShaderNodeVectorMath', 'Short irregular cross ripples')
    mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = (1.3, 3.4, 1.0)
    links.new(geometry.outputs['Position'], mapping.inputs[0])
    fine = _noise(nodes, links, mapping.outputs['Vector'], 4.3, 2.3, 'Fine broken water reflection')
    broad = _noise(nodes, links, geometry.outputs['Position'], 1.45, 2.0, 'Broad irregular water ripple')
    lower_bump = _node(nodes, 'ShaderNodeBump', 'Gentle broad water normal')
    lower_bump.inputs['Strength'].default_value = 0.16
    lower_bump.inputs['Distance'].default_value = 0.026
    links.new(broad.outputs['Fac'], lower_bump.inputs['Height'])
    upper_bump = _node(nodes, 'ShaderNodeBump', 'Small reflection breakup')
    upper_bump.inputs['Strength'].default_value = 0.32
    upper_bump.inputs['Distance'].default_value = 0.045
    links.new(fine.outputs['Fac'], upper_bump.inputs['Height'])
    links.new(lower_bump.outputs['Normal'], upper_bump.inputs['Normal'])
    links.new(upper_bump.outputs['Normal'], shader.inputs['Normal'])
    links.new(_range(nodes, links, broad.outputs['Fac'], 0.045, 0.11, 'Water reflection variation'), shader.inputs['Roughness'])
    water_object = bpy.data.objects.get('Continuous canal with real ripple geometry')
    adjusted_vertices = 0
    if water_object is not None and water_object.type == 'MESH':
        for vertex in water_object.data.vertices:
            coordinate_x, coordinate_y = vertex.co.x, vertex.co.y
            broad_height = noise.noise(Vector((coordinate_x * 0.63, coordinate_y * 1.18, 2.37)), noise_basis='PERLIN_ORIGINAL')
            small_height = noise.noise(Vector((coordinate_x * 1.83, coordinate_y * 2.97, 7.31)), noise_basis='PERLIN_ORIGINAL')
            vertex.co.z = 0.022 * broad_height + 0.008 * small_height
            adjusted_vertices += 1
        water_object.data.update()
    return adjusted_vertices


def refine_materials():
    refined = [
        _mineral('plaster', 'C4B49B', 'E5D7BD', 0.95, (0.73, 0.87), 0.009),
        _mineral('plaster_alt', 'C0B29E', 'E0D4BE', 1.05, (0.73, 0.87), 0.009),
        _mineral('stone', '777468', 'A29B87', 2.7, (0.46, 0.70), 0.018),
        _mineral('stone_light', 'A29882', 'C3B79E', 3.2, (0.48, 0.69), 0.016),
        _mineral('paving', '615E52', '8F8876', 2.2, (0.07, 0.34), 0.022, wet=True),
        _mineral('paving_alt', '716A5A', 'A29881', 2.5, (0.09, 0.38), 0.022, wet=True),
        _mineral('mortar', '676355', '807867', 6.0, (0.76, 0.91), 0.014),
    ]
    for material_name, roughness in (('wood', 0.46), ('wood_light', 0.53), ('teal', 0.47), ('olive', 0.50), ('roof', 0.57), ('roof_alt', 0.56), ('fabric', 0.89)):
        result = _soften_existing(material_name, roughness)
        if result:
            refined.append(result)
    adjusted_water_vertices = _water()
    refined.append('Canal water')
    return {
        'materials_refined': refined,
        'water_existing_vertices_adjusted': adjusted_water_vertices,
        'objects_added': 0,
        'vertices_added': 0,
        'modifiers_added': 0,
        'look': 'Warm restrained plaster, varied wet stone, softened grain, irregular water reflections',
    }
