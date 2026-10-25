"""Sample the unchanged V3 face for separate, skinned V6 eyelid surfaces.

All coordinates are Three root space, Y-up/+Z-forward, metres. Height sampling
casts along each eye's fitted outward axis and takes the frontmost source hit.
Missing peripheral samples use the nearest valid source-face edge, with exact
barycentric skin-weight interpolation. No source model or image is modified.
"""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'web/models/cat-v3-rig.glb'
LANDMARKS = ROOT/'assets/cat-v5-eye-landmarks-final.json'
OUTPUT = ROOT/'web/models/cat-v6-lid-surface.json'
RESOLUTION = 65
RANGE = {'minX': -.021, 'maxX': .021, 'minY': -.016, 'maxY': .027}
DEPTH_GATE = (-.012, .012)
raw = SOURCE.read_bytes()
source_hash = hashlib.sha256(raw).hexdigest()
json_size = struct.unpack_from('<I', raw, 12)[0]
document = json.loads(raw[20:20+json_size])
bin_offset = 20+json_size
bin_size = struct.unpack_from('<I', raw, bin_offset)[0]
binary = raw[bin_offset+8:bin_offset+8+bin_size]
primitive = document['meshes'][0]['primitives'][0]


def accessor(index):
    spec = document['accessors'][index]
    view = document['bufferViews'][spec['bufferView']]
    dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[spec['componentType']]
    size = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[spec['type']]
    offset = view.get('byteOffset', 0)+spec.get('byteOffset', 0)
    if 'byteStride' in view:
        return np.ndarray((spec['count'], size), dtype=dtype, buffer=binary, offset=offset,
                          strides=(view['byteStride'], np.dtype(dtype).itemsize)).copy()
    return np.frombuffer(binary, dtype=dtype, offset=offset,
                         count=spec['count']*size).reshape(-1, size).copy()


positions = accessor(primitive['attributes']['POSITION']).astype(np.float64)
triangles = accessor(primitive['indices']).reshape(-1, 3)
joints = accessor(primitive['attributes']['JOINTS_0']).astype(np.int32)
weights = accessor(primitive['attributes']['WEIGHTS_0']).astype(np.float64)
skin_nodes = document['skins'][0]['joints']
joint_names = [document['nodes'][node]['name'] for node in skin_nodes]
selected_names = ['head', 'neck', 'chest', 'spine']
selected_joints = [joint_names.index(name) for name in selected_names]
selected_weights = np.stack([np.sum(np.where(joints == joint, weights, 0), axis=1)
                             for joint in selected_joints], axis=1)
other_weights = np.maximum(0, weights.sum(axis=1)-selected_weights.sum(axis=1))
landmarks = json.loads(LANDMARKS.read_text(encoding='utf-8'))


def clipped_segments(points):
    """Segments and barycentric endpoints clipped to the valid depth slab."""
    starts, ends, bary_starts, bary_ends = [], [], [], []
    eye = np.eye(3)
    for i, j in [(0, 1), (1, 2), (2, 0)]:
        a, b = points[:, i], points[:, j]
        dz = b[:, 2]-a[:, 2]
        safe = np.where(np.abs(dz) > 1e-12, dz, 1)
        low = (DEPTH_GATE[0]-a[:, 2])/safe
        high = (DEPTH_GATE[1]-a[:, 2])/safe
        t0 = np.maximum(0, np.minimum(low, high))
        t1 = np.minimum(1, np.maximum(low, high))
        horizontal = np.abs(dz) <= 1e-12
        t0[horizontal] = 0
        t1[horizontal] = np.where((a[horizontal, 2] >= DEPTH_GATE[0]) &
                                  (a[horizontal, 2] <= DEPTH_GATE[1]), 1, -1)
        good = t0 <= t1
        indices = np.flatnonzero(good)
        starts.append(a[good]+(b[good]-a[good])*t0[good, None])
        ends.append(a[good]+(b[good]-a[good])*t1[good, None])
        bary_starts.append((eye[i]+(eye[j]-eye[i])*t0[good, None]))
        bary_ends.append((eye[i]+(eye[j]-eye[i])*t1[good, None]))
        yield indices, starts[-1], ends[-1], bary_starts[-1], bary_ends[-1]


result = {'schemaVersion': 1, 'source': SOURCE.name, 'sourceSha256': source_hash,
          'coordinateSystem': 'Three root Y-up +Z-forward, metres',
          'resolution': RESOLUTION, 'range': RANGE, 'layout': 'row-major: y then x; weights interleaved 4 per sample',
          'depthGate': list(DEPTH_GATE), 'skinJoints': selected_joints,
          'skinJointNames': selected_names, 'eyes': []}
summary = []
for name, spec in landmarks['eyes'].items():
    center = np.array(spec['center'])
    basis = np.array([spec['basis_columns'][key]
                      for key in ['horizontal', 'vertical', 'outward']]).T
    local = (positions-center) @ basis
    source_triangles = local[triangles]
    minimum, maximum = source_triangles.min(axis=1), source_triangles.max(axis=1)
    mask = ((minimum[:, 0] <= RANGE['maxX']) & (maximum[:, 0] >= RANGE['minX']) &
            (minimum[:, 1] <= RANGE['maxY']) & (maximum[:, 1] >= RANGE['minY']) &
            (minimum[:, 2] <= DEPTH_GATE[1]) & (maximum[:, 2] >= DEPTH_GATE[0]))
    selected_triangles = triangles[mask]
    points = source_triangles[mask]
    a, b, c = points[:, 0], points[:, 1], points[:, 2]
    v0, v1 = b[:, :2]-a[:, :2], c[:, :2]-a[:, :2]
    determinant = v0[:, 0]*v1[:, 1]-v0[:, 1]*v1[:, 0]
    valid_projection = np.abs(determinant) > 1e-14
    denominator = np.where(valid_projection, determinant, 1)
    segments = list(clipped_segments(points))
    heights, output_weights = [], []
    fallback_count = 0
    aperture_fallback_count = 0
    max_fallback_distance = 0
    max_other_weight = 0
    weights_error = 0
    fallbacks = []
    xs = np.linspace(RANGE['minX'], RANGE['maxX'], RESOLUTION)
    ys = np.linspace(RANGE['minY'], RANGE['maxY'], RESOLUTION)
    curve = spec['aperture_curve_metres']
    for iy, y in enumerate(ys):
        for ix, x in enumerate(xs):
            relative = np.array([x, y])-a[:, :2]
            u = (relative[:, 0]*v1[:, 1]-relative[:, 1]*v1[:, 0])/denominator
            v = (v0[:, 0]*relative[:, 1]-v0[:, 1]*relative[:, 0])/denominator
            bary = np.stack([1-u-v, u, v], axis=1)
            depth = np.sum(bary*points[:, :, 2], axis=1)
            hits = valid_projection & np.all(bary >= -1e-8, axis=1) & (depth >= DEPTH_GATE[0]) & (depth <= DEPTH_GATE[1])
            if hits.any():
                face = int(np.argmax(np.where(hits, depth, -np.inf)))
                coefficients = bary[face]
                sample_depth = float(depth[face])
            else:
                fallback_count += 1
                if curve['x'][0] <= x <= curve['x'][-1] and np.interp(x, curve['x'], curve['lower_y']) <= y <= np.interp(x, curve['x'], curve['upper_y']):
                    aperture_fallback_count += 1
                best = None
                for indices, start, end, bs, be in segments:
                    edge = end[:, :2]-start[:, :2]
                    t = np.sum((np.array([x, y])-start[:, :2])*edge, axis=1)/np.maximum(np.sum(edge*edge, axis=1), 1e-20)
                    t = np.clip(t, 0, 1)
                    nearest = start[:, :2]+t[:, None]*edge
                    distances = np.sum((nearest-np.array([x, y]))**2, axis=1)
                    at = int(np.argmin(distances))
                    candidate = (float(distances[at]), int(indices[at]), bs[at]+(be[at]-bs[at])*t[at], float(start[at, 2]+(end[at, 2]-start[at, 2])*t[at]))
                    if best is None or candidate[0] < best[0]:
                        best = candidate
                distance, face, coefficients, sample_depth = best
                distance = float(np.sqrt(distance))
                max_fallback_distance = max(max_fallback_distance, distance)
                fallbacks.append({'xIndex': ix, 'yIndex': iy, 'distance': round(distance, 8)})
            vertex_ids = selected_triangles[face]
            interpolated = coefficients @ selected_weights[vertex_ids]
            other = float(coefficients @ other_weights[vertex_ids])
            max_other_weight = max(max_other_weight, other)
            weights_error = max(weights_error, abs(float(interpolated.sum())-1))
            interpolated = np.maximum(0, interpolated)
            interpolated /= max(float(interpolated.sum()), 1e-12)
            heights.append(round(sample_depth, 8))
            output_weights.extend(np.round(interpolated, 8).tolist())
    assert max_other_weight < 1e-6, (name, 'Unaccounted joint weight', max_other_weight)
    entry = {'name': name, 'center': spec['center'], 'basis': spec['basis_columns'],
             'curve': curve, 'slit': {'intercept': spec['slit_line_y_intercept'], 'slope': spec['slit_line_y_slope']},
             'height': heights, 'weights': output_weights, 'fallbackCount': fallback_count,
             'apertureFallbackCount': aperture_fallback_count, 'fallbackMaxDistance': max_fallback_distance,
             'fallbacks': fallbacks, 'candidateTriangles': len(points), 'maxOtherJointWeight': max_other_weight,
             'preNormalizationWeightError': weights_error}
    result['eyes'].append(entry)
    summary.append({key: entry[key] for key in ['name', 'fallbackCount', 'apertureFallbackCount', 'fallbackMaxDistance', 'candidateTriangles', 'maxOtherJointWeight', 'preNormalizationWeightError']})

assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash
OUTPUT.write_text(json.dumps(result, separators=(',', ':')), encoding='utf-8')
print(json.dumps({'output': str(OUTPUT), 'bytes': OUTPUT.stat().st_size,
                  'sourceUnchanged': True, 'skinJoints': selected_joints,
                  'samplesPerEye': RESOLUTION**2, 'eyes': summary}, indent=2))
