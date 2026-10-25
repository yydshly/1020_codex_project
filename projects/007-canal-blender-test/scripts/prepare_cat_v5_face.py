"""Append local 3D eyelid shape targets, retaining all original GLB base bytes.

The source asset has a continuous textured face. Closing the aperture folds
that local surface into a fine lid seam and draws the surrounding fur inward.
No image pixels, bone weights, base vertices or triangle indices are edited.
"""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'web/models/cat-v3-rig.glb'
OUTPUT = ROOT / 'web/models/cat-v5-face.glb'
AUDIT = ROOT / 'assets/cat-v5-eye-landmarks-final.json'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def smooth(a, b, x):
    t = np.clip((x-a)/(b-a), 0, 1)
    return t*t*(3-2*t)


raw = SOURCE.read_bytes()
json_size = struct.unpack_from('<I', raw, 12)[0]
document = json.loads(raw[20:20+json_size])
binary_offset = 20 + json_size
binary_size = struct.unpack_from('<I', raw, binary_offset)[0]
original_binary = raw[binary_offset+8:binary_offset+8+binary_size]
binary = bytearray(original_binary)
primitive = document['meshes'][0]['primitives'][0]


def read_accessor(index):
    accessor = document['accessors'][index]
    view = document['bufferViews'][accessor['bufferView']]
    dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[accessor['componentType']]
    components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
    offset = view.get('byteOffset', 0)+accessor.get('byteOffset', 0)
    result = np.frombuffer(original_binary, dtype=dtype, count=accessor['count']*components, offset=offset)
    return result.reshape(accessor['count'], components).copy()


positions = read_accessor(primitive['attributes']['POSITION']).astype(np.float64)
normals = read_accessor(primitive['attributes']['NORMAL']).astype(np.float64)
triangles = read_accessor(primitive['indices']).reshape(-1, 3)
# Weld UV duplicates only for calculating smooth normals; actual vertices stay intact.
_, welded = np.unique(np.round(positions, 6), axis=0, return_inverse=True)


def calculate_normals(points):
    faces = np.cross(points[triangles[:, 1]]-points[triangles[:, 0]], points[triangles[:, 2]]-points[triangles[:, 0]])
    summed = np.zeros((int(welded.max())+1, 3))
    for corner in range(3):
        np.add.at(summed, welded[triangles[:, corner]], faces)
    length = np.linalg.norm(summed, axis=1, keepdims=True)
    return (summed/np.maximum(length, 1e-12))[welded]


base_recomputed = calculate_normals(positions)


def append_accessor(values):
    while len(binary) % 4:
        binary.append(0)
    values = np.asarray(values, dtype='<f4')
    offset = len(binary)
    binary.extend(values.tobytes())
    view_id = len(document['bufferViews'])
    document['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': values.nbytes, 'target': 34962})
    accessor_id = len(document['accessors'])
    document['accessors'].append({'bufferView': view_id, 'componentType': 5126, 'count': len(values), 'type': 'VEC3', 'min': values.min(axis=0).tolist(), 'max': values.max(axis=0).tolist()})
    return accessor_id


audit = json.loads(AUDIT.read_text(encoding='utf-8'))
target_names, targets, reports = [], [], []
for eye_name, target_name in [('screenLeft', 'Blink_Left'), ('screenRight', 'Blink_Right')]:
    eye = audit['eyes'][eye_name]
    center = np.array(eye['center'])
    basis = np.array([eye['basis_columns'][key] for key in ['horizontal', 'vertical', 'outward']]).T
    local = (positions-center) @ basis
    x, y, depth = local.T
    # The iris sits above the initially sampled center. Bounds were checked
    # against a texture-backed projection rather than assumed left/right symmetry.
    curve = eye['aperture_curve_metres']
    # Coarse eye triangles cross the semantic curve. Enclose their vertical
    # span as well, so a green-bearing triangle cannot remain at the corner.
    upper = np.interp(x, curve['x'], curve['upper_y']) + .0025
    lower = np.interp(x, curve['x'], curve['lower_y']) - .0020
    closure = eye['slit_line_y_intercept'] + eye['slit_line_y_slope']*x - .0003*np.maximum(0, 1-(x/.013)**2)
    seam_half_height = .000055
    horizontal_weight = 1-smooth(.0140, .0200, np.abs(x))
    depth_weight = smooth(-.011, -.0065, depth)*(1-smooth(.008, .013, depth))
    target_y = y.copy()
    middle = (y >= lower) & (y <= upper)
    target_y[middle] = closure[middle] + seam_half_height*(2*(y[middle]-lower[middle])/(upper[middle]-lower[middle])-1)
    above = y > upper
    target_y[above] = y[above] + (closure[above]+seam_half_height-upper[above])*(1-smooth(upper[above], upper[above]+.014, y[above]))
    below = y < lower
    target_y[below] = y[below] + (closure[below]-seam_half_height-lower[below])*smooth(lower[below]-.008, lower[below], y[below])
    weight = horizontal_weight*depth_weight
    delta_y = (target_y-y)*weight
    # At closure the original eye convexity should not remain as a thin ridge.
    aperture_weight = (1-smooth(.010, .018, np.abs(y-.003)))*weight
    delta_depth = (-.0015-depth)*.55*aperture_weight
    # All displacement fades to exactly zero at the eye-region boundary.
    delta_depth[np.abs(delta_y) < 1e-8] = 0
    deltas = delta_y[:, None]*basis[:, 1] + delta_depth[:, None]*basis[:, 2]
    deltas[np.linalg.norm(deltas, axis=1) < 1e-8] = 0
    active = np.linalg.norm(deltas, axis=1) > 0
    moved = positions+deltas
    recalculated = calculate_normals(moved)
    affected_triangles = np.any(active[triangles], axis=1)
    normal_mask = np.zeros(len(positions), dtype=bool)
    normal_mask[triangles[affected_triangles].flatten()] = True
    normal_mask = np.isin(welded, welded[normal_mask])
    new_normals = normals + recalculated-base_recomputed
    new_normals /= np.maximum(np.linalg.norm(new_normals, axis=1, keepdims=True), 1e-12)
    normal_delta = np.zeros_like(normals)
    normal_delta[normal_mask] = new_normals[normal_mask]-normals[normal_mask]
    targets.append({'POSITION': append_accessor(deltas), 'NORMAL': append_accessor(normal_delta)})
    target_names.append(target_name)
    reports.append({'name': target_name, 'source_eye': eye_name, 'center': center.tolist(), 'basis': basis.tolist(), 'affected_vertices': int(active.sum()), 'normal_vertices': int(normal_mask.sum()), 'max_displacement_m': float(np.linalg.norm(deltas, axis=1).max()), 'region_min': positions[active].min(axis=0).tolist(), 'region_max': positions[active].max(axis=0).tolist(), 'source_positions': positions[active].tolist(), 'morph_vertex_indices': np.flatnonzero(active).tolist()})

primitive['targets'] = targets
document['meshes'][0]['weights'] = [0, 0]
document['meshes'][0].setdefault('extras', {})['targetNames'] = target_names
document['buffers'][0]['byteLength'] = len(binary)
json_bytes = json.dumps(document, separators=(',', ':')).encode('utf-8')
json_bytes += b' ' * ((-len(json_bytes)) % 4)
binary.extend(b'\0' * ((-len(binary)) % 4))
length = 12+8+len(json_bytes)+8+len(binary)
output = struct.pack('<4sII', b'glTF', 2, length)+struct.pack('<I4s', len(json_bytes), b'JSON')+json_bytes+struct.pack('<I4s', len(binary), b'BIN\0')+binary
OUTPUT.write_bytes(output)
manifest = {'source': SOURCE.name, 'source_sha256': sha(raw), 'asset': OUTPUT.name, 'sha256': sha(output), 'bytes': len(output), 'triangles': len(triangles), 'vertices': len(positions), 'base_binary_prefix_unchanged': bytes(binary[:len(original_binary)]) == original_binary, 'morph_targets': reports, 'textures_unchanged': True, 'bones_and_skin_unchanged': True, 'method': 'Local textured face geometry morph, no screen-space covers; relative position and one-ring normal targets.', 'limitations': ['No independent eyeball gaze or jaw control.', 'Short blink on a continuous scanned face; macro closed-eye quality requires visual review.']}
(ROOT/'web/models/cat-v5-face.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({key: value for key, value in manifest.items() if key != 'morph_targets'}))
print(json.dumps([{key: eye[key] for key in ['name', 'affected_vertices', 'normal_vertices', 'max_displacement_m', 'region_min', 'region_max']} for eye in reports]))
assert SOURCE.read_bytes() == raw
