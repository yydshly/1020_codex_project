import bpy

from scene_utils import rgb


def _context(name):
    material = bpy.data.materials.get(name)
    if material is None or material.get('weathering_v3_applied'):
        return None
    nodes = material.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    geometry = nodes.get('Continuous world coordinates')
    if shader is None or geometry is None:
        raise RuntimeError('Expected v2 material nodes for ' + name)
    return material, nodes, material.node_tree.links, shader, geometry


def _node(nodes, node_type, label):
    result = nodes.new(node_type)
    result.name = 'Weathering ' + label
    result.label = label
    return result


def _noise(nodes, links, geometry, scale, label):
    texture = _node(nodes, 'ShaderNodeTexNoise', label)
    texture.inputs['Scale'].default_value = scale
    texture.inputs['Detail'].default_value = 3.0
    texture.inputs['Roughness'].default_value = 0.64
    links.new(geometry.outputs['Position'], texture.inputs['Vector'])
    return texture.outputs['Fac']


def _remap(nodes, links, source, source_range, target_range, label):
    remap = _node(nodes, 'ShaderNodeMapRange', label)
    remap.clamp = True
    remap.inputs['From Min'].default_value = source_range[0]
    remap.inputs['From Max'].default_value = source_range[1]
    remap.inputs['To Min'].default_value = target_range[0]
    remap.inputs['To Max'].default_value = target_range[1]
    links.new(source, remap.inputs['Value'])
    return remap.outputs['Result']


def _multiply(nodes, links, first, second, label):
    product = _node(nodes, 'ShaderNodeMath', label)
    product.operation = 'MULTIPLY'
    links.new(first, product.inputs[0])
    if isinstance(second, (float, int)):
        product.inputs[1].default_value = second
    else:
        links.new(second, product.inputs[1])
    return product.outputs[0]


def _tint(nodes, links, shader, factor, color, label, blend='MULTIPLY'):
    source = shader.inputs['Base Color'].links[0].from_socket if shader.inputs['Base Color'].is_linked else None
    mix = _node(nodes, 'ShaderNodeMixRGB', label)
    mix.blend_type = blend
    mix.inputs[2].default_value = rgb(color)
    if source is None:
        mix.inputs[1].default_value = shader.inputs['Base Color'].default_value
    else:
        links.new(source, mix.inputs[1])
    if isinstance(factor, (float, int)):
        mix.inputs[0].default_value = factor
    else:
        links.new(factor, mix.inputs[0])
    links.new(mix.outputs['Color'], shader.inputs['Base Color'])


def _wall(name):
    context = _context(name)
    if context is None:
        return False
    material, nodes, links, shader, geometry = context
    patches = _noise(nodes, links, geometry, 2.25, 'Lime plaster softened age patches')
    mask = _remap(nodes, links, patches, (0.39, 0.70), (0.02, 0.63), 'Restrained plaster discoloration')
    _tint(nodes, links, shader, mask, 'A99B85', 'Warm mineral weathering')
    coarse = _noise(nodes, links, geometry, 8.5, 'Old plaster shallow unevenness')
    bump = _node(nodes, 'ShaderNodeBump', 'Shallow old lime plaster relief')
    bump.inputs['Strength'].default_value = 0.16
    bump.inputs['Distance'].default_value = 0.023
    if shader.inputs['Normal'].is_linked:
        links.new(shader.inputs['Normal'].links[0].from_socket, bump.inputs['Normal'])
    links.new(coarse, bump.inputs['Height'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    material['weathering_v3_applied'] = True
    return True


def _stone(name):
    context = _context(name)
    if context is None:
        return False
    material, nodes, links, shader, geometry = context
    weather = _noise(nodes, links, geometry, 4.3, 'Broken stone mineral aging')
    patch_mask = _remap(nodes, links, weather, (0.32, 0.72), (0.05, 0.29), 'Stone age restraint')
    _tint(nodes, links, shader, patch_mask, '8D8875', 'Soft mottled stone faces')
    height = _node(nodes, 'ShaderNodeSeparateXYZ', 'World height above canal')
    links.new(geometry.outputs['Position'], height.inputs['Vector'])
    low_zone = _remap(nodes, links, height.outputs['Z'], (-0.05, 0.72), (0.76, 0.0), 'Waterline stain falloff')
    moss_pattern = _noise(nodes, links, geometry, 3.8, 'Broken waterline mineral and moss')
    moss_mask = _remap(nodes, links, moss_pattern, (0.32, 0.70), (0.10, 0.83), 'Sparse moss coverage')
    local_moss = _multiply(nodes, links, low_zone, moss_mask, 'Moss only close to water')
    _tint(nodes, links, shader, local_moss, '555C3D', 'Desaturated damp waterline moss', blend='MIX')
    material['weathering_v3_applied'] = True
    return True


def _paving(name):
    context = _context(name)
    if context is None:
        return False
    material, nodes, links, shader, geometry = context
    broad = _noise(nodes, links, geometry, 0.78, 'Connected rainwater patches')
    wet_mask = _remap(nodes, links, broad, (0.43, 0.65), (0.0, 1.0), 'Partial wet ground coverage')
    damp_color = _multiply(nodes, links, wet_mask, 0.60, 'Wet stone darkening amount')
    _tint(nodes, links, shader, damp_color, 'A8A18B', 'Darker saturated wet stone')
    links.new(_remap(nodes, links, wet_mask, (0.0, 1.0), (0.48, 0.065), 'Dry to wet stone roughness'), shader.inputs['Roughness'])
    links.new(_remap(nodes, links, wet_mask, (0.0, 1.0), (0.025, 0.82), 'Partial thin water film'), shader.inputs['Coat Weight'])
    links.new(_remap(nodes, links, wet_mask, (0.0, 1.0), (0.30, 0.055), 'Smooth rainwater coat'), shader.inputs['Coat Roughness'])
    shader.inputs['Coat IOR'].default_value = 1.333
    links.new(geometry.outputs['Normal'], shader.inputs['Coat Normal'])
    material['weathering_v3_applied'] = True
    return True


def improve_weathering():
    changed = []
    for name in ('plaster', 'plaster_alt'):
        if _wall(name):
            changed.append(name)
    for name in ('stone', 'stone_light'):
        if _stone(name):
            changed.append(name)
    for name in ('paving', 'paving_alt'):
        if _paving(name):
            changed.append(name)
    context = _context('mortar')
    if context is not None:
        material, nodes, links, shader, geometry = context
        _tint(nodes, links, shader, 0.42, '9C9884', 'Recessed damp joint tone')
        material['weathering_v3_applied'] = True
        changed.append('mortar')
    return {
        'materials_updated': changed,
        'wall_finish': 'Soft visible aged lime patches with shallow relief',
        'stone_finish': 'Restrained mottling, darker joints and low waterline moss',
        'paving_finish': 'Local darker wet patches with smooth IOR 1.333 water coat',
        'geometry_and_lights_changed': False,
    }
