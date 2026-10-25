"""Refine only the three opposite-bank roofs in a new in-memory scene.

Replaces the three named ClosedRoof mesh datablocks and appends SPACE03_
tile/eave/drainage meshes. Does not save, export, alter material datablocks,
or modify any other source object. All visible relief is base geometry.
"""
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from extend_buildings import HOUSE_SPECS
from scene_utils import mesh

PREFIX = 'SPACE03_'
COLLECTION = PREFIX + 'Roofs'
TARGETS = tuple(f'EXT_Opposite_{i:02d}_ClosedRoof' for i in (1, 2, 3))
TILE_COLUMNS = 18
TILE_ROWS = 6
RIDGE_CAPS = 16
TRIANGLE_LIMIT = 6500


class Batch:
    def __init__(self):
        self.vertices, self.faces, self.materials, self.smooth = [], [], [], []

    def add(self, vertices, faces, material=0, smooth=False):
        offset = len(self.vertices)
        self.vertices.extend(tuple(v) for v in vertices)
        self.faces.extend(tuple(offset + i for i in face) for face in faces)
        self.materials.extend([material] * len(faces))
        self.smooth.extend([smooth] * len(faces))

    def face(self, vertices, material=0, smooth=False):
        self.add(vertices, [tuple(range(len(vertices)))], material, smooth)

    def box(self, center, dimensions, material=0):
        signs = ((-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),
                 (1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1))
        vertices = [tuple(center[i] + sign[i] * dimensions[i] / 2 for i in range(3)) for sign in signs]
        self.add(vertices, [(0,2,6,4),(1,5,7,3),(0,4,5,1),(2,3,7,6),(0,1,3,2),(4,6,7,5)], material)

    def beam(self, start, end, width, height, material=0):
        a, b = Vector(start), Vector(end)
        tangent = (b-a).normalized()
        u = Vector((1,0,0))
        v = tangent.cross(u).normalized()
        ring = [(-1,-1), (1,-1), (1,1), (-1,1)]
        vertices = [point + u * sign_u * width/2 + v * sign_v * height/2
                    for point in (a,b) for sign_u, sign_v in ring]
        self.add(vertices, [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], material)

    def extrude_x(self, profile_yz, left, right, material=0):
        profile = list(profile_yz)
        area = sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(profile,profile[1:]+profile[:1]))
        if area < 0:
            profile.reverse()
        n = len(profile)
        vertices = [(x,y,z) for x in (left,right) for y,z in profile]
        faces = [tuple(reversed(range(n))), tuple(range(n,2*n))]
        faces.extend((i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n))
        self.add(vertices, faces, material)

    def tube(self, centers, radius=.036, sides=6, material=0):
        centers = [Vector(point) for point in centers]
        vertices = []
        for index, point in enumerate(centers):
            tangent = centers[min(index+1,len(centers)-1)] - centers[max(index-1,0)]
            tangent.normalize()
            u = Vector((1,0,0))
            v = tangent.cross(u).normalized()
            for sample in range(sides):
                theta = math.tau * sample / sides
                vertices.append(point + radius * (u * math.cos(theta) + v * math.sin(theta)))
        faces = []
        for row in range(len(centers)-1):
            for sample in range(sides):
                nxt = (sample+1)%sides
                faces.append((row*sides+sample,row*sides+nxt,(row+1)*sides+nxt,(row+1)*sides+sample))
        self.add(vertices, faces, material, True)
        self.face([vertices[i] for i in reversed(range(sides))], material)
        self.face(vertices[-sides:], material)

    def finish(self, name, materials):
        obj = mesh(PREFIX + name, self.vertices, self.faces, materials, COLLECTION, self.materials)
        for face, smooth in zip(obj.data.polygons, self.smooth):
            face.use_smooth = smooth
        return obj

    def replace_data(self, obj, name, materials):
        data = bpy.data.meshes.new(PREFIX + name)
        data.from_pydata(self.vertices, [], self.faces)
        for material in materials:
            data.materials.append(material)
        for face, material, smooth in zip(data.polygons, self.materials, self.smooth):
            face.material_index = material
            face.use_smooth = smooth
        data.update()
        obj.data = data


def _roof_dimensions(spec):
    ridge = .85 + spec['height']
    return {'left': spec['center_x']-spec['width']/2-.23,
            'right': spec['center_x']+spec['width']/2+.23,
            'front': -16.10, 'back': -21.60, 'ridge_y': -18.85,
            'eaves': ridge-1.15, 'ridge': ridge}


def _solid_deck_and_gables(obj, index, spec, dims, materials):
    deck = Batch()
    eaves, ridge = dims['eaves'], dims['ridge']
    profile = [(dims['front'],eaves),(dims['ridge_y'],ridge),(dims['back'],eaves),
               (dims['back'],eaves-.115),(dims['ridge_y'],ridge-.115),(dims['front'],eaves-.115)]
    deck.extrude_x(profile,dims['left'],dims['right'],0)
    # Plastered gable ends sit at the real side walls, with an eave overhang
    # in front of them, instead of filling the entire projected roof outline.
    gable = [(-16.35,eaves-.02),(dims['ridge_y'],ridge-.115),(-21.35,eaves-.02)]
    for side in (-1,1):
        x = spec['center_x'] + side*spec['width']/2
        deck.extrude_x(gable,x-.012,x+.012,1)
    deck.replace_data(obj, f'Opposite_{index:02d}_SolidRoofDeck', [materials['roof'],materials['plaster_alt']])


def _tile_field(index, dims, materials):
    batch = Batch()
    rng = random.Random(7319 + index)
    left, right = dims['left']+.010, dims['right']-.010
    tile_width = (right-left)/TILE_COLUMNS
    pitch_span = dims['front']-dims['ridge_y']
    tile_count = 0
    tile_top_polygon_count = 0
    for side in (-1,1):
        for row in range(TILE_ROWS):
            offset = .5*tile_width if row%2 else 0
            a = row*pitch_span/TILE_ROWS
            b = min(pitch_span+.018,(row+1)*pitch_span/TILE_ROWS+.055)
            for column in range(-1 if offset else 0,TILE_COLUMNS):
                x0 = max(left,left+column*tile_width+offset)+.004
                x1 = min(right,left+(column+1)*tile_width+offset)-.004
                if x1-x0 < .025:
                    continue
                tile_count += 1
                material = 1 if rng.random()<.105 else 0
                jitter = rng.uniform(-.0025,.0025)
                vertices = []
                for distance, lift in ((a,.012+jitter),(b,.036+jitter)):
                    base = dims['ridge'] - distance/pitch_span*(dims['ridge']-dims['eaves'])
                    for fraction in (0,.5,1):
                        vertices.append((x0+(x1-x0)*fraction,dims['ridge_y']+side*distance,
                                         base+lift+.014*math.sin(math.pi*fraction)))
                faces = [(0,1,4,3),(1,2,5,4)]
                if side<0:
                    faces = [tuple(reversed(face)) for face in faces]
                batch.add(vertices,faces,material,True)
                tile_top_polygon_count += 2
                # Independent lip vertices keep the tile face normals from
                # averaging with its downward 18mm-thick leading edge.
                lip = [vertices[3],vertices[4],vertices[5],
                       (vertices[5][0],vertices[5][1],vertices[5][2]-.018),
                       (vertices[3][0],vertices[3][1],vertices[3][2]-.018)]
                batch.face(lip if side>0 else list(reversed(lip)),material)
    # Restrained overlapping half-round ridge caps, with a real visible lip.
    step = (right-left)/RIDGE_CAPS
    for cap in range(RIDGE_CAPS):
        x0 = left+cap*step
        x1 = min(right,left+(cap+1)*step+.022)
        vertices = []
        for x,lift in ((x0,.025),(x1,.032)):
            for sample in range(5):
                theta = math.pi*sample/4
                vertices.append((x,dims['ridge_y']+.085*math.cos(theta),
                                 dims['ridge']+lift+.085*math.sin(theta)))
        cap_material = 1 if cap in (5,13) else 0
        batch.add(vertices,[(i,i+1,i+6,i+5) for i in range(4)],cap_material,True)
        for sample in range(4):
            a,b = vertices[5+sample],vertices[6+sample]
            batch.face([a,b,(b[0],b[1],b[2]-.018),(a[0],a[1],a[2]-.018)],cap_material)
    obj = batch.finish(f'Opposite_{index:02d}_StaggeredTilesAndRidge',[materials['roof'],materials['roof_alt']])
    return obj, {'tile_count':tile_count,'ridge_cap_count':RIDGE_CAPS,
                 'tile_columns':TILE_COLUMNS,'tile_rows_per_pitch':TILE_ROWS,
                 'tile_lip_thickness':.018,'roof_deck_thickness':.115,
                 'stagger_fraction':.5,'top_tile_polygons':tile_top_polygon_count}


def _eave_boards(index,dims,materials):
    batch = Batch()
    for edge_y in (dims['front'],dims['back']):
        batch.box(((dims['left']+dims['right'])/2,edge_y,dims['eaves']-.061),
                  (dims['right']-dims['left']+.018,.065,.12))
    for side_x in (dims['left']+.006,dims['right']-.006):
        for edge_y in (dims['front'],dims['back']):
            batch.beam((side_x,edge_y,dims['eaves']-.055),
                       (side_x,dims['ridge_y'],dims['ridge']-.055),.07,.11)
    return batch.finish(f'Opposite_{index:02d}_EaveAndVergeBoards',[materials['wood']])


def _drainage(index,spec,dims,materials):
    batch = Batch()
    for side,edge_y,wall_y in ((1,dims['front'],-16.35),(-1,dims['back'],-21.35)):
        center_y = edge_y+side*.035
        center_z = dims['eaves']-.070
        outer = [(center_y+.065*math.cos(math.pi*i/4),center_z-.065*math.sin(math.pi*i/4)) for i in range(5)]
        inner = [(center_y+.055*math.cos(math.pi*i/4),center_z-.055*math.sin(math.pi*i/4)) for i in reversed(range(5))]
        batch.extrude_x(outer+inner,dims['left']+.015,dims['right']-.015)
        pipe_x = spec['center_x']+side*(spec['width']/2-.17)
        near_wall_y = wall_y+side*.12
        batch.tube([(pipe_x,center_y,center_z),
                    (pipe_x,center_y,dims['eaves']-.31),
                    (pipe_x,near_wall_y,dims['eaves']-.50),
                    (pipe_x,near_wall_y,1.10),
                    (pipe_x,wall_y+side*.22,1.02)],.036,6)
        for z in (1.65,(dims['eaves']+1.0)/2):
            batch.box((pipe_x,wall_y+side*.075,z),(.115,.15,.035))
    return batch.finish(f'Opposite_{index:02d}_RainGuttersAndDownpipes',[materials['iron']])


def _bounds(obj):
    vertices = [obj.matrix_world @ Vector(point) for point in obj.bound_box]
    return {'min':[min(point[i] for point in vertices) for i in range(3)],
            'max':[max(point[i] for point in vertices) for i in range(3)]}


def _triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def build():
    if bpy.data.collections.get(COLLECTION):
        raise RuntimeError('SPACE03 roof details already exist; refusing duplicate additions.')
    source_objects = {name: (obj.data.as_pointer() if obj.data else None,
                             tuple(tuple(row) for row in obj.matrix_world),
                             tuple(c.name for c in obj.users_collection),obj.hide_render,obj.hide_viewport)
                      for name,obj in bpy.data.objects.items()}
    required = ('roof','roof_alt','wood','iron','plaster_alt')
    materials = {name:bpy.data.materials[name] for name in required}
    created, modified, houses = [], [], []
    old_triangles = 0
    for index,spec in enumerate(HOUSE_SPECS,1):
        obj = bpy.data.objects[f'EXT_Opposite_{index:02d}_ClosedRoof']
        if [m.name for m in obj.data.materials] != ['roof','plaster_alt']:
            raise RuntimeError('Unexpected original roof material slots: '+obj.name)
        old_bounds = _bounds(obj)
        old_data_name = obj.data.name
        old_triangles += _triangles(obj)
        dims = _roof_dimensions(spec)
        _solid_deck_and_gables(obj,index,spec,dims,materials)
        tiles,tile_meta = _tile_field(index,dims,materials)
        boards = _eave_boards(index,dims,materials)
        drainage = _drainage(index,spec,dims,materials)
        created.extend((tiles,boards,drainage))
        modified.append(obj.name)
        houses.append({'source_roof':obj.name,'source_mesh':old_data_name,'replacement_mesh':obj.data.name,
                       'original_bounds':old_bounds,'original_ridge_z':dims['ridge'],
                       'details':tile_meta,'new_objects':[tiles.name,boards.name,drainage.name]})
    bpy.context.view_layer.update()
    unaffected = all(name in bpy.data.objects and before == (
        bpy.data.objects[name].data.as_pointer() if bpy.data.objects[name].data else None,
        tuple(tuple(row) for row in bpy.data.objects[name].matrix_world),
        tuple(c.name for c in bpy.data.objects[name].users_collection),
        bpy.data.objects[name].hide_render,bpy.data.objects[name].hide_viewport)
        for name,before in source_objects.items() if name not in TARGETS)
    if not unaffected:
        raise RuntimeError('An unapproved source object changed.')
    total = sum(_triangles(obj) for obj in created)+sum(_triangles(bpy.data.objects[name]) for name in modified)
    if total>TRIANGLE_LIMIT:
        raise RuntimeError(f'Roof detail budget exceeded: {total}>{TRIANGLE_LIMIT}')
    for house in houses:
        objects = [bpy.data.objects[house['source_roof']]]+[bpy.data.objects[name] for name in house['new_objects']]
        bounds = [_bounds(obj) for obj in objects]
        merged = {'min':[min(b['min'][i] for b in bounds) for i in range(3)],
                  'max':[max(b['max'][i] for b in bounds) for i in range(3)]}
        house['new_bounds_including_drainage'] = merged
        house['maximum_xy_overhang_increase'] = max(max(0,house['original_bounds']['min'][i]-merged['min'][i],
                                                       merged['max'][i]-house['original_bounds']['max'][i]) for i in (0,1))
        house['maximum_ridge_height_increase'] = merged['max'][2]-house['original_ridge_z']
        house['triangles_including_replacement'] = sum(_triangles(obj) for obj in objects)
        if house['maximum_xy_overhang_increase'] >= .15 or house['maximum_ridge_height_increase'] > .14:
            raise RuntimeError('Roof accessories exceeded their permitted envelope.')
    return {'scope':'Only three ClosedRoof mesh pointers replaced; physical roof details appended.',
            'modified_source_objects':modified,'modified_fields':['data'],
            'added_objects':{obj.name:{'triangles':_triangles(obj),'bounds':_bounds(obj)} for obj in created},
            'added_collection':COLLECTION,'new_materials':0,'reused_materials':list(required),
            'all_other_source_object_state_preserved':unaffected,
            'source_roof_triangles':old_triangles,'new_roof_triangles_including_replacements':total,
            'triangle_delta':total-old_triangles,'triangle_limit':TRIANGLE_LIMIT,
            'houses':houses,'saved_or_exported':False,
            'notes':['All relief is base mesh; no bevel, subdivision or normal modifier dependency.',
                     'Existing EavesAndBand and all facade geometry remain untouched.',
                     'Opaque gable closures remain exterior-only; no interiors were added.']}
