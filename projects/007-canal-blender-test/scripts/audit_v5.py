import argparse
from array import array
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time

import bpy


PROJECT_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = PROJECT_DIR.parents[1]
SOURCE = PROJECT_DIR / 'artifacts' / 'rainy-canal-v4.blend'
BASELINE = PROJECT_DIR / 'assets' / 'v5-baseline-audit.json'
ALLOWED_COLLECTIONS = {'01 Cafe', '02 Bookshop', '03 Pottery shop'}


def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def json_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()


def plain(value):
    if isinstance(value, (str, bool, int, float)) or value is None:
        return value
    if isinstance(value, set):
        return sorted(value)
    if isinstance(value, bpy.types.ID):
        return {'type': value.bl_rna.identifier, 'name': value.name_full}
    try:
        return [plain(component) for component in value]
    except TypeError:
        return str(value)


def settings(owner, excluded=(), depth=0):
    if owner is None:
        return None
    result = {}
    for prop in owner.bl_rna.properties:
        name = prop.identifier
        if name in excluded or name in {'rna_type', 'id_data', 'preview', 'library', 'override_library', 'asset_data', 'animation_data'}:
            continue
        if prop.is_readonly and prop.type not in {'POINTER', 'COLLECTION'}:
            continue
        value = getattr(owner, name)
        if prop.type in {'BOOLEAN', 'INT', 'FLOAT', 'STRING', 'ENUM'}:
            result[name] = plain(value)
        elif prop.type == 'POINTER':
            if value is None or isinstance(value, bpy.types.ID):
                result[name] = plain(value)
            elif depth < 3:
                result[name] = settings(value, depth=depth + 1)
        elif prop.type == 'COLLECTION' and depth < 3:
            result[name] = [settings(item, depth=depth + 1) for item in value]
    return result


def node_tree(tree):
    if tree is None:
        return None
    nodes = {}
    for node in tree.nodes:
        nodes[node.name] = {
            'type': node.bl_idname,
            'properties': settings(node, {'inputs', 'outputs', 'internal_links'}),
            'inputs': [{'index': index, 'identifier': socket.identifier, 'name': socket.name, 'default': plain(socket.default_value) if hasattr(socket, 'default_value') else None} for index, socket in enumerate(node.inputs)],
            'outputs': [{'index': index, 'identifier': socket.identifier, 'name': socket.name, 'default': plain(socket.default_value) if hasattr(socket, 'default_value') else None} for index, socket in enumerate(node.outputs)],
        }
    return {'nodes': nodes, 'links': sorted([link.from_node.name, link.from_socket.identifier, link.to_node.name, link.to_socket.identifier] for link in tree.links)}


def packed_hash(collection, property_name, width, kind='f'):
    values = array(kind, [0]) * (len(collection) * width)
    collection.foreach_get(property_name, values)
    return hashlib.sha256(values.tobytes()).hexdigest()


def mesh_state(data):
    fields = {'FLOAT': ('value', 1, 'f'), 'INT': ('value', 1, 'i'), 'BOOLEAN': ('value', 1, 'b'), 'FLOAT_VECTOR': ('vector', 3, 'f'), 'FLOAT2': ('vector', 2, 'f'), 'INT32_2D': ('value', 2, 'i'), 'FLOAT_COLOR': ('color', 4, 'f'), 'BYTE_COLOR': ('color', 4, 'f')}
    attributes = {}
    for attribute in data.attributes:
        if attribute.name == 'position' or attribute.name.startswith('.select'):
            continue
        if attribute.data_type in fields:
            field, width, kind = fields[attribute.data_type]
            content = packed_hash(attribute.data, field, width, kind)
        else:
            content = json_hash([settings(item) for item in attribute.data])
        attributes[attribute.name] = {'type': attribute.data_type, 'domain': attribute.domain, 'count': len(attribute.data), 'sha256': content}
    return {
        'type': 'MESH', 'name': data.name,
        'vertices': len(data.vertices), 'edges': len(data.edges), 'faces': len(data.polygons), 'loops': len(data.loops),
        'coordinate_sha256': packed_hash(data.vertices, 'co', 3),
        'topology_sha256': json_hash({'edges': packed_hash(data.edges, 'vertices', 2, 'i'), 'corners': packed_hash(data.loops, 'vertex_index', 1, 'i'), 'loop_start': packed_hash(data.polygons, 'loop_start', 1, 'i'), 'loop_total': packed_hash(data.polygons, 'loop_total', 1, 'i')}),
        'material_indices_sha256': packed_hash(data.polygons, 'material_index', 1, 'i'),
        'smooth_faces_sha256': packed_hash(data.polygons, 'use_smooth', 1, 'b'),
        'attributes': attributes,
        'materials': [material.name if material else None for material in data.materials],
    }


def curve_state(data):
    coordinates = []
    splines = []
    for spline in data.splines:
        splines.append({'properties': settings(spline, {'points', 'bezier_points'}), 'points': [settings(point, {'co', 'handle_left', 'handle_right', 'select', 'select_control_point', 'select_left_handle', 'select_right_handle'}) for point in list(spline.points) + list(spline.bezier_points)]})
        coordinates.append([{'co': plain(point.co), 'left': plain(point.handle_left) if hasattr(point, 'handle_left') else None, 'right': plain(point.handle_right) if hasattr(point, 'handle_right') else None} for point in list(spline.points) + list(spline.bezier_points)])
    return {'type': 'CURVE', 'name': data.name, 'properties': settings(data, {'splines', 'materials', 'shape_keys'}), 'splines': splines, 'points': sum(len(spline.points) + len(spline.bezier_points) for spline in data.splines), 'coordinate_sha256': json_hash(coordinates), 'materials': [material.name if material else None for material in data.materials]}


def website_hashes():
    roots = {'project_web': PROJECT_DIR / 'web', 'built_site_007': REPO_DIR / '_site' / 'projects' / PROJECT_DIR.name}
    return {label: {'exists': root.exists(), 'files': {path.relative_to(root).as_posix(): {'bytes': path.stat().st_size, 'sha256': file_hash(path)} for path in sorted(root.rglob('*')) if path.is_file()}} for label, root in roots.items()}


def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene = bpy.context.scene
    data_cache = {}
    objects = {}
    for obj in bpy.data.objects:
        collections = sorted(group.name for group in obj.users_collection)
        data = None
        if obj.type in {'MESH', 'CURVE'}:
            cache_key = (obj.type, obj.data.name)
            if cache_key not in data_cache:
                data_cache[cache_key] = mesh_state(obj.data) if obj.type == 'MESH' else curve_state(obj.data)
            data = data_cache[cache_key]
        elif obj.data is not None:
            data = {'properties': settings(obj.data, {'node_tree'}), 'nodes': node_tree(obj.data.node_tree) if hasattr(obj.data, 'node_tree') else None}
        objects[obj.name] = {
            'type': obj.type, 'collections': collections,
            'allowed_building_deformation': obj.type in {'MESH', 'CURVE'} and bool(ALLOWED_COLLECTIONS.intersection(collections)),
            'transform': {name: plain(getattr(obj, name)) for name in ('location', 'rotation_mode', 'rotation_euler', 'rotation_quaternion', 'rotation_axis_angle', 'scale', 'delta_location', 'delta_rotation_euler', 'delta_rotation_quaternion', 'delta_scale', 'matrix_world', 'matrix_local', 'matrix_basis', 'matrix_parent_inverse')},
            'visibility': {name: plain(getattr(obj, name)) for name in dir(obj) if name.startswith(('hide_', 'visible_')) and not callable(getattr(obj, name))},
            'parent': obj.parent.name if obj.parent else None,
            'parent_type': obj.parent_type, 'parent_bone': obj.parent_bone,
            'constraints': [settings(item) for item in obj.constraints],
            'modifiers': [settings(item) for item in obj.modifiers],
            'material_slots': [{'link': slot.link, 'material': slot.material.name if slot.material else None} for slot in obj.material_slots],
            'data': data,
        }
    counts = {'objects': len(objects), 'mesh_objects': sum(obj.type == 'MESH' for obj in bpy.data.objects), 'curve_objects': sum(obj.type == 'CURVE' for obj in bpy.data.objects), 'vertices': sum(len(obj.data.vertices) for obj in bpy.data.objects if obj.type == 'MESH'), 'faces': sum(len(obj.data.polygons) for obj in bpy.data.objects if obj.type == 'MESH'), 'curve_points': sum(sum(len(spline.points) + len(spline.bezier_points) for spline in obj.data.splines) for obj in bpy.data.objects if obj.type == 'CURVE'), 'modifiers': sum(len(obj.modifiers) for obj in bpy.data.objects), 'lights': sum(obj.type == 'LIGHT' for obj in bpy.data.objects), 'cameras': sum(obj.type == 'CAMERA' for obj in bpy.data.objects)}
    materials = {material.name: {'properties': settings(material, {'node_tree', 'texture_paint_images', 'texture_paint_slots'}), 'nodes': node_tree(material.node_tree)} for material in bpy.data.materials}
    worlds = {world.name: {'properties': settings(world, {'node_tree'}), 'nodes': node_tree(world.node_tree)} for world in bpy.data.worlds}
    locked_scene = {
        'camera': scene.camera.name if scene.camera else None, 'world': scene.world.name if scene.world else None,
        'view_settings': settings(scene.view_settings), 'display_settings': settings(scene.display_settings),
        'sequencer_colorspace': settings(scene.sequencer_colorspace_settings),
        'render': settings(scene.render, {'resolution_x', 'resolution_y', 'resolution_percentage', 'filepath'}),
        'cycles': settings(scene.cycles, {'samples', 'adaptive_threshold'}),
        'compositor': node_tree(scene.node_tree),
        'collections': {group.name: {'objects': sorted(obj.name for obj in group.objects), 'children': sorted(child.name for child in group.children), 'visibility': {name: getattr(group, name) for name in ('hide_render', 'hide_viewport', 'hide_select')}} for group in bpy.data.collections},
    }
    return {'file': path.name, 'sha256': file_hash(path), 'counts': counts, 'objects': objects, 'materials': materials, 'worlds': worlds, 'node_groups': {group.name: node_tree(group) for group in bpy.data.node_groups}, 'locked_scene': locked_scene}


def compare(baseline, candidate, websites):
    original = baseline['snapshot']
    violations = []
    checks = {}

    def check(name, passed, detail=None):
        checks[name] = passed
        if not passed:
            violations.append({'check': name, 'detail': detail})

    check('v4_source_hash_unchanged', file_hash(SOURCE) == original['sha256'])
    check('project_web_and_built_site_unchanged', websites == baseline['websites'])
    check('complexity_counts_unchanged', original['counts'] == candidate['counts'], {'baseline': original['counts'], 'candidate': candidate['counts']})
    check('all_original_objects_preserved_no_additions', original['objects'].keys() == candidate['objects'].keys(), {'removed': sorted(original['objects'].keys() - candidate['objects'].keys()), 'added': sorted(candidate['objects'].keys() - original['objects'].keys())})
    for category in ('materials', 'worlds', 'node_groups', 'locked_scene'):
        check(category + '_unchanged', original[category] == candidate[category])
    changes = []
    derived_coordinate_changes = []
    for name in sorted(original['objects'].keys() & candidate['objects'].keys()):
        before = original['objects'][name]
        after = candidate['objects'][name]
        if before == after:
            continue
        if not before['allowed_building_deformation']:
            check('locked_object_unchanged:' + name, False, {'type': before['type'], 'changed_fields': [key for key in before if before[key] != after.get(key)]})
            continue
        allowed_fields = {'transform', 'data'}
        check('building_object_structure:' + name, all(before[key] == after.get(key) for key in before if key not in allowed_fields))
        before_data = {key: value for key, value in before['data'].items() if key != 'coordinate_sha256'}
        after_data = {key: value for key, value in after['data'].items() if key != 'coordinate_sha256'}
        if before['type'] == 'CURVE' and before['data']['coordinate_sha256'] != after['data']['coordinate_sha256'] and before_data['properties'].get('use_auto_texspace') is True and after_data['properties'].get('use_auto_texspace') is True:
            derived_fields = {'texspace_location', 'texspace_size'}
            changed_derived_fields = [key for key in sorted(derived_fields) if before_data['properties'].get(key) != after_data['properties'].get(key)]
            before_data['properties'] = {key: value for key, value in before_data['properties'].items() if key not in derived_fields}
            after_data['properties'] = {key: value for key, value in after_data['properties'].items() if key not in derived_fields}
            if changed_derived_fields:
                derived_coordinate_changes.append({'name': name, 'fields': changed_derived_fields, 'reason': 'Blender recomputes automatic texture-space bounds from changed curve coordinates; use_auto_texspace remains enabled.'})
        check('building_topology_attributes_modifiers:' + name, before_data == after_data, {'changed_fields': [key for key in before_data if before_data[key] != after_data.get(key)]})
        changes.append({'name': name, 'type': before['type'], 'transform_changed': before['transform'] != after['transform'], 'coordinates_changed': before['data']['coordinate_sha256'] != after['data']['coordinate_sha256']})
    return {'passed': not violations, 'checks': checks, 'violations': violations, 'allowed_building_changes': changes, 'allowed_derived_coordinate_changes': derived_coordinate_changes, 'baseline_counts': original['counts'], 'candidate_counts': candidate['counts']}


def run():
    parser = argparse.ArgumentParser(description='Read-only V5 geometric-deformation constraint audit; never renders or saves a blend.')
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--candidate', type=Path)
    parser.add_argument('--output', type=Path)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if options.baseline == bool(options.candidate):
        parser.error('Choose exactly one of --baseline or --candidate PATH.')
    started = time.perf_counter()
    if options.baseline:
        if BASELINE.exists():
            raise RuntimeError('Baseline already exists; refusing to replace this evidence.')
        report = {'schema_version': 1, 'created_utc': datetime.now(timezone.utc).isoformat(), 'scope': 'Read-only Blender datablock audit, not pixel equality; only building mesh/curve coordinates and building-object transforms may change.', 'allowed_collections': sorted(ALLOWED_COLLECTIONS), 'allowed_render_setting_changes': ['resolution_x', 'resolution_y', 'resolution_percentage', 'filepath', 'cycles.samples', 'cycles.adaptive_threshold'], 'snapshot': snapshot(SOURCE), 'websites': website_hashes()}
        output = BASELINE
    else:
        baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
        candidate = snapshot(options.candidate.resolve())
        websites = website_hashes()
        report = {'schema_version': 1, 'created_utc': datetime.now(timezone.utc).isoformat(), 'baseline': BASELINE.name, 'source_old_sha256': baseline['snapshot']['sha256'], 'source_current_sha256': file_hash(SOURCE), 'candidate_file': options.candidate.name, 'candidate_sha256': candidate['sha256'], **compare(baseline, candidate, websites)}
        output = options.output or PROJECT_DIR / 'assets' / (options.candidate.stem + '-constraint-audit.json')
    report['audit_seconds'] = round(time.perf_counter() - started, 3)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print('V5_AUDIT', json.dumps({'report': output.name, 'passed': report.get('passed', True), 'seconds': report['audit_seconds'], 'violations': report.get('violations', []), 'counts': report.get('baseline_counts', report.get('snapshot', {}).get('counts'))}), flush=True)
    if report.get('passed') is False:
        raise RuntimeError('V5 constraint audit failed; inspect JSON violations.')


if __name__ == '__main__':
    run()
