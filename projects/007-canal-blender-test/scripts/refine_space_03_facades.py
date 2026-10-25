"""Replace only the three opposite-house wall/detail shells in a new copy.

All old datablocks remain intact. Six explicitly named objects are hidden and
new SPACE03_ exterior meshes provide shallow, closed recesses. No save/export.
"""
import math

import bpy
from mathutils import Vector

from scene_utils import mesh, rgb
from extend_buildings import HOUSE_SPECS


PREFIX = 'SPACE03_'
GROUP = PREFIX + 'Facades'
ALLOWED_HIDDEN = [f'EXT_Opposite_{index:02d}_{suffix}'
                  for index in range(1, 4)
                  for suffix in ('ClosedShell', 'OpaqueWindowDoorDetails')]
FRONT, BACK, GROUND = -16.35, -21.35, .85


class Batch:
    def __init__(self, name, materials):
        self.name, self.materials = name, materials
        self.vertices, self.faces, self.indices = [], [], []
        self.names = []

    def face(self, vertices, material, reverse=False):
        if material not in self.names:
            self.names.append(material)
        start = len(self.vertices)
        self.vertices.extend(vertices)
        face = tuple(range(start, start + len(vertices)))
        self.faces.append(tuple(reversed(face)) if reverse else face)
        self.indices.append(self.names.index(material))

    def box(self, center, size, material, transform, reverse=False):
        signs = ((-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),
                 (1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1))
        points = [transform(tuple(center[axis]+sign[axis]*size[axis]/2
                                  for axis in range(3))) for sign in signs]
        for face in ((0,2,6,4),(1,5,7,3),(0,4,5,1),(2,3,7,6),(0,1,3,2),(4,6,7,5)):
            self.face([points[index] for index in face], material, reverse)

    def finish(self):
        result = mesh(self.name, self.vertices, self.faces,
                      [self.materials[name] for name in self.names], GROUP, self.indices)
        result['exterior_only'] = True
        result['enterable'] = False
        return result


class Facade:
    def __init__(self, batch, axis, plane, center, direction):
        self.batch, self.axis, self.plane = batch, axis, plane
        self.center, self.direction = center, direction
        self.reverse = direction < 0 if axis == 'Y' else direction > 0

    def world(self, point):
        u, depth, z = point
        if self.axis == 'Y':
            return (self.center+u, self.plane+depth*self.direction, z)
        return (self.plane+depth*self.direction, self.center+u, z)

    def face(self, points, material, reverse=False):
        self.batch.face([self.world(point) for point in points], material, self.reverse != reverse)

    def box(self, u, depth, z, width, thickness, height, material):
        self.batch.box((u,depth,z),(width,thickness,height),material,self.world,self.reverse)

    def rectangle(self, u, z, width, height, depth, material):
        self.face([(u-width/2,depth,z-height/2),(u-width/2,depth,z+height/2),
                   (u+width/2,depth,z+height/2),(u+width/2,depth,z-height/2)],material)


def new_material(name, colour, roughness, metallic=0, emission=None):
    full_name = PREFIX+name
    if bpy.data.materials.get(full_name):
        raise RuntimeError('Refusing to replace existing material '+full_name)
    material = bpy.data.materials.new(full_name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = rgb(colour)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    if emission:
        shader.inputs['Emission Color'].default_value = rgb(emission[0])
        shader.inputs['Emission Strength'].default_value = emission[1]
    material.diffuse_color = rgb(colour)
    return material


def wall(facade, width, eaves, openings, plaster):
    """Continuous thick wall with actual rectangular holes, no overlapping boxes."""
    holes = [(item['u']-item['w']/2, item['z']-item['h']/2,
              item['u']+item['w']/2, item['z']+item['h']/2) for item in openings]
    us = sorted(set([-width/2,width/2]+[value for hole in holes for value in (hole[0],hole[2])]))
    zs = sorted(set([GROUND,eaves]+[value for hole in holes for value in (hole[1],hole[3])]))
    for left,right in zip(us[:-1],us[1:]):
        for bottom,top in zip(zs[:-1],zs[1:]):
            u,z=(left+right)/2,(bottom+top)/2
            if any(a<u<c and b<z<d for a,b,c,d in holes):
                continue
            facade.rectangle(u,z,right-left,top-bottom,0,plaster)
            facade.face([(left,-.28,bottom),(right,-.28,bottom),
                         (right,-.28,top),(left,-.28,top)],plaster)
    # Close the wall perimeter and each reveal through 28 cm masonry.
    for boundary_index,(left,bottom,right,top) in enumerate([(-width/2,GROUND,width/2,eaves)]+holes):
        loop=[(left,bottom),(right,bottom),(right,top),(left,top)]
        for (u1,z1),(u2,z2) in zip(loop,loop[1:]+loop[:1]):
            facade.face([(u1,0,z1),(u2,0,z2),(u2,-.28,z2),(u1,-.28,z1)],plaster,
                        reverse=boundary_index>0)


def shutter(facade, u, z, width, height, side, angle, trim):
    theta=math.radians(angle)
    hinge=u+side*(width/2+.075)
    leaf=.43
    def transform(point):
        s,depth,zz=point
        return facade.world((hinge+side*(s*math.cos(theta)-depth*math.sin(theta)),
                             .075+s*math.sin(theta)+depth*math.cos(theta),zz))
    flip=facade.reverse != (side<0)
    for center,size in [((.035,0,z),(.07,.055,height+.03)),
                        ((leaf-.035,0,z),(.07,.055,height+.03)),
                        ((leaf/2,0,z-height/2+.035),(leaf,.055,.07)),
                        ((leaf/2,0,z+height/2-.035),(leaf,.055,.07))]:
        facade.batch.box(center,size,trim,transform,flip)
    count=7
    pitch=(height-.16)/count
    for index in range(count):
        center_z=z-height/2+.08+pitch*(index+.5)
        points=[(.065,-.027,center_z+pitch*.40),(leaf-.065,-.027,center_z+pitch*.40),
                (leaf-.065,.027,center_z-pitch*.40),(.065,.027,center_z-pitch*.40)]
        facade.batch.face([transform(point) for point in points],trim,flip)
    for offset in (-height*.33,height*.33):
        facade.box(hinge,.075,z+offset,.045,.065,.16,'iron')


def window(facade, item, trim, warm=False, shutters=None):
    u,z,width,height = (item[key] for key in ('u','z','w','h'))
    # A closed, dark back and a recessed reflective pane: no see-through shell.
    facade.rectangle(u,z,width-.015,height-.015,-.265,'WindowRecess')
    # Four panes have tiny spacing, making the crossbars and reflection readable.
    for side in (-1,1):
        for level in (-1,1):
            pane_u=u+side*(width-.15)/4
            pane_z=z+level*(height-.15)/4
            pane='WindowWarm' if warm and (side<0 or level<0) else 'WindowPane'
            facade.rectangle(pane_u,pane_z,(width-.15)/2-.015,(height-.15)/2-.015,-.15,pane)
    for side in (-1,1):
        facade.box(u+side*(width/2-.035),-.075,z,.07,.115,height,trim)
        facade.box(u,-.075,z+side*(height/2-.035),width-.14,.115,.07,trim)
    facade.box(u,-.07,z,.035,.095,height-.13,trim)
    facade.box(u,-.067,z,width-.13,.095,.035,trim)
    # Stone sill and a slim weathered lintel sit proud of the reveal, not black slabs.
    facade.box(u,.075,z-height/2-.065,width+.28,.31,.12,'stone_light')
    facade.box(u,.035,z+height/2+.055,width+.18,.15,.09,'stone_light')
    if warm:
        # Narrow opaque linen edges only; not an invented enterable room.
        for side in (-1,1):
            facade.rectangle(u+side*(width*.31),z,.10,height-.19,-.139,'WindowCurtain')
    if shutters:
        shutter(facade,u,z,width,height,-1,shutters[0],trim)
        shutter(facade,u,z,width,height,1,shutters[1],trim)


def door(facade, item, trim):
    u,z,width,height = (item[key] for key in ('u','z','w','h'))
    facade.box(u,-.115,z,width-.04,.12,height-.025,trim)
    for side in (-1,1):
        facade.box(u+side*(width/2+.04),.03,z,.10,.18,height+.13,'stone_light')
    facade.box(u,.025,z+height/2+.075,width+.29,.20,.14,'stone_light')
    facade.box(u,.10,z-height/2+.015,width+.24,.38,.07,'stone')
    for side in (-1,1):
        facade.box(u+side*(width/2-.07),-.015,z,.075,.055,height-.10,'WeatheredWood')
    for panel_z,panel_h in ((z-height*.24,height*.33),(z+height*.20,height*.40)):
        facade.box(u,-.045,panel_z,width-.22,.045,panel_h,'WindowRecess')
        for side in (-1,1):
            facade.box(u+side*(width/2-.12),-.005,panel_z,.045,.045,panel_h+.07,trim)
            facade.box(u,-.005,panel_z+side*(panel_h/2+.015),width-.24,.045,.045,trim)
    facade.box(u+width*.30,.025,z-.06,.045,.045,.16,'iron')
    facade.box(u+width*.245,.065,z-.045,.14,.045,.035,'iron')


def build():
    if bpy.data.collections.get(GROUP) and bpy.data.collections[GROUP].objects:
        raise RuntimeError('SPACE03 facade module has already been applied.')
    missing=[name for name in ALLOWED_HIDDEN if not bpy.data.objects.get(name)]
    if missing:
        raise RuntimeError('Missing expected opposite-house objects: '+', '.join(missing))
    original_names=set(bpy.data.objects.keys())
    material_names_before=set(bpy.data.materials.keys())
    materials={name:bpy.data.materials[name] for name in ('plaster','plaster_alt','stone','stone_light','iron')}
    materials.update({
        'WeatheredWood':new_material('WeatheredWood','957153',.59),
        'FadedTeal':new_material('FadedTeal','577b78',.57),
        'WindowPane':new_material('WindowPane','526a70',.19,.18),
        'WindowWarm':new_material('WindowWarm','8f7651',.28,.05,('b89662',.12)),
        'WindowRecess':new_material('WindowRecess','2b2824',.88),
        'WindowCurtain':new_material('WindowCurtain','b3a38a',.89),
    })
    houses=[]
    for house_index,spec in enumerate(HOUSE_SPECS,1):
        x,width=spec['center_x'],spec['width']
        eaves=GROUND+spec['height']-1.15
        upper_z=eaves-.99
        upper_height=min(1.30,(eaves-GROUND)*.30)
        trim='FadedTeal' if house_index==2 else 'WeatheredWood'
        walls=Batch(PREFIX+f'Opposite_{house_index:02d}_RecessedWalls',materials)
        details=Batch(PREFIX+f'Opposite_{house_index:02d}_WindowDoorJoinery',materials)
        front=[]
        for offset in (-width*.265,width*.265):
            front.extend([{'u':offset,'z':upper_z,'w':.86,'h':upper_height,'level':'upper'},
                          {'u':offset,'z':GROUND+1.05,'w':.78,'h':1.02,'level':'lower'}])
        front.append({'u':0,'z':GROUND+.95,'w':.86,'h':1.85,'door':True})
        rear=[{'u':offset,'z':upper_z,'w':.78,'h':1.10} for offset in (-width*.265,width*.265)]
        rear.append({'u':.45,'z':GROUND+.91,'w':.79,'h':1.77,'door':True})
        sides=[{'u':0,'z':value,'w':.90,'h':1.07} for value in (GROUND+1.10,upper_z)]
        faces=[('front','Y',FRONT,x,1,width,front),('rear','Y',BACK,x,-1,width,rear),
               ('left','X',x-width/2,(FRONT+BACK)/2,-1,5.,sides),
               ('right','X',x+width/2,(FRONT+BACK)/2,1,5.,sides)]
        for label,axis,plane,center,direction,span,openings in faces:
            wall(Facade(walls,axis,plane,center,direction),span,eaves,openings,spec['wall'])
            facade=Facade(details,axis,plane,center,direction)
            for item in openings:
                if item.get('door'):
                    door(facade,item,trim)
                    continue
                warm=(label=='front' and item.get('level')=='upper' and
                      ((house_index==1 and item['u']<0) or (house_index==3 and item['u']>0)))
                opening_angles=None
                if label=='front' and item.get('level')=='upper':
                    opening_angles=((18,37),(12,61),(28,15))[house_index-1]
                    if item['u']>0:
                        opening_angles=tuple(reversed(opening_angles))
                window(facade,item,trim,warm,opening_angles)
            if (house_index,label) in ((1,'left'),(3,'right')):
                # Two small existing-wall repairs; no decorative scatter.
                for row in range(3):
                    for column in range(3-row//2):
                        patch_u=-1.25+column*.36+(row%2)*.12
                        facade.box(patch_u,.012,1.27+row*.205,.34,.035,.18,'stone')
        created=[walls.finish(),details.finish()]
        for suffix in ('ClosedShell','OpaqueWindowDoorDetails'):
            original=bpy.data.objects[f'EXT_Opposite_{house_index:02d}_{suffix}']
            original.hide_render=True
            original.hide_viewport=True
        coords=[obj.matrix_world@Vector(point) for obj in created for point in obj.bound_box]
        houses.append({'id':house_index,'footprint':[x-width/2,BACK,x+width/2,FRONT],
                       'eaves_z':eaves,'new_bounds':{'min':[min(v[a] for v in coords) for a in range(3)],
                                                  'max':[max(v[a] for v in coords) for a in range(3)]},
                       'windows':10,'closed_doors':2,'warm_windows':1 if house_index in (1,3) else 0,
                       'recess_depth_metres':.28,'enterable':False})
    created=[obj for obj in bpy.data.objects if obj.name not in original_names]
    triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in created)
    if triangles>8500:
        raise RuntimeError(f'Facade geometry exceeds 8500 triangle budget: {triangles}')
    return {'objects':[obj.name for obj in created],'object_count':len(created),
            'materials':sorted(set(bpy.data.materials.keys())-material_names_before),
            'triangles':triangles,'allowed_original_changes':{name:['hide_render','hide_viewport'] for name in ALLOWED_HIDDEN},
            'houses':houses,'collections':[GROUP],
            'web_material_aliases':{PREFIX+'WeatheredWood':'wood',PREFIX+'FadedTeal':'teal'},
            'web_window_materials':{'pane':[PREFIX+'WindowPane'],'warm':[PREFIX+'WindowWarm'],
                                    'recess':[PREFIX+'WindowRecess'],'curtain':[PREFIX+'WindowCurtain']},
            'material_web_special':{PREFIX+'WindowPane':{'opaque':True,'roughness':.19,'metalness':.18},
                                    PREFIX+'WindowWarm':{'opaque':True,'roughness':.28,'low_emission':.12},
                                    PREFIX+'WindowRecess':{'opaque':True},PREFIX+'WindowCurtain':{'opaque':True}},
            'scope':'Three original opposite-house exterior facades only; source shells and old opaque panels preserved but hidden; no new accessible interiors, lights, roofs or props.'}
