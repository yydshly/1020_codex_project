import math

import bpy
from mathutils import Vector


def rgb(hex_color):
    color = hex_color.lstrip('#')
    channels = [int(color[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    return tuple(value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in channels) + (1,)


def collection(name):
    target = bpy.data.collections.get(name)
    if target is None:
        target = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(target)
    return target


def move(obj, group):
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection(group).objects.link(obj)
    return obj


def mesh(name, vertices, faces, material, group, indices=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection(group).objects.link(obj)
    materials = material if isinstance(material, (list, tuple)) else [material]
    for entry in materials:
        data.materials.append(entry)
    if indices is not None:
        for polygon, index in zip(data.polygons, indices):
            polygon.material_index = index
    return obj


def bevel(obj, width=0.025, segments=2):
    modifier = obj.modifiers.new('Worn edge', 'BEVEL')
    modifier.width = width
    modifier.segments = segments
    return obj


def box(name, center, size, material, group='Architecture', edge=0.025):
    half = [value / 2 for value in size]
    vertices = [(signs[0] * half[0], signs[1] * half[1], signs[2] * half[2]) for signs in ((-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1))]
    faces = [(0,2,6,4),(1,5,7,3),(0,4,5,1),(2,3,7,6),(0,1,3,2),(4,6,7,5)]
    obj = mesh(name, vertices, faces, material, group)
    obj.location = center
    if edge:
        bevel(obj, edge)
    return obj


def cylinder(name, start, end, radius, material, group='Props', vertices=12, radius_end=None):
    start_point = Vector(start)
    end_point = Vector(end)
    direction = end_point - start_point
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius if radius_end is None else radius_end, depth=direction.length, location=(start_point + end_point) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return move(obj, group)


def curve(name, points, radius, material, group='Props', cyclic=False):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = radius
    data.bevel_resolution = 2
    spline = data.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for destination, point in zip(spline.points, points):
        destination.co = (*point, 1)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    collection(group).objects.link(obj)
    data.materials.append(material)
    return obj


def sphere(name, center, radius, material, group='Props', scale=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=radius, location=center)
    obj = bpy.context.object
    obj.name = name
    if scale:
        obj.scale = scale
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return move(obj, group)


def light(name, center, color, energy, size=1, target=None, kind='AREA', group='Lighting'):
    data = bpy.data.lights.new(name, kind)
    data.color = color
    data.energy = energy
    if kind == 'AREA':
        data.shape = 'DISK'
        data.size = size
    elif kind == 'POINT':
        data.shadow_soft_size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = center
    collection(group).objects.link(obj)
    if target is not None:
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj
