import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import time
from xml.sax.saxutils import escape

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from audit_scene_extension import BASELINE, SOURCE, compare, preserved_file_changes
from audit_v5 import file_hash, snapshot, website_hashes
from extend_buildings import build as build_buildings
from scene_utils import box, collection, curve, cylinder, mesh


PROJECT_DIR = SCRIPT_DIR.parent
CANDIDATE = PROJECT_DIR / 'artifacts' / 'rainy-canal-extension-01.blend'
LEDGER = PROJECT_DIR / 'assets' / 'extension-render-ledger.json'
PLAN = {
    'scope': 'First additive exterior blockout, not a finished city or playable navigation system.',
    'source': SOURCE.name,
    'active_area_xy': [-21, -22.5, 13, 10.5],
    'existing_shops': [[-9.9, 1.11, -4.1, 6.60], [-3.9, 1.11, 1.9, 6.60], [2.1, 1.11, 7.9, 6.60]],
    'canal_y': [-10.55, -1.755],
    'existing_bridge_x': [7.759, 10.241],
    'rear_path_rectangles': [[-13.7, 1.19, -11.9, 8.9], [10.6, 1.19, 12.4, 8.9], [-11.9, 7.1, 10.6, 8.9]],
    'return_bridge': {'center_x': -18.0, 'width': 1.8, 'far_y': -10.55, 'near_y': -1.755, 'rise': .55},
    'opposite_house_front_y': -16.35,
    'opposite_house_back_y': -21.35,
    'routes': {
        'both_banks_loop': [[-18, -.55], [9.4, -.55], [9.4, -12.65], [-18, -12.65], [-18, -.55]],
        'rear_lane_loop': [[-12.8, -.55], [-12.8, 8.0], [11.5, 8.0], [11.5, -.55], [-12.8, -.55]],
    },
    'access_policy': {'shop_interiors': 'Closed: existing glass and doors are preserved; no entry or stair access added.', 'new_houses': 'Closed exterior shells with opaque window/door panels; no claimed interiors.', 'outside_active_area': 'Visual background only; original stretched terrain is retained but not declared explored or complete.'},
    'inference': 'All new off-camera architecture and routes are designed extensions, not recovered facts from the single reference image.',
}


def add_box(name, center, dimensions, material, group, edge=.015):
    return box('EXT_' + name, center, dimensions, bpy.data.materials[material], group, edge)


def bridge_height(coordinate_y, rise=.55):
    progress = max(0.0, min(1.0, (coordinate_y + 10.55) / 8.795))
    return .85 + rise * math.sin(math.pi * progress)


def build_paths():
    group = 'EXT_PathsAndEdges'
    for index, (left, bottom, right, top) in enumerate(PLAN['rear_path_rectangles']):
        add_box(f'Rear lane slab {index + 1}', ((left + right) / 2, (bottom + top) / 2, .76), (right - left, top - bottom, .18), 'paving', group, 0)
    for coordinate_x in (-13.76, 12.46):
        add_box('Outer alley curb', (coordinate_x, 5.05, .865), (.12, 7.7, .15), 'stone_light', group)
    add_box('Rear lane outer curb', (-.65, 8.96, .865), (27.02, .12, .15), 'stone_light', group)
    add_box('Rear garden boundary', (-.65, 10.35, 1.31), (29.6, .24, .94), 'stone', group)
    add_box('Opposite rear boundary', (-4, -22.35, 1.45), (34, .24, 1.2), 'stone', group)
    for boundary_x in (-21.0, 13.0):
        for center_y, gate_width in ((-.50, 1.90), (-12.65, 3.8)):
            for side in (-1, 1):
                add_box('Access boundary gate post', (boundary_x, center_y + side * gate_width / 2, 1.5), (.16, .16, 1.3), 'stone_light', group)
            for height in (1.25, 1.85):
                add_box('Access boundary gate rail', (boundary_x, center_y, height), (.06, gate_width, .06), 'iron', group, .006)
            for bar_index in range(1, 8):
                add_box('Access boundary gate bar', (boundary_x, center_y - gate_width / 2 + gate_width * bar_index / 8, 1.52), (.04, .04, .62), 'iron', group, .004)


def build_return_bridge():
    group = 'EXT_ReturnFootbridge'
    vertices, faces = [], []
    sections = 32
    for section in range(sections + 1):
        coordinate_y = -10.55 + 8.795 * section / sections
        top = bridge_height(coordinate_y)
        vertices.extend([(-18.9, coordinate_y, top - .14), (-17.1, coordinate_y, top - .14), (-18.9, coordinate_y, top), (-17.1, coordinate_y, top)])
    for section in range(sections):
        first = section * 4
        following = first + 4
        faces.extend([(first, following, following + 1, first + 1), (first + 2, first + 3, following + 3, following + 2), (first, first + 2, following + 2, following), (first + 1, following + 1, following + 3, first + 3)])
    faces.extend([(0, 1, 3, 2), (sections * 4, sections * 4 + 2, sections * 4 + 3, sections * 4 + 1)])
    mesh('EXT_Return bridge continuous timber deck', vertices, faces, bpy.data.materials['wood'], group)
    for coordinate_y in (-10.70, -1.63):
        add_box('Return bridge landing', (-18, coordinate_y, .79), (1.95, .48, .12), 'stone_light', group)
    for section in range(1, sections):
        coordinate_y = -10.55 + 8.795 * section / sections
        add_box('Deck board joint', (-18, coordinate_y, bridge_height(coordinate_y) + .002), (1.76, .012, .008), 'wood_light', group, 0)
    for side in (-1, 1):
        coordinate_x = -18 + side * .85
        for post_index in range(12):
            coordinate_y = -10.55 + 8.795 * post_index / 11
            height = bridge_height(coordinate_y)
            post = cylinder('EXT_Return bridge railing post', (coordinate_x, coordinate_y, height), (coordinate_x, coordinate_y, height + 1.05), .035, bpy.data.materials['iron'], group, vertices=8)
            post.data.name = post.name + ' mesh'
        for relative_height in (.45, 1.02):
            points = [(coordinate_x, -10.55 + 8.795 * section / sections, bridge_height(-10.55 + 8.795 * section / sections) + relative_height) for section in range(sections + 1)]
            curve('EXT_Return bridge continuous handrail', points, .032, bpy.data.materials['iron'], group)


def create_review_camera(name, position, target, lens):
    data = bpy.data.cameras.new('EXT_' + name)
    data.lens = lens
    data.clip_end = 1200
    obj = bpy.data.objects.new('EXT_' + name, data)
    collection('EXT_ReviewCameras').objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj


def build_cameras():
    definitions = [
        ('Overview', (-34, -39, 34), (-4, -5, 1.6), 36),
        ('ReverseRear', (16, 14, 11), (-5, 3, 2.8), 28),
        ('FarBank', (-15.2, -13.0, 2.55), (-2, 3, 3.0), 28),
        ('Bridge', (9.4, -6.1, 3.9), (-7, 1, 3), 26),
        ('RearLane', (10.9, 8, 2.5), (-10, 7.4, 2.5), 28),
    ]
    return [create_review_camera('Review_' + name, position, target, lens) for name, position, target, lens in definitions]


def route_height(route_name, point):
    if route_name == 'both_banks_loop' and -10.55 <= point[1] <= -1.755:
        if abs(point[0] - 9.4) < .1:
            return bridge_height(point[1], 1.45)
        if abs(point[0] + 18) < .1:
            return bridge_height(point[1])
    return .85


def check_routes():
    scene = bpy.context.scene
    dependency_graph = bpy.context.evaluated_depsgraph_get()
    results = {}
    for route_name, waypoints in PLAN['routes'].items():
        samples = []
        for start, end in zip(waypoints[:-1], waypoints[1:]):
            distance = math.dist(start, end)
            count = math.ceil(distance / .28)
            for index in range(count):
                fraction = index / count
                samples.append([start[axis] + (end[axis] - start[axis]) * fraction for axis in range(2)])
        samples.append(waypoints[-1])
        unsupported = []
        obstructions = []
        max_floor_deviation = 0.0
        for index, point in enumerate(samples):
            expected = route_height(route_name, point)
            hit, position, normal, face_index, obj, matrix = scene.ray_cast(dependency_graph, Vector((*point, expected + .25)), Vector((0, 0, -1)), distance=.6)
            deviation = abs(position.z - expected) if hit else 1.0
            max_floor_deviation = max(max_floor_deviation, deviation)
            if not hit or deviation > .17:
                unsupported.append({'point': point, 'expected_z': expected, 'object': obj.name if obj else None, 'actual_z': position.z if hit else None})
            if index == len(samples) - 1:
                continue
            next_point = samples[index + 1]
            next_height = route_height(route_name, next_point)
            direction = Vector((next_point[0] - point[0], next_point[1] - point[1], next_height - expected))
            distance = direction.length
            if distance == 0:
                continue
            lateral = Vector((-direction.y, direction.x, 0)).normalized()
            for side in (-.24, 0, .24):
                for height in (.40, 1.0, 1.65):
                    origin = Vector((*point, expected + height)) + lateral * side
                    body_hit, body_position, body_normal, body_face, body_obj, body_matrix = scene.ray_cast(dependency_graph, origin, direction.normalized(), distance=distance)
                    if body_hit:
                        obstructions.append({'point': point, 'height_above_route': height, 'side_offset': side, 'object': body_obj.name})
        results[route_name] = {'sample_count': len(samples), 'maximum_floor_deviation': round(max_floor_deviation, 4), 'unsupported_samples': unsupported, 'body_ray_obstructions': obstructions, 'sampled_checks_passed': not unsupported and not obstructions}
    return {'scope': 'Sampled centerline floor support and 0.48m-wide body-ray checks only, not a navmesh, full-area collision certification or a playable controller.', 'floor_tolerance': .17, 'known_existing_paving_gaps': 'Original stone joints can be about 0.12m lower than stone tops; a future walking controller needs step tolerance or a separate collision proxy.', 'routes': results}


def write_plan(buildings):
    plan = {**PLAN, 'new_buildings': buildings['opposite_buildings']}
    path = PROJECT_DIR / 'assets' / 'extension-plan.json'
    path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    scale, origin_x, origin_y = 19, 510, 300

    def screen(point):
        return origin_x + point[0] * scale, origin_y - point[1] * scale

    def rectangle(bounds, fill, stroke='none'):
        left, bottom, right, top = bounds
        position_x, position_y = screen((left, top))
        return f'<rect x="{position_x}" y="{position_y}" width="{(right-left)*scale}" height="{(top-bottom)*scale}" fill="{fill}" stroke="{stroke}"/>'

    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="940" viewBox="0 0 1240 940">', '<rect width="1240" height="940" fill="#f5f2ea"/>', '<g font-family="Microsoft YaHei, sans-serif" fill="#25363c">', '<text x="40" y="47" font-size="28" font-weight="700">街区增量补全 01｜原有保留，镜头外新增</text>', '<text x="40" y="80" font-size="16">按实际 XY 坐标绘制 · 不是恢复单张参考图中不可见的真实结构 · 外部布局阶段</text>']
    parts.append(rectangle([-21, -22.5, 13, 10.5], '#e6e1d6', '#b5afa3'))
    parts.append(rectangle([-21, -10.55, 13, -1.755], '#9cbcc9'))
    parts.append(rectangle([-21, -1.61, 13, 1.19], '#c5b7a2'))
    parts.append(rectangle([-21, -15.48, 13, -10.79], '#c5b7a2'))
    for bounds in PLAN['existing_shops']:
        parts.append(rectangle(bounds, '#968b79', '#675d4e'))
    parts.append(rectangle([7.759, -10.55, 10.241, -1.755], '#968b79', '#675d4e'))
    for bounds in PLAN['rear_path_rectangles']:
        parts.append(rectangle(bounds, '#7db7a5', '#438778'))
    parts.append(rectangle([-18.9, -10.55, -17.1, -1.755], '#7db7a5', '#438778'))
    for center, width in ((-11, 5.6), (-3, 5.8), (4.8, 5.6)):
        parts.append(rectangle([center-width/2, -21.35, center+width/2, -16.35], '#7db7a5', '#438778'))
    for route_name, waypoints in PLAN['routes'].items():
        coordinates = ' '.join(f'{screen(point)[0]},{screen(point)[1]}' for point in waypoints)
        color = '#b76c32' if route_name == 'both_banks_loop' else '#4d6b9d'
        parts.append(f'<polyline points="{coordinates}" fill="none" stroke="{color}" stroke-width="3" stroke-dasharray="7 5"/>')
    for position, label in [((-8, 4.0), '原三店｜室内不开放'), ((-8.3, 8), '新增店后巷'), ((-11.5, -19), '新增对岸外壳'), ((-10, -6), '运河 / 不可进入'), ((-20.2, -7), '回程桥'), ((7.9, -6.3), '原桥')]:
        position_x, position_y = screen(position)
        parts.append(f'<text x="{position_x}" y="{position_y}" font-size="14">{escape(label)}</text>')
    notes = [
        '范围：约 34 × 33 米的外部街区片段',
        '灰色：原有建筑、桥与铺地，原样保留',
        '绿色：新增后巷、回程桥、对岸外壳',
        '橙虚线：两岸环线，利用原桥连接',
        '蓝虚线：绕三店背面的后巷环线',
        '',
        '本轮没有新增可进入的室内。',
        '原门窗仍封闭，新窗门只是外观。',
        '边界门外只作为背景，不宣称完整。',
        '',
        '新增集中于 EXT_Expansion01 集合。',
        '隐藏新增集合并切回原相机，可对照原景。',
        '旧工程、旧图、网页都不覆盖。',
        '',
        '这是结构补全候选，不是完成版街区；',
        '漫游控制、完整碰撞和导航仍未实现。',
    ]
    for index, note in enumerate(notes):
        parts.append(f'<text x="830" y="{135+index*29}" font-size="15">{escape(note)}</text>')
    parts.extend(['<text x="110" y="795" font-size="15">图上绿色为设计推测，不是原图实测；同一份新场景接受俯视与反向视角检查。</text>', '</g></svg>'])
    (PROJECT_DIR / 'assets' / 'extension-plan.svg').write_text('\n'.join(parts), encoding='utf-8')


def render_review(camera, index):
    ledger = json.loads(LEDGER.read_text(encoding='utf-8')) if LEDGER.exists() else {'maximum_attempts': 2, 'attempts': []}
    if len(ledger['attempts']) >= 2:
        raise RuntimeError('Two extension review renders have already been used.')
    image_path = PROJECT_DIR / 'assets' / f'extension-01-review-{index:02d}.png'
    if image_path.exists():
        raise RuntimeError('Refusing to overwrite an earlier review image.')
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.filepath = str(image_path)
    ledger['attempts'].append({'camera': camera.name, 'image': image_path.name, 'status': 'started', 'started_at': datetime.now(timezone.utc).isoformat()})
    LEDGER.write_text(json.dumps(ledger, indent=2) + '\n', encoding='utf-8')
    started = time.perf_counter()
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as error:
        ledger['attempts'][-1].update(status='failed', error=str(error))
        LEDGER.write_text(json.dumps(ledger, indent=2) + '\n', encoding='utf-8')
        raise
    ledger['attempts'][-1].update(status='complete', render_seconds=round(time.perf_counter()-started, 3), image_sha256=file_hash(image_path))
    LEDGER.write_text(json.dumps(ledger, indent=2) + '\n', encoding='utf-8')
    return ledger['attempts'][-1]


def run():
    parser = argparse.ArgumentParser(description='Additive exterior blockout: preserves the entire V5 source and all previous outputs.')
    parser.add_argument('--render', action='store_true')
    options = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if CANDIDATE.exists() or LEDGER.exists():
        raise RuntimeError('Existing extension candidate or ledger found; refusing to replace or repeat it.')
    baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
    if file_hash(SOURCE) != baseline['snapshot']['sha256']:
        raise RuntimeError('Frozen V5 source differs from the recorded baseline.')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    original_names = set(bpy.data.objects.keys())
    original_camera = bpy.context.scene.camera
    buildings = build_buildings()
    build_paths()
    build_return_bridge()
    cameras = build_cameras()
    camera_names = [camera.name for camera in cameras]
    extension_root = collection('EXT_Expansion01')
    for group in list(bpy.data.collections):
        if group.name.startswith('EXT_') and group != extension_root:
            if group.name in bpy.context.scene.collection.children:
                bpy.context.scene.collection.children.unlink(group)
            extension_root.children.link(group)
    bpy.context.view_layer.update()
    routes = check_routes()
    write_plan(buildings)
    scene = bpy.context.scene
    scene.camera = original_camera
    scene.render.resolution_x = 1104
    scene.render.resolution_y = 622
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 32
    scene.cycles.adaptive_threshold = .03
    scene.render.filepath = str(PROJECT_DIR / 'assets' / 'extension-01-review-01.png')
    added = sorted(set(bpy.data.objects.keys()) - original_names)
    if len(added) > 240:
        raise RuntimeError('First extension exceeded its bounded object budget.')
    bpy.ops.wm.save_as_mainfile(filepath=str(CANDIDATE), check_existing=True)
    audit = compare(baseline, snapshot(CANDIDATE), website_hashes(), preserved_file_changes(baseline['preserved_files']))
    audit.update(candidate=CANDIDATE.name, candidate_sha256=file_hash(CANDIDATE), saved_with_original_camera=True)
    (PROJECT_DIR / 'assets' / 'extension-01-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (PROJECT_DIR / 'assets' / 'extension-01-routes.json').write_text(json.dumps(routes, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if not audit['passed']:
        raise RuntimeError('Additive scene audit failed before rendering: ' + str(audit['violations']))
    report = {'source': SOURCE.name, 'candidate': CANDIDATE.name, 'candidate_sha256': file_hash(CANDIDATE), 'additive_audit_passed': True, 'added_counts': audit['added_counts'], 'buildings': buildings, 'review_cameras': camera_names, 'route_checks': {name: {'passed': value['sampled_checks_passed'], 'unsupported_samples': len(value['unsupported_samples']), 'body_ray_obstructions': len(value['body_ray_obstructions'])} for name, value in routes['routes'].items()}, 'rendered_previews': [], 'website_updated': False, 'final_scene_complete': False}
    if options.render:
        preferences = bpy.context.preferences.addons['cycles'].preferences
        preferences.compute_device_type = 'OPTIX'
        preferences.get_devices()
        for device in preferences.devices:
            device.use = device.type == 'OPTIX'
        if not any(device.use for device in preferences.devices):
            raise RuntimeError('Expected OptiX device unavailable; no render started.')
        for index, camera_name in enumerate(report['review_cameras'][:2], 1):
            report['rendered_previews'].append(render_review(bpy.data.objects[camera_name], index))
    report['old_files_unchanged_after_render'] = not preserved_file_changes(baseline['preserved_files'])
    report['websites_unchanged_after_render'] = website_hashes() == baseline['websites']
    (PROJECT_DIR / 'assets' / 'extension-01-stats.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('EXTENSION_RESULT', json.dumps({'candidate': CANDIDATE.name, 'added_counts': report['added_counts'], 'route_checks': report['route_checks'], 'renders': len(report['rendered_previews']), 'old_files_unchanged': report['old_files_unchanged_after_render']}), flush=True)


if __name__ == '__main__':
    run()
