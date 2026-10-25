"""Read-only verification of the four V6 eyelid atlas sampling rectangles."""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
source = ROOT/'web/models/cat-v3-rig.glb'
raw = source.read_bytes()
size = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+size])
offset = 20+size
binary_size = struct.unpack_from('<I', raw, offset)[0]
binary = raw[offset+8:offset+8+binary_size]


def accessor(index):
    item = doc['accessors'][index]
    view = doc['bufferViews'][item['bufferView']]
    dtype = {5126: '<f4', 5123: '<u2', 5125: '<u4'}[item['componentType']]
    columns = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[item['type']]
    return np.frombuffer(binary, dtype=dtype, count=item['count']*columns,
                         offset=view.get('byteOffset', 0)+item.get('byteOffset', 0)).reshape(item['count'], columns)


primitive = doc['meshes'][0]['primitives'][0]
position = accessor(primitive['attributes']['POSITION'])
uv = accessor(primitive['attributes']['TEXCOORD_0'])
faces = accessor(primitive['indices']).reshape(-1, 3).astype(int)
parents = list(range(len(position)))


def find(index):
    while parents[index] != index:
        parents[index] = parents[parents[index]]
        index = parents[index]
    return index


for a, b, c in faces:
    for other in [b, c]:
        parents[find(int(other))] = find(int(a))
island_image = Image.new('I', (1024, 1024))
draw = ImageDraw.Draw(island_image)
for tri in faces:
    draw.polygon([tuple(point*1024) for point in uv[tri]], fill=find(int(tri[0]))+1)
islands = np.asarray(island_image)
texture = np.asarray(Image.open(ROOT/'assets/cat-v5-eye-source-basecolor.jpg').convert('RGB'))
landmarks = json.loads((ROOT/'assets/cat-v5-eye-landmarks-final.json').read_text())
patches = {'screenLeft_upper': [39, 392, 6], 'screenLeft_lower': [40, 392, 4],
           'screenRight_upper': [36, 926, 7], 'screenRight_lower': [34, 923, 4]}
report = {'source': source.name, 'source_sha256': hashlib.sha256(raw).hexdigest(),
          'method': 'All sampled rectangles are inside a single connected UV island and triangles geometrically outside the eye aperture; original image bytes unchanged.',
          'patches': {}}
for name, (x, y, radius) in patches.items():
    eye_name, lid = name.split('_')
    eye = landmarks['eyes'][eye_name]
    basis = np.array([eye['basis_columns'][key] for key in ['horizontal', 'vertical', 'outward']]).T
    local = (position-eye['center'])@basis
    vertices = local[faces]
    # Both donors come from lighter upper periocular fur, with the lower-lid
    # donor deliberately selected near a cream guard-hair patch.
    safe = ((np.abs(vertices[:, :, 0]).max(axis=1) < .031)
            & (np.abs(vertices[:, :, 2]).max(axis=1) < .014)
            & (vertices[:, :, 1].min(axis=1) > .012)
            & (vertices[:, :, 1].max(axis=1) < .036))
    safe_image = Image.new('L', (1024, 1024))
    draw = ImageDraw.Draw(safe_image)
    for tri in faces[safe]:
        draw.polygon([tuple(point*1024) for point in uv[tri]], fill=255)
    crop = (slice(y-radius, y+radius+1), slice(x-radius, x+radius+1))
    labels = np.unique(islands[crop])
    sampled = texture[crop]
    valid = bool((np.asarray(safe_image)[crop] == 255).all() and len(labels) == 1 and labels[0] > 0)
    report['patches'][name] = {'center_px': [x, y], 'half_size_px': radius, 'shader_inset_px': 1.5,
                             'connected_island': labels.tolist(), 'safe_fur_region': valid, 'donor': 'upper_periocular_fur',
                             'mean_rgb': sampled.mean((0, 1)).tolist()}
report['passed'] = all(item['safe_fur_region'] for item in report['patches'].values())
report['source_unchanged'] = source.read_bytes() == raw
(ROOT/'assets/cat-v6-fur-uv-check.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
assert report['passed'] and report['source_unchanged']
