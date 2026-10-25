import bpy, json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/cat-a/materials'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'artifacts/cat-a/source/original/cat.blend'),load_ui=False,use_scripts=False)

def val(v):
    try:return list(v)
    except TypeError:return v
def tree(t):
    if t is None:return None
    return {'nodes':[{'name':n.name,'type':n.bl_idname,'image':n.image.name if hasattr(n,'image') and n.image else None,
                     'inputs':{s.name:val(s.default_value) for s in n.inputs if hasattr(s,'default_value')},
                     'group':n.node_tree.name if hasattr(n,'node_tree') and n.node_tree else None} for n in t.nodes],
            'links':[f'{l.from_node.name}.{l.from_socket.name} -> {l.to_node.name}.{l.to_socket.name}' for l in t.links]}
report={'materials':{m.name:tree(m.node_tree) for m in bpy.data.materials},
        'groups':{g.name:tree(g) for g in bpy.data.node_groups},
        'images':[{'name':i.name,'size':list(i.size),'colorSpace':i.colorspace_settings.name,'packed':bool(i.packed_file)} for i in bpy.data.images],
        'objects':[{'name':o.name,'uvs':[u.name for u in o.data.uv_layers], 'materialSlots':[m.name if m else None for m in o.data.materials],
                    'polyMaterials':{str(i):sum(p.material_index==i for p in o.data.polygons) for i in range(len(o.data.materials))}}
                   for o in bpy.data.objects if o.type=='MESH'],
        'particles':[{'name':p.name,'type':p.type,'count':p.count,'hairLength':p.hair_length,'material':p.material} for p in bpy.data.particles]}
(OUT/'source-material-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
for name in ['Untitled','green_eye_diff.jpg.001']:
    i=bpy.data.images.get(name)
    if i:
        i.filepath_raw=str(OUT/(('cat-color' if name=='Untitled' else 'cat-eye')+'.png'))
        i.file_format='PNG'
        i.save()
print('MATERIAL AUDIT COMPLETE',OUT)
