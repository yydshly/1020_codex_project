"""Lower only six opposite-house door thresholds; retain the solid base.

Only three StonePlinth.data pointers change. Original meshes remain as fake-user
datablocks for recovery. No objects/materials/save/export or modifiers are added.
"""
import bpy
from mathutils import Vector

from extend_buildings import HOUSE_SPECS


PREFIX = 'SPACE03_'
TARGETS = tuple(f'EXT_Opposite_{index:02d}_StonePlinth' for index in (1,2,3))
NOTCH_DEPTH = .40
THRESHOLD_TOP = .925


def _cube(vertices, faces, bounds, inverse):
    left,bottom,low,right,top,high = bounds
    start = len(vertices)
    vertices.extend(tuple(inverse@Vector(point)) for point in (
        (left,bottom,low),(left,bottom,high),(left,top,low),(left,top,high),
        (right,bottom,low),(right,bottom,high),(right,top,low),(right,top,high)))
    for face in ((0,2,6,4),(1,5,7,3),(0,4,5,1),(2,3,7,6),(0,1,3,2),(4,6,7,5)):
        faces.append(tuple(start+index for index in face))


def build():
    if any(name not in bpy.data.objects for name in TARGETS):
        raise RuntimeError('The three original opposite-bank plinths are required.')
    if any(bpy.data.objects[name].data.name.startswith(PREFIX) for name in TARGETS):
        raise RuntimeError('Door-threshold plinth revision already applied.')
    bpy.context.view_layer.update()
    report=[]
    for index,(name,spec) in enumerate(zip(TARGETS,HOUSE_SPECS),1):
        obj=bpy.data.objects[name]
        original=obj.data
        source_materials=list(original.materials)
        coordinates=[obj.matrix_world@vertex.co for vertex in original.vertices]
        left,bottom,low=[min(point[axis] for point in coordinates) for axis in range(3)]
        right,top,high=[max(point[axis] for point in coordinates) for axis in range(3)]
        if abs(low-.85)>.0001 or abs(high-1.17)>.0001:
            raise RuntimeError('Unexpected original plinth heights: '+name)
        front_center=spec['center_x']
        rear_center=spec['center_x']+.45
        front_width=.86+.14
        rear_width=.79+.14
        # One uninterrupted lower course and five non-overlapping upper blocks.
        # The two openings are .40m deep, not tunnels through the whole footing.
        blocks=[(left,bottom,low,right,top,THRESHOLD_TOP),
                (left,bottom+NOTCH_DEPTH,THRESHOLD_TOP,right,top-NOTCH_DEPTH,high),
                (left,top-NOTCH_DEPTH,THRESHOLD_TOP,front_center-front_width/2,top,high),
                (front_center+front_width/2,top-NOTCH_DEPTH,THRESHOLD_TOP,right,top,high),
                (left,bottom,THRESHOLD_TOP,rear_center-rear_width/2,bottom+NOTCH_DEPTH,high),
                (rear_center+rear_width/2,bottom,THRESHOLD_TOP,right,bottom+NOTCH_DEPTH,high)]
        vertices,faces=[],[]
        inverse=obj.matrix_world.inverted()
        for bounds in blocks:
            _cube(vertices,faces,bounds,inverse)
        replacement=bpy.data.meshes.new(PREFIX+f'Opposite_{index:02d}_DoorThresholdPlinth')
        replacement.from_pydata(vertices,[],faces)
        replacement.update()
        for material in source_materials:
            replacement.materials.append(material)
        original.use_fake_user=True
        obj.data=replacement
        report.append({
            'object':name,'original_mesh':original.name,'replacement_mesh':replacement.name,
            'original_mesh_retained':True,'original_mesh_fake_user':True,
            'triangles':72,'previous_triangles':sum(len(face.vertices)-2 for face in original.polygons),
            'unchanged_bounds':{'min':[left,bottom,low],'max':[right,top,high]},
            'material_slots':[material.name if material else None for material in source_materials],
            'notches':[
                {'side':'front','center_x':front_center,'width':front_width,'depth':NOTCH_DEPTH,
                 'xy':[front_center-front_width/2,top-NOTCH_DEPTH,front_center+front_width/2,top],
                 'top_z':THRESHOLD_TOP},
                {'side':'rear','center_x':rear_center,'width':rear_width,'depth':NOTCH_DEPTH,
                 'xy':[rear_center-rear_width/2,bottom,rear_center+rear_width/2,bottom+NOTCH_DEPTH],
                 'top_z':THRESHOLD_TOP}],
            'solid_lower_course':[low,THRESHOLD_TOP],
        })
    bpy.context.view_layer.update()
    return {'objects_changed':list(TARGETS),'objects_added':0,'materials_added':0,
            'mesh_datablocks_added':3,'total_triangles':216,
            'net_triangle_increase':sum(item['triangles']-item['previous_triangles'] for item in report),
            'allowed_fields':['data'],
            'source_mesh_retention':'Original mesh geometry/materials unmodified; fake user enabled to keep it after save.',
            'houses':report,
            'scope':'Six door-edge notches only; solid .85-.925m base, source bounds, materials and object transforms preserved.'}
