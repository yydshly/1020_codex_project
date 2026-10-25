import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import time

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from build_scene import configure_render
from refine_scene import complexity, validate_geometry

ANCHORS = (
    ('cafe_bookshop_base', (-4.0, 1.05, 0.85), (0.330, 0.681), 'shop'),
    ('bookshop_pottery_base', (2.0, 1.05, 0.85), (0.491, 0.638), 'shop'),
    ('pottery_right_base', (7.9, 1.05, 0.85), (0.601, 0.615), 'shop'),
    ('cafe_bookshop_eave', (-4.0, 0.77, 7.75), (0.331, 0.117), 'shop'),
    ('bookshop_pottery_eave', (2.0, 0.77, 7.75), (0.491, 0.201), 'shop'),
    ('pottery_right_eave', (8.13, 0.77, 7.75), (0.605, 0.272), 'shop'),
    ('cafe_left_base', (-9.9, 1.05, 0.85), (0.087, 0.755), 'shop'),
    ('canopy_front_right', (-4.0, -0.80, 3.71), (0.360, 0.414), 'shop'),
    ('bridge_shop_bank_end', (9.67, -3.0, 0.925), (0.619, 0.638), 'bridge'),
    ('bridge_deck_crown', (9.67, -7.0, 2.375), (0.777, 0.552), 'bridge'),
    ('bridge_far_bank_end', (9.67, -11.0, 0.925), (0.930, 0.643), 'bridge'),
    ('bridge_inner_crown', (9.74, -7.0, 1.62), (0.783, 0.594), 'bridge'),
)
LIMITS = np.array(((-29, -13), (-22, -8), (2.0, 5.0), (0.30, 0.90), (-0.12, 0.08), (23, 43), (-2, 5), (0.80, 1.28), (0, 2.4)), dtype=float)
TARGETS = np.array([anchor[2] for anchor in ANCHORS])
POINTS = np.array([anchor[1] for anchor in ANCHORS])
ASPECT = 1672 / 942
SHORELINE_TARGETS = (
    ('near_bank_top', -3.0, ((0.20, 0.86), (0.50, 0.70))),
    ('far_bank_inner_edge', -10.75, ((0.945, 0.68), (0.895, 0.96))),
)


def projected(parameters):
    camera_x, camera_y, camera_z, yaw, pitch, lens, bridge_offset, channel_scale, quay_shift = parameters
    points = POINTS.copy()
    points[8:, 0] += bridge_offset
    points[:, 1] = [transformed_y(value, channel_scale, quay_shift) for value in points[:, 1]]
    return project_points(parameters, points)


def project_points(parameters, points):
    camera_x, camera_y, camera_z, yaw, pitch, lens = parameters[:6]
    forward = np.array((math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), math.sin(pitch)))
    right = np.array((math.sin(yaw), -math.cos(yaw), 0))
    up = np.cross(right, forward)
    relative = points - np.array((camera_x, camera_y, camera_z))
    depth = relative @ forward
    coordinates = np.column_stack((0.5 + lens / 36 * (relative @ right) / depth, 0.5 - lens / 36 * ASPECT * (relative @ up) / depth))
    return coordinates


def transformed_y(coordinate_y, channel_scale, quay_shift):
    if coordinate_y >= 1.05:
        return coordinate_y
    if coordinate_y >= -3:
        return 1.05 + (coordinate_y - 1.05) * (4.05 - quay_shift) / 4.05
    return -3 + quay_shift + (coordinate_y + 3) * channel_scale


def score(parameters):
    residual = (projected(parameters) - TARGETS) * np.array((ASPECT, 1.0))
    return float(np.mean(np.sum(residual ** 2, axis=1))) + 0.70 * float(np.mean(shoreline_errors(parameters) ** 2))


def shoreline_errors(parameters):
    distances = []
    for name, original_y, targets in SHORELINE_TARGETS:
        bank_y = transformed_y(original_y, parameters[7], parameters[8])
        points = np.array(((-8, bank_y, 0.85), (80, bank_y, 0.85)))
        coordinates = project_points(parameters, points) * np.array((ASPECT, 1))
        direction = coordinates[1] - coordinates[0]
        length = np.linalg.norm(direction)
        for target in targets:
            relative = np.array(target) * np.array((ASPECT, 1)) - coordinates[0]
            distances.append((direction[0] * relative[1] - direction[1] * relative[0]) / length)
    return np.array(distances)


def simplex_search(initial, layout):
    active = 9 if layout else 6
    span = LIMITS[:, 1] - LIMITS[:, 0]
    normalized = (initial - LIMITS[:, 0]) / span

    def evaluate(candidate):
        expanded = normalized.copy()
        expanded[:active] = candidate
        distance = np.maximum(-expanded, 0) + np.maximum(expanded - 1, 0)
        parameters = LIMITS[:, 0] + np.clip(expanded, 0, 1) * span
        regularization = 0.00001 * (parameters[6] / 3) ** 2 + 0.00003 * ((parameters[7] - 1) / 0.2) ** 2
        return score(parameters) + float(np.sum(distance ** 2)) * 100 + regularization

    simplex = [normalized[:active].copy()]
    for index in range(active):
        candidate = normalized[:active].copy()
        candidate[index] += 0.045
        simplex.append(candidate)
    simplex = np.array(simplex)
    values = np.array([evaluate(candidate) for candidate in simplex])
    for iteration in range(1800):
        order = np.argsort(values)
        simplex, values = simplex[order], values[order]
        if np.std(values) < 1e-12 and np.max(np.abs(simplex[1:] - simplex[0])) < 1e-5:
            break
        centroid = np.mean(simplex[:-1], axis=0)
        reflection = centroid + (centroid - simplex[-1])
        reflected_value = evaluate(reflection)
        if values[0] <= reflected_value < values[-2]:
            simplex[-1], values[-1] = reflection, reflected_value
        elif reflected_value < values[0]:
            expansion = centroid + 2 * (reflection - centroid)
            expanded_value = evaluate(expansion)
            simplex[-1], values[-1] = (expansion, expanded_value) if expanded_value < reflected_value else (reflection, reflected_value)
        else:
            contraction = centroid + 0.5 * (simplex[-1] - centroid)
            contracted_value = evaluate(contraction)
            if contracted_value < values[-1]:
                simplex[-1], values[-1] = contraction, contracted_value
            else:
                simplex[1:] = simplex[0] + 0.5 * (simplex[1:] - simplex[0])
                values[1:] = [evaluate(candidate) for candidate in simplex[1:]]
    expanded = normalized.copy()
    expanded[:active] = simplex[np.argmin(values)]
    return LIMITS[:, 0] + np.clip(expanded, 0, 1) * span


def solve(layout):
    starts = (
        (-20, -14, 3.5, 0.58, -0.03, 32, 0, 1, 0),
        (-23, -16, 3.5, 0.58, -0.03, 36, 0, 1, 0),
        (-17, -12, 3.2, 0.61, -0.03, 29, 0, 1, 0),
    )
    solutions = [simplex_search(np.array(start, dtype=float), layout) for start in starts]
    return min(solutions, key=score)


def camera_parameters(camera):
    forward = camera.rotation_euler.to_quaternion() @ Vector((0, 0, -1))
    return np.array((*camera.location, math.atan2(forward.y, forward.x), math.asin(forward.z), camera.data.lens, 0, 1, 0))


def apply_camera(parameters):
    camera = bpy.data.objects['Hero canal perspective']
    camera.location = parameters[:3]
    yaw, pitch = parameters[3:5]
    forward = Vector((math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), math.sin(pitch)))
    camera.rotation_euler = forward.to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = float(parameters[5])
    camera.data.sensor_fit = 'HORIZONTAL'
    camera.data.shift_x = 0
    camera.data.shift_y = 0
    camera.data.dof.use_dof = False
    bpy.context.scene.camera = camera
    bpy.context.view_layer.update()


def transform_layout(parameters):
    offset, channel_scale, quay_shift = parameters[6:9]
    maximum_z_drift = 0.0
    bridge_objects = set(bpy.data.collections['Bridge'].objects) | set(bpy.data.collections['Bridge railings'].objects)
    for obj in bridge_objects:
        obj.location.x += offset
    bpy.context.view_layer.update()
    if abs(channel_scale - 1) < 0.00001 and abs(quay_shift) < 0.00001:
        return {'max_world_vertex_z_drift': 0.0}
    for obj in bpy.context.scene.objects:
        if obj.type == 'CAMERA':
            continue
        if obj.type == 'MESH':
            inverse = obj.matrix_world.inverted()
            for vertex in obj.data.vertices:
                position = obj.matrix_world @ vertex.co
                if position.y < 1.05:
                    original_z = position.z
                    position.y = transformed_y(position.y, channel_scale, quay_shift)
                    vertex.co = inverse @ position
                    maximum_z_drift = max(maximum_z_drift, abs((obj.matrix_world @ vertex.co).z - original_z))
            obj.data.update()
        elif obj.type == 'CURVE':
            inverse = obj.matrix_world.inverted()
            for spline in obj.data.splines:
                for point in spline.points:
                    position = obj.matrix_world @ Vector(point.co[:3])
                    if position.y < 1.05:
                        position.y = transformed_y(position.y, channel_scale, quay_shift)
                        point.co = (*(inverse @ position), 1)
        elif obj.type == 'LIGHT' and obj.location.y < 1.05:
            obj.location.y = transformed_y(obj.location.y, channel_scale, quay_shift)
    bpy.context.view_layer.update()
    return {
        'max_world_vertex_z_drift': maximum_z_drift,
        'near_quay_width_before': 4.05,
        'near_quay_width_after': float(4.05 - quay_shift),
        'channel_width_before': 8.0,
        'channel_width_after': float(8.0 * channel_scale),
        'contact_scope': 'Shared continuous horizontal mapping keeps bridge-bank boundaries and existing vertical contact coordinates; this is not a complete collision certification.',
    }


def measurement(parameters):
    coordinates = projected(parameters)
    pixel_errors = np.linalg.norm((coordinates - TARGETS) * np.array((1672, 942)), axis=1)
    return {
        'mean_anchor_error_pixels_at_1672x942': float(np.mean(pixel_errors)),
        'rms_anchor_error_pixels_at_1672x942': float(np.sqrt(np.mean(pixel_errors ** 2))),
        'mean_anchor_error_normalized_diagonal': float(np.mean(pixel_errors) / math.hypot(1672, 942)),
        'shoreline_point_to_projected_line_rms_pixels': float(np.sqrt(np.mean(shoreline_errors(parameters) ** 2)) * 942),
        'parameters': dict(zip(('camera_x', 'camera_y', 'camera_z', 'yaw_radians', 'pitch_radians', 'lens_mm', 'bridge_offset_x', 'channel_width_scale', 'near_quay_shift_y'), [float(value) for value in parameters])),
        'anchors': [{'name': anchor[0], 'world_before': list(anchor[1]), 'target_normalized_top_left': list(anchor[2]), 'projected_normalized_top_left': coordinates[index].tolist(), 'error_pixels': float(pixel_errors[index])} for index, anchor in enumerate(ANCHORS)],
    }


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--quality', choices=('solve', 'preview', 'final'), default='solve')
    parser.add_argument('--layout', action='store_true')
    parser.add_argument('--label', default='01')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    started = time.perf_counter()
    source = PROJECT_DIR / 'artifacts' / 'rainy-canal-v3.blend'
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    before = complexity()
    baseline_parameters = camera_parameters(bpy.context.scene.camera)
    fitted = solve(options.layout)
    alignment = {
        'method': 'Manually selected approximate image anchors and constrained camera/layout least-squares fit.',
        'scope': 'Composition indicator only for these selected anchors; not whole-image similarity, geometric ground truth or a model capability benchmark.',
        'reference_coordinate_system': 'Normalized top-left origin; reference image 1672x941, evaluation resolution 1672x942.',
        'baseline_v3': measurement(baseline_parameters),
        'aligned_v4': measurement(fitted),
        'layout_enabled': options.layout,
        'shoreline_constraints': [{'name': name, 'world_y_before': coordinate_y, 'world_z': 0.85, 'target_points_normalized_top_left': targets} for name, coordinate_y, targets in SHORELINE_TARGETS],
        'materials_modified': False,
    }
    name = 'alignment-v4' if options.quality == 'final' else f'alignment-v4-{options.quality}-{options.label}'
    if options.quality == 'solve':
        (PROJECT_DIR / 'assets' / f'{name}.json').write_text(json.dumps(alignment, indent=2), encoding='utf-8')
        print('ALIGNMENT', json.dumps({'baseline': alignment['baseline_v3'], 'aligned': alignment['aligned_v4']}))
        return
    layout_checks = transform_layout(fitted)
    apply_camera(fitted)
    devices = configure_render(options.quality)
    scene = bpy.context.scene
    scene.cycles.samples = 32 if options.quality == 'preview' else 112
    projected_points = projected(fitted)
    projection_errors = []
    for index, anchor in enumerate(ANCHORS):
        position = Vector(anchor[1])
        if anchor[3] == 'bridge':
            position.x += fitted[6]
        position.y = transformed_y(position.y, fitted[7], fitted[8])
        evaluated = world_to_camera_view(scene, scene.camera, position)
        projection_errors.append(math.hypot((evaluated.x - projected_points[index, 0]) * 1672, (1 - evaluated.y - projected_points[index, 1]) * 942))
    alignment['projection_formula_max_difference_from_blender_pixels'] = max(projection_errors)
    if max(projection_errors) > 0.20:
        raise RuntimeError('Analytic anchor projection does not match the Blender camera')
    alignment['layout_checks'] = layout_checks
    after = complexity()
    if after != before:
        raise RuntimeError('Alignment changed scene topology counts')
    validate_geometry()
    render_name = f'align-preview-v4-{options.label}' if options.quality == 'preview' else 'render-v4'
    scene.render.filepath = str(PROJECT_DIR / 'assets' / f'{render_name}.png')
    scene['alignment_scope'] = alignment['scope']
    scene['v3_source_sha256'] = source_hash
    scene['alignment_parameters'] = json.dumps(alignment['aligned_v4']['parameters'])
    if options.quality == 'final':
        destination = PROJECT_DIR / 'artifacts' / 'rainy-canal-v4.blend'
        if destination.exists():
            raise FileExistsError('V4 artifact exists; do not overwrite a previous result.')
        bpy.ops.wm.save_as_mainfile(filepath=str(destination))
        bpy.ops.wm.open_mainfile(filepath=str(destination))
        scene = bpy.context.scene
        validate_geometry()
        if complexity() != before:
            raise RuntimeError('Reopened V4 complexity mismatch')
    setup_seconds = time.perf_counter() - started
    render_started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    render_seconds = time.perf_counter() - render_started
    stats = {
        'quality': options.quality,
        'blender': bpy.app.version_string,
        'devices': devices,
        'resolution': [scene.render.resolution_x, scene.render.resolution_y],
        'samples_max': scene.cycles.samples,
        'complexity_before': before,
        'complexity_after': after,
        'complexity_unchanged': before == after,
        'v3_source_sha256': source_hash,
        'v3_unchanged': source_hash == hashlib.sha256(source.read_bytes()).hexdigest(),
        'final_artifact_reopened': options.quality == 'final',
        'finite_geometry': True,
        'material_changes': False,
        'layout_checks': layout_checks,
        'setup_seconds': round(setup_seconds, 2),
        'render_seconds': round(render_seconds, 2),
        'total_seconds': round(time.perf_counter() - started, 2),
    }
    if options.quality == 'final':
        independent_started = time.perf_counter()
        scene.camera = bpy.data.objects['Independent side overview']
        scene.camera.data.lens = 32
        scene.cycles.samples = 32
        scene.render.resolution_x = 1104
        scene.render.resolution_y = 622
        scene.render.filepath = str(PROJECT_DIR / 'assets' / 'overview-v4.png')
        bpy.ops.render.render(write_still=True)
        stats['independent_view_render_seconds'] = round(time.perf_counter() - independent_started, 2)
        stats['independent_view_saved_into_blend'] = False
    (PROJECT_DIR / 'assets' / f'{render_name}-stats.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')
    (PROJECT_DIR / 'assets' / f'{name}.json').write_text(json.dumps(alignment, indent=2), encoding='utf-8')
    print('ALIGNED_RENDER', json.dumps(stats))
    print('FITTED_PARAMETERS', json.dumps(alignment['aligned_v4']['parameters']))


if __name__ == '__main__':
    run()
