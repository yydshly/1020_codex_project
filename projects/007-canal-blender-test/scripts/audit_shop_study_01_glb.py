"""Read the existing GLB; report attribute and spatial material selections only."""
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'web/models/roam-02.glb'
raw = SOURCE.read_bytes()
offset = 12
doc = binary = None
while offset < len(raw):
    length, kind = struct.unpack_from('<II', raw, offset)
    data = raw[offset + 8:offset + 8 + length]
    if kind == 0x4E4F534A:
        doc = json.loads(data)
    elif kind == 0x004E4942:
        binary = data
    offset += 8 + length

DTYPES = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
SIZES = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def accessor(index):
    spec = doc['accessors'][index]
    view = doc['bufferViews'][spec['bufferView']]
    dtype = np.dtype(DTYPES[spec['componentType']])
    components = SIZES[spec['type']]
    start = view.get('byteOffset', 0) + spec.get('byteOffset', 0)
    stride = view.get('byteStride', dtype.itemsize * components)
    a = np.ndarray((spec['count'], components), dtype=dtype, buffer=binary,
                   offset=start, strides=(stride, dtype.itemsize)).copy()
    if spec.get('normalized') and dtype.kind in 'iu':
        a = a.astype(np.float32) / np.iinfo(dtype).max
    return a


def describe_subset(vertices, triangles, chosen):
    selected = triangles[chosen]
    if len(selected) == 0:
        return {'triangles': 0}
    values = vertices[selected.ravel()]
    return {'triangles': int(len(selected)), 'min': values.min(axis=0).round(5).tolist(),
            'max': values.max(axis=0).round(5).tolist()}


source_audit = json.loads((ROOT / 'assets/shop-study-01-source-audit.json').read_text(encoding='utf-8'))
rows = []
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        mat = doc['materials'][primitive['material']]
        vertices = accessor(primitive['attributes']['POSITION'])
        triangles = accessor(primitive['indices']).reshape(-1, 3)
        center = vertices[triangles].mean(axis=1)
        x, y, z = center.T
        whole = (x >= -4.04) & (x <= 2.04) & (y >= .82) & (y <= 7.85) & (z >= -6.65) & (z <= -.6)
        front = (x >= -3.98) & (x <= 1.98) & (y >= .82) & (y <= 7.85) & (z >= -1.50) & (z <= -.70)
        lower_front = front & (y <= 4.72)
        short_name = mat['name'].split(' / ')[-1]
        source_boxes = [r for r in source_audit['objects'] if short_name in r.get('materials', [])]
        source_match = np.zeros(len(triangles), dtype=bool)
        tri_min = vertices[triangles].min(axis=1)
        tri_max = vertices[triangles].max(axis=1)
        for source_box in source_boxes:
            source_match |= ((tri_min >= np.array(source_box['min']) - 0.0001).all(axis=1)
                             & (tri_max <= np.array(source_box['max']) + 0.0001).all(axis=1))
        row = {'mesh': mesh['name'], 'material': mat['name'],
               'attributes': primitive['attributes'], 'triangles': len(triangles),
               'whole_shop_mask': describe_subset(vertices, triangles, whole),
               'full_height_front_mask': describe_subset(vertices, triangles, front),
               'lower_front_mask': describe_subset(vertices, triangles, lower_front),
               'source_object_aabb_mask': describe_subset(vertices, triangles, source_match),
               'source_object_aabbs': [{'name': r['name'], 'min': r['min'], 'max': r['max']} for r in source_boxes]}
        if 'COLOR_0' in primitive['attributes']:
            color = accessor(primitive['attributes']['COLOR_0'])
            row['color_min'] = color.min(axis=0).tolist()
            row['color_max'] = color.max(axis=0).tolist()
        rows.append(row)

result = {'source': str(SOURCE), 'sha256': hashlib.sha256(raw).hexdigest(),
          'textures': doc.get('textures', []), 'nodes': doc['nodes'], 'meshes': rows,
          'note': 'Masks are triangle-centroid diagnostics. They never cut or move a triangle. '
                  'The lower-front mask can assign only part of a tall side wall or cornice. '
                  'Prefer full-height front plaster, teal and glass; keep large party walls together.'}
destination = ROOT / 'assets/shop-study-01-glb-audit.json'
destination.write_text(json.dumps(result, indent=2), encoding='utf-8')
runtime_boxes = {
    row['material'].split(' / ')[-1]: row['source_object_aabbs']
    for row in rows if row['material'].split(' / ')[-1]
    in ('wood', 'wood_light', 'teal', 'plaster_alt', 'stone', 'stone_light', 'glass', 'warm_glow', 'brass')
}
(ROOT / 'web/shop-study-01-bookshop-bounds.json').write_text(
    json.dumps({'source': '02 Bookshop collection in rainy-canal-roam-02.blend',
                'epsilon': 0.0001, 'selection': 'All three triangle vertices inside any material AABB',
                'materials': runtime_boxes}, separators=(',', ':')), encoding='utf-8')
for row in rows:
    if row['whole_shop_mask']['triangles']:
        print(row['material'], 'whole', row['whole_shop_mask']['triangles'],
              'front', row['full_height_front_mask']['triangles'],
              'lower', row['lower_front_mask']['triangles'],
              'source', row['source_object_aabb_mask']['triangles'])
print('WROTE', destination)
