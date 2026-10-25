import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


PROJECT_DIR = Path(__file__).resolve().parents[1]
SOURCE = PROJECT_DIR / 'artifacts' / 'rainy-canal-v4.blend'
LEDGER = PROJECT_DIR / 'assets' / 'v5-render-ledger.json'
BUILDINGS = ('01 Cafe', '02 Bookshop', '03 Pottery shop')
CHANGED = set()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def base_name(obj):
    return obj.name.rsplit('.', 1)[0] if obj.name.rsplit('.', 1)[-1].isdigit() else obj.name


def selected(group, name):
    return [obj for obj in bpy.data.collections[group].objects if base_name(obj) == name]


def bounds(obj):
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return [min(point[axis] for point in points) for axis in range(3)], [max(point[axis] for point in points) for axis in range(3)]


def center_x(obj):
    minimum, maximum = bounds(obj)
    return (minimum[0] + maximum[0]) / 2


def deform(obj, transform):
    if obj.data.users != 1:
        raise RuntimeError('Shared geometry requires explicit handling: ' + obj.name)
    inverse = obj.matrix_world.inverted()
    if obj.type == 'MESH':
        for vertex in obj.data.vertices:
            vertex.co = inverse @ Vector(transform(obj.matrix_world @ vertex.co))
        obj.data.update()
    elif obj.type == 'CURVE':
        for spline in obj.data.splines:
            for point in spline.points:
                transformed = inverse @ Vector(transform(obj.matrix_world @ Vector(point.co[:3])))
                point.co = (*transformed, point.co[3])
            for point in spline.bezier_points:
                for attribute in ('co', 'handle_left', 'handle_right'):
                    setattr(point, attribute, inverse @ Vector(transform(obj.matrix_world @ getattr(point, attribute))))
    else:
        raise RuntimeError('Only existing building meshes and curves may deform.')
    CHANGED.add(obj.name)


def axis_range(obj, axis, lower, upper):
    minimum, maximum = bounds(obj)
    original_lower, original_upper = minimum[axis], maximum[axis]
    if upper <= lower or original_upper <= original_lower:
        raise RuntimeError('Degenerate axis mapping: ' + obj.name)

    def transform(point):
        result = list(point)
        result[axis] = lower + (point[axis] - original_lower) * (upper - lower) / (original_upper - original_lower)
        return result

    deform(obj, transform)


def window_z(value, lift, height_scale):
    return 6.14 + (value - 6.14) * height_scale + lift


def merge_cafe_windows(lift, height_scale, roof_rise):
    group = '01 Cafe'
    middle = -7.32
    original_centers = (-8.28, -5.72)
    old_shutter_centers = (-9.22, -7.34, -6.66, -4.78)
    new_shutter_centers = (middle - 1.0325, middle - 0.7275, middle + 0.7275, middle + 1.0325)
    affected = set()

    def map_parts(name, intervals):
        objects = sorted(selected(group, name), key=lambda obj: (center_x(obj), bounds(obj)[0][2]))
        if len(objects) != len(intervals):
            raise RuntimeError('Unexpected component count: ' + name)
        for obj, interval in zip(objects, intervals):
            axis_range(obj, 0, middle + interval[0], middle + interval[1])
            affected.add(obj)

    map_parts('Upper inset glass', ((-.52, -.03), (.03, .52)))
    map_parts('Upper wooden window stile', ((-.585, -.515), (-.05, 0), (0, .05), (.515, .585)))
    map_parts('Upper wooden window rail', ((-.55, 0), (-.55, 0), (0, .55), (0, .55)))
    map_parts('Window center mullion', ((-.2875, -.2625), (.2625, .2875)))
    map_parts('Window crossbar', ((-.52, -.03), (.03, .52)))
    map_parts('Carved stone window sill', ((-.71, 0), (0, .71)))
    map_parts('Stone window lintel', ((-.69, 0), (0, .69)))
    map_parts('Window safety rail', ((-.71, 0), (-.71, 0), (0, .71), (0, .71)))
    map_parts('Folded linen curtain', ((-.535, -.49), (-.475, -.43), (.43, .475), (.49, .535)))
    balusters = sorted(selected(group, 'Window iron baluster'), key=center_x)
    for index, obj in enumerate(balusters):
        target = middle - .66 + 1.32 * index / (len(balusters) - 1)
        minimum, maximum = bounds(obj)
        half_width = (maximum[0] - minimum[0]) / 2
        axis_range(obj, 0, target - half_width, target + half_width)
        affected.add(obj)
    for name in ('Wooden shutter', 'Shutter plank seam', 'Shutter horizontal batten', 'Shutter hinge stud'):
        for obj in selected(group, name):
            old_center = min(old_shutter_centers, key=lambda value: abs(center_x(obj) - value))
            new_center = new_shutter_centers[old_shutter_centers.index(old_center)]
            deform(obj, lambda point, old=old_center, new=new_center: (new + (point.x - old) * (.285 / .59), point.y, point.z))
            affected.add(obj)
    for obj in affected:
        deform(obj, lambda point: (point.x, point.y, window_z(point.z, lift, height_scale)))
    piers = sorted(selected(group, 'Upper wall between real window openings'), key=center_x)
    wall_intervals = ((-9.9, middle - .55), (middle + .55, -5.435), (-5.435, -4.1))
    for obj, interval in zip(piers, wall_intervals):
        axis_range(obj, 0, *interval)
        deform(obj, lambda point: (point.x, point.y, window_z(point.z, lift, height_scale)))
    lower_wall = selected(group, 'Upper facade lower wall')[0]
    axis_range(lower_wall, 2, 4.525, window_z(5.135, lift, height_scale))
    upper_wall = selected(group, 'Upper facade top wall')[0]
    axis_range(upper_wall, 2, window_z(7.155, lift, height_scale), 7.805 + roof_rise)
    return {'opening_center_x': middle, 'opening_width': 1.10, 'group_width_approx': 2.35, 'window_z_scale': height_scale, 'window_lift': lift, 'original_window_centers': original_centers, 'new_wall_x_intervals': wall_intervals, 'reused_window_parts': len(affected), 'window_objects': sorted(obj.name for obj in affected)}


def roof_variation(lift, pottery_ridge_drop):
    roof_names = {'Solid pitched roof underlay', 'Individual overlapping curved roof tiles', 'Ridge cap tile', 'Plastered end gable', 'Gable edge flashing'}
    cafe_names = roof_names | {'Layered eaves cornice', 'Eaves supporting beam', 'Rain gutter'}
    for obj in bpy.data.collections['01 Cafe'].objects:
        if base_name(obj) in cafe_names:
            deform(obj, lambda point: (point.x, point.y, point.z + lift))
        elif base_name(obj) in {'Rear masonry wall', 'Solid party wall'}:
            minimum, maximum = bounds(obj)
            axis_range(obj, 2, minimum[2], maximum[2] + lift)
        elif base_name(obj) == 'Bent rain downpipe':
            deform(obj, lambda point: (point.x, point.y, point.z + lift * max(0, min(1, (point.z - 7.10) / .65))))
    for obj in bpy.data.collections['03 Pottery shop'].objects:
        if base_name(obj) in roof_names:
            deform(obj, lambda point: (point.x, point.y, point.z - pottery_ridge_drop * max(0, min(1, (point.z - 7.86) / 1.56))))
    return {'cafe_eave_rise': lift, 'bookshop_roof_unchanged': True, 'pottery_ridge_drop': pottery_ridge_drop, 'pottery_eave_unchanged': True, 'roof_x_boundaries_unchanged': True, 'new_dormer_created': False, 'chimneys_unchanged': True}


def thin_trims():
    factors = {'Carved stone window sill': (.72, .68), 'Stone window lintel': (.68, .72), 'Layered eaves cornice': (.60, .68), 'Eaves supporting beam': (.72, .75), 'Shop top cornice': (.65, .68), 'Shop cornice molding': (.65, .72)}
    for group in BUILDINGS:
        for obj in bpy.data.collections[group].objects:
            name = base_name(obj)
            if name in factors:
                height_factor, depth_factor = factors[name]
                minimum, maximum = bounds(obj)
                middle_z = (minimum[2] + maximum[2]) / 2
                deform(obj, lambda point, back=maximum[1], middle=middle_z, height=height_factor, depth=depth_factor: (point.x, back + (point.y - back) * depth, middle + (point.z - middle) * height))
            elif name == 'Shop entablature':
                minimum, maximum = bounds(obj)
                deform(obj, lambda point, back=maximum[1]: (point.x, back + (point.y - back) * .72, point.z))
    return {'scope': 'Existing exterior sill/lintel/eave/shop cornice cross-sections only; ground-floor openings and interiors remain unchanged.', 'section_factors_height_depth': factors, 'entablature_depth_factor': .72}


def geometry_state():
    result = {}
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            topology = (len(obj.data.vertices), len(obj.data.edges), len(obj.data.polygons), tuple(tuple(face.vertices) for face in obj.data.polygons))
            coordinates = tuple(tuple(vertex.co) for vertex in obj.data.vertices)
        elif obj.type == 'CURVE':
            topology = tuple((spline.type, len(spline.points), len(spline.bezier_points)) for spline in obj.data.splines)
            coordinates = tuple(tuple(point.co) for spline in obj.data.splines for point in list(spline.points) + list(spline.bezier_points))
        else:
            topology, coordinates = None, None
        result[obj.name] = {'type': obj.type, 'transform': tuple(tuple(row) for row in obj.matrix_world), 'topology': topology, 'coordinates': coordinates, 'modifiers': tuple((modifier.name, modifier.type) for modifier in obj.modifiers), 'visible': (obj.hide_render, obj.hide_viewport, obj.hide_get())}
    return result


def check_geometry(before):
    after = geometry_state()
    if before.keys() != after.keys():
        raise RuntimeError('Object set changed.')
    allowed = {obj.name for group in BUILDINGS for obj in bpy.data.collections[group].objects if obj.type in {'MESH', 'CURVE'}}
    for name, previous in before.items():
        current = after[name]
        if name not in CHANGED:
            if current != previous:
                raise RuntimeError('Unapproved object changed: ' + name)
        else:
            if name not in allowed or any(current[field] != previous[field] for field in previous if field != 'coordinates'):
                raise RuntimeError('Unexpected topology, transform or visibility change: ' + name)
            if any(not math.isfinite(value) for coordinate in current['coordinates'] for value in coordinate):
                raise RuntimeError('Non-finite vertex coordinate: ' + name)
    return {'passed': True, 'changed_building_objects': len(CHANGED), 'objects': len(after), 'vertices': sum(len(obj.data.vertices) for obj in bpy.data.objects if obj.type == 'MESH'), 'faces': sum(len(obj.data.polygons) for obj in bpy.data.objects if obj.type == 'MESH'), 'modifiers': sum(len(obj.modifiers) for obj in bpy.data.objects), 'lights': sum(obj.type == 'LIGHT' for obj in bpy.data.objects), 'new_objects': 0, 'hidden_objects_added': 0}


def projected_window_box(names):
    scene = bpy.context.scene
    points = [world_to_camera_view(scene, scene.camera, bpy.data.objects[name].matrix_world @ vertex.co) for name in names for vertex in bpy.data.objects[name].data.vertices]
    return {'coordinate_system': 'Normalized image coordinates, origin top-left; only component bounding box, not image similarity.', 'min': [min(point.x for point in points), 1 - max(point.y for point in points)], 'max': [max(point.x for point in points), 1 - min(point.y for point in points)]}


def ledger_update(attempt=None, result=None):
    lock_path = LEDGER.with_suffix('.lock')
    with lock_path.open('x', encoding='utf-8') as lock:
        lock.write(str(os.getpid()))
    try:
        ledger = json.loads(LEDGER.read_text(encoding='utf-8')) if LEDGER.exists() else {'maximum_attempts': 2, 'attempts': []}
        if attempt is not None:
            if len(ledger['attempts']) >= 2:
                raise RuntimeError('V5 has already used its two allowed render attempts, including failed attempts.')
            ledger['attempts'].append(attempt)
        else:
            ledger['attempts'][-1].update(result)
        temporary = LEDGER.with_suffix('.pending.json')
        temporary.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(LEDGER)
    finally:
        lock_path.unlink()


def run():
    parser = argparse.ArgumentParser(description='Bounded V5 exterior geometry experiment; preserves V4 and permits at most two persisted render attempts.')
    parser.add_argument('--preview', type=int, choices=(1, 2), default=1)
    parser.add_argument('--check-only', action='store_true')
    parser.add_argument('--window-lift', type=float, default=.45)
    parser.add_argument('--window-height-scale', type=float, default=1.04)
    parser.add_argument('--cafe-roof-rise', type=float, default=.45)
    parser.add_argument('--pottery-ridge-drop', type=float, default=.18)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if not .20 <= options.window_lift <= 1.0 or not .85 <= options.window_height_scale <= 1.10 or not .20 <= options.cafe_roof_rise <= .70 or not 0 <= options.pottery_ridge_drop <= .30:
        parser.error('Bounded exterior changes require window lift 0.20..1.0, height scale 0.85..1.10, roof rise 0.20..0.70 and ridge drop 0..0.30.')
    started = time.perf_counter()
    label = f'{options.preview:02d}'
    candidate = PROJECT_DIR / 'artifacts' / f'rainy-canal-v5-preview-{label}.blend'
    image_path = PROJECT_DIR / 'assets' / f'v5-preview-{label}.png'
    stats_path = PROJECT_DIR / 'assets' / f'v5-preview-{label}-stats.json'
    if not options.check_only and any(path.exists() for path in (candidate, image_path, stats_path)):
        raise RuntimeError('Refusing to overwrite an existing V5 candidate, preview or statistics.')
    source_hash = digest(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    before = geometry_state()
    changes = {'windows': merge_cafe_windows(options.window_lift, options.window_height_scale, options.cafe_roof_rise), 'roofs': roof_variation(options.cafe_roof_rise, options.pottery_ridge_drop), 'trims': thin_trims()}
    bpy.context.view_layer.update()
    checks = check_geometry(before)
    changes['windows']['projected_group_box'] = projected_window_box(changes['windows']['window_objects'])
    if digest(SOURCE) != source_hash:
        raise RuntimeError('Source V4 changed.')
    report = {'source': SOURCE.name, 'source_sha256': source_hash, 'source_unchanged': True, 'changes': changes, 'checks': checks, 'complexity_after': checks, 'resolution': [1104, 622], 'samples_max': 40, 'blender': bpy.app.version_string, 'limitations': ['Only exterior building geometry is changed; the reference dormer is not recreated.', 'No material, light, camera, bridge, bank, street prop or interior edit.', 'Projected window box is a hand-selected composition check, not overall similarity.']}
    if options.check_only:
        report['check_only'] = True
        print('V5_CHECK', json.dumps(report, ensure_ascii=False), flush=True)
        return
    scene = bpy.context.scene
    scene.render.resolution_x = 1104
    scene.render.resolution_y = 622
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(image_path)
    scene.cycles.samples = 40
    scene.cycles.adaptive_threshold = .025
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate), check_existing=True)
    bpy.ops.wm.open_mainfile(filepath=str(candidate))
    report['reopened_before_render'] = True
    report['reopened_checks'] = check_geometry(before)
    preferences = bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type = 'OPTIX'
    preferences.get_devices()
    for device in preferences.devices:
        device.use = device.type == 'OPTIX'
    report['devices'] = [device.name for device in preferences.devices if device.use]
    report['setup_seconds'] = round(time.perf_counter() - started, 3)
    ledger_update(attempt={'preview': options.preview, 'candidate': candidate.name, 'image': image_path.name, 'started_utc': datetime.now(timezone.utc).isoformat(), 'status': 'started'})
    render_started = time.perf_counter()
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as error:
        ledger_update(result={'status': 'failed', 'error': str(error), 'finished_utc': datetime.now(timezone.utc).isoformat()})
        raise
    report['render_seconds'] = round(time.perf_counter() - render_started, 3)
    report['total_seconds'] = round(time.perf_counter() - started, 3)
    report['candidate'] = candidate.name
    report['candidate_sha256'] = digest(candidate)
    report['image'] = image_path.name
    report['source_unchanged'] = digest(SOURCE) == source_hash
    stats_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    ledger_update(result={'status': 'complete', 'finished_utc': datetime.now(timezone.utc).isoformat(), 'render_seconds': report['render_seconds']})
    print('V5_PREVIEW', json.dumps({'image': image_path.name, 'candidate': candidate.name, 'render_seconds': report['render_seconds'], 'checks': checks}), flush=True)


if __name__ == '__main__':
    run()
