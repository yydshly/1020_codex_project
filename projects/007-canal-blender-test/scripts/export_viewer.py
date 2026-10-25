import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys
import time

import bpy
from mathutils import Vector


PROJECT_DIR = Path(__file__).resolve().parents[1]


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def gltf_vector(value):
    return [round(float(value[0]), 6), round(float(value[2]), 6), round(-float(value[1]), 6)]


def scene_bounds(points):
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return {
        'min': minimum,
        'max': maximum,
        'size': [round(maximum[axis] - minimum[axis], 6) for axis in range(3)],
        'center': [round((maximum[axis] + minimum[axis]) / 2, 6) for axis in range(3)],
    }


def scalar_input(shader, name, fallback):
    if shader is None or name not in shader.inputs:
        return fallback
    socket = shader.inputs[name]
    if socket.is_linked:
        origin = socket.links[0].from_node
        if origin.bl_idname == 'ShaderNodeMapRange':
            return float((origin.inputs['To Min'].default_value + origin.inputs['To Max'].default_value) / 2)
    return float(socket.default_value)


def preview_material(source):
    name = source.name if source else 'Unassigned material'
    material = bpy.data.materials.new('Viewer / ' + name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    original = None if source is None or not source.use_nodes else next((node for node in source.node_tree.nodes if node.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
    color = list(source.diffuse_color) if source else [0.5, 0.5, 0.5, 1]
    if original and not original.inputs['Base Color'].is_linked:
        color = list(original.inputs['Base Color'].default_value)
    color[3] = 1
    roughness = max(0.005, min(1, scalar_input(original, 'Roughness', 0.6)))
    metallic = max(0, min(1, scalar_input(original, 'Metallic', 0)))
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['IOR'].default_value = scalar_input(original, 'IOR', 1.5)
    transmission = scalar_input(original, 'Transmission Weight', 0)
    alpha = 0.18 if 'glass' in name.lower() else 1
    if alpha < 1:
        shader.inputs['Alpha'].default_value = alpha
        material.surface_render_method = 'DITHERED'
        material.use_transparency_overlap = False
    if original and 'Emission Color' in original.inputs:
        shader.inputs['Emission Color'].default_value = original.inputs['Emission Color'].default_value
        shader.inputs['Emission Strength'].default_value = scalar_input(original, 'Emission Strength', 0)
    material.diffuse_color = color[:3] + [alpha]
    material.use_backface_culling = False
    return material, {
        'name': name,
        'base_color_linear': color,
        'roughness': round(roughness, 5),
        'metallic': round(metallic, 5),
        'alpha': alpha,
        'source_transmission': transmission,
        'procedural_nodes_baked': False,
    }


def read_glb(path):
    content = path.read_bytes()
    magic, version, declared_length = struct.unpack_from('<4sII', content)
    if magic != b'glTF' or version != 2 or declared_length != len(content):
        raise ValueError('Invalid GLB header or length.')
    position = 12
    document = None
    binary_bytes = 0
    while position < len(content):
        length, chunk_type = struct.unpack_from('<II', content, position)
        position += 8
        if position + length > len(content):
            raise ValueError('GLB chunk exceeds the file size.')
        chunk = content[position:position + length]
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode('utf-8').rstrip(' \0'))
        elif chunk_type == 0x004E4942:
            binary_bytes += length
        position += length
    if not document or not binary_bytes:
        raise ValueError('GLB requires both JSON and actual binary geometry.')
    if any('uri' in entry for entry in document.get('buffers', []) + document.get('images', [])):
        raise ValueError('The structural viewer must not depend on external buffers or images.')
    primitives = [primitive for entry in document.get('meshes', []) for primitive in entry.get('primitives', [])]
    vertices = sum(document['accessors'][primitive['attributes']['POSITION']]['count'] for primitive in primitives)
    triangles = sum(document['accessors'][primitive['indices']]['count'] // 3 for primitive in primitives)
    if vertices < 10000 or triangles < 10000:
        raise ValueError('Export lacks the expected scene geometry.')
    return document, {'meshes': len(document.get('meshes', [])), 'primitives': len(primitives), 'vertices': vertices, 'triangles': triangles, 'binary_bytes': binary_bytes}


def export(source, label):
    started = time.perf_counter()
    source_hash = digest(source)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    original_scene = bpy.context.scene
    source_objects = list(original_scene.objects)
    source_info = {
        'objects': len(source_objects),
        'mesh_objects': sum(obj.type == 'MESH' for obj in source_objects),
        'curve_objects': sum(obj.type == 'CURVE' for obj in source_objects),
        'base_vertices': sum(len(obj.data.vertices) for obj in source_objects if obj.type == 'MESH'),
        'base_faces': sum(len(obj.data.polygons) for obj in source_objects if obj.type == 'MESH'),
        'lights': sum(obj.type == 'LIGHT' for obj in source_objects),
    }
    source_camera = original_scene.camera
    position = source_camera.matrix_world.translation
    forward = source_camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))
    up = source_camera.matrix_world.to_quaternion() @ Vector((0, 1, 0))
    target_distance = max(1, (Vector((2, -4, 3.5)) - position).dot(forward))
    camera_data = {
        'position': gltf_vector(position),
        'target': gltf_vector(position + forward * target_distance),
        'forward': gltf_vector(forward),
        'up': gltf_vector(up),
        'fov_y_degrees': round(math.degrees(2 * math.atan(math.tan(source_camera.data.angle_x / 2) * original_scene.render.resolution_y / original_scene.render.resolution_x)), 6),
        'source_camera_name': source_camera.name,
    }
    skipped_modifiers = defaultdict(int)
    for obj in source_objects:
        for modifier in obj.modifiers:
            if modifier.type in ('BEVEL', 'SUBSURF', 'WEIGHTED_NORMAL'):
                modifier.show_viewport = False
                modifier.show_render = False
                skipped_modifiers[modifier.type] += 1
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    batches = {}
    included_objects = 0
    excluded_types = defaultdict(int)
    excluded_hidden = 0
    for obj in source_objects:
        if obj.type not in ('MESH', 'CURVE', 'SURFACE', 'FONT'):
            excluded_types[obj.type] += 1
            continue
        if obj.hide_render:
            excluded_hidden += 1
            continue
        evaluated = obj.evaluated_get(graph)
        source_mesh = evaluated.to_mesh()
        if source_mesh is None:
            continue
        source_mesh.calc_loop_triangles()
        matrix = obj.matrix_world
        vertex_maps = {}
        for triangle in source_mesh.loop_triangles:
            slot = triangle.material_index
            material = source_mesh.materials[slot] if slot < len(source_mesh.materials) else None
            key = material.name if material else 'Unassigned material'
            if key not in batches:
                batches[key] = {'vertices': [], 'faces': [], 'smooth': [], 'source_material': material}
            batch = batches[key]
            vertex_map = vertex_maps.setdefault(key, {})
            face = []
            for vertex_index in triangle.vertices:
                if vertex_index not in vertex_map:
                    coordinates = matrix @ source_mesh.vertices[vertex_index].co
                    if not all(math.isfinite(component) for component in coordinates):
                        raise ValueError('Source scene contains non-finite coordinates.')
                    vertex_map[vertex_index] = len(batch['vertices'])
                    batch['vertices'].append(tuple(coordinates))
                face.append(vertex_map[vertex_index])
            if matrix.determinant() < 0:
                face.reverse()
            batch['faces'].append(face)
            batch['smooth'].append(source_mesh.polygons[triangle.polygon_index].use_smooth)
        evaluated.to_mesh_clear()
        included_objects += 1
    temporary_scene = bpy.data.scenes.new('Structural preview export - disposable')
    bpy.context.window.scene = temporary_scene
    materials = []
    all_bounds = []
    merged_vertices = 0
    merged_triangles = 0
    for key, batch in batches.items():
        material, material_info = preview_material(batch['source_material'])
        materials.append(material_info)
        mesh = bpy.data.meshes.new('Structural mesh / ' + key)
        mesh.from_pydata(batch['vertices'], [], batch['faces'])
        mesh.update()
        mesh.materials.append(material)
        for polygon, smooth in zip(mesh.polygons, batch['smooth']):
            polygon.use_smooth = smooth
        obj = bpy.data.objects.new('Material group / ' + key, mesh)
        temporary_scene.collection.objects.link(obj)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        merged_vertices += len(batch['vertices'])
        merged_triangles += len(batch['faces'])
        all_bounds.extend(gltf_vector(point) for point in obj.bound_box)
    bpy.context.view_layer.update()
    all_bounds = [gltf_vector(obj.matrix_world @ Vector(point)) for obj in temporary_scene.objects for point in obj.bound_box]
    destination_dir = PROJECT_DIR / 'web' / 'models'
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / f'canal-{label}.glb'
    bpy.ops.export_scene.gltf(
        filepath=str(destination),
        export_format='GLB',
        use_selection=True,
        use_active_scene=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_yup=True,
        export_apply=False,
        export_normals=True,
        export_texcoords=False,
        export_tangents=False,
        export_materials='EXPORT',
    )
    document, geometry = read_glb(destination)
    if len(document.get('scenes', [])) != 1 or geometry['meshes'] != len(batches) or geometry['triangles'] != merged_triangles:
        raise RuntimeError('GLB includes unexpected geometry outside the temporary export scene.')
    if digest(source) != source_hash:
        raise RuntimeError('Source blend changed during structural export.')
    manifest = {
        'schema_version': 1,
        'label': label,
        'asset': destination.name,
        'bytes': destination.stat().st_size,
        'sha256': digest(destination),
        'source': {'filename': source.name, 'sha256': source_hash, 'unchanged': True, 'blender': bpy.app.version_string},
        'coordinate_system': 'glTF Y-up, meters; Blender (x,y,z) maps to glTF (x,z,-y)',
        'geometry': {
            'source_objects': source_info,
            'included_geometry_objects': included_objects,
            'merged_base_vertices': merged_vertices,
            'merged_triangles': merged_triangles,
            'export_meshes': geometry['meshes'],
            'export_primitives': geometry['primitives'],
            'vertices': geometry['vertices'],
            'triangles': geometry['triangles'],
            'binary_bytes': geometry['binary_bytes'],
            'excluded_object_types': dict(excluded_types),
            'excluded_hidden_objects': excluded_hidden,
            'omitted_modifier_types': dict(skipped_modifiers),
        },
        'bounds_glTF': scene_bounds(all_bounds),
        'focus_bounds_glTF': scene_bounds([[-12, -1, -8], [16, 9, 16]]),
        'camera_glTF': camera_data,
        'materials': materials,
        'extensions_used': document.get('extensionsUsed', []),
        'external_dependencies': [],
        'render_used_as_texture': False,
        'reference_used_as_texture': False,
        'source_geometry_is_preserved': 'All render-visible mesh and curve objects retained; render-only bevel/subdivision/weighted-normal modifiers omitted; instances merged by material.',
        'limitations': [
            'Interactive structural preview, not a Cycles-quality reproduction of the rendered image.',
            'Procedural weathering, noise, bump, wetness layers, world sky and compositor depth haze are not baked into textures.',
            'PBR materials approximate source base colors, roughness and metalness; glass uses alpha transparency instead of physical refraction.',
            'Real water mesh remains, but ray-traced reflections, refraction and caustics are not included.',
            'Source lights and cameras are not included in the GLB; the viewer supplies lighting and uses the recorded camera.',
            'Objects are merged by material to reduce draw calls, so this GLB is for spatial inspection rather than individual-object editing.',
            'Distant terrain is retained; use focus_bounds_glTF or camera_glTF to avoid fitting the entire long canal into the initial view.',
        ],
        'export_seconds': round(time.perf_counter() - started, 2),
    }
    payload = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    (destination_dir / f'canal-{label}-manifest.json').write_text(payload, encoding='utf-8')
    (destination_dir / f'viewer-manifest-{label}.json').write_text(payload, encoding='utf-8')
    if label == 'v3' or not (destination_dir / 'viewer-manifest.json').exists():
        (destination_dir / 'viewer-manifest.json').write_text(payload, encoding='utf-8')
    print('VIEWER_EXPORT', json.dumps({'asset': destination.name, 'bytes': manifest['bytes'], 'meshes': geometry['meshes'], 'vertices': geometry['vertices'], 'triangles': geometry['triangles'], 'seconds': manifest['export_seconds'], 'source_unchanged': True}))


def main():
    parser = argparse.ArgumentParser(description='Export a compact real-geometry preview without modifying the source Blender file.')
    parser.add_argument('--source', type=Path, default=PROJECT_DIR / 'artifacts' / 'rainy-canal-v3.blend')
    parser.add_argument('--label', default='v3')
    arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    options = parser.parse_args(arguments)
    if not re.fullmatch(r'[A-Za-z0-9_-]+', options.label):
        parser.error('Label may contain only letters, digits, underscores and hyphens.')
    source = options.source.resolve(strict=True)
    if source.suffix.lower() != '.blend':
        parser.error('Source must be a Blender .blend file.')
    export(source, options.label)


if __name__ == '__main__':
    main()
