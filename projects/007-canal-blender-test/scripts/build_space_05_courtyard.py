"""Open one existing gap into a small, continuously supported back courtyard.

Only two explicitly permitted old mesh pointers change. New construction is
SPACE05_ geometry; no save, export, lights, houses or unrelated props.
"""
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from scene_utils import mesh

PREFIX='SPACE05_'
GROUP=PREFIX+'Courtyard'
COURT_BATCH='SPACE01_Opposite row courtyard boundaries'
REAR_WALL='EXT_Opposite rear boundary'
ALLOWED=(COURT_BATCH,REAR_WALL)
OPENING=(-7.97,-6.13)
FLOOR=.855
RAMP_START=-15.6853
RAMP_END=-16.05
COURT=(-12.2,-26.0,-6.1,-22.45)
ROUTE=[[-7.05,-12.65],[-7.05,-17.1],[-7.05,-23.35],[-10.95,-23.35],
       [-10.95,-24.95],[-7.05,-24.95],[-7.05,-23.35],[-7.05,-17.1],[-7.05,-12.65]]
NAV_ZONES=[
    {'id':'courtyard-street-connector','x':[-7.95,-6.15],'blender_y':[-16.7,-15.15]},
    {'id':'courtyard-side-alley','x':[-7.95,-6.25],'blender_y':[-23.45,-16.3]},
    {'id':'courtyard-small-court','x':[-11.95,-6.35],'blender_y':[-25.6,-22.8]},
]


def ground_height(y):
    return .85+.005*max(0.,min(1.,(RAMP_START-y)/(RAMP_START-RAMP_END)))


class Batch:
    def __init__(self):
        self.vertices=[];self.faces=[];self.indices=[];self.names=[]

    def add(self,vertices,faces,material):
        if material not in self.names:self.names.append(material)
        offset=len(self.vertices)
        self.vertices.extend(tuple(p) for p in vertices)
        self.faces.extend(tuple(offset+i for i in f) for f in faces)
        self.indices.extend([self.names.index(material)]*len(faces))

    def box_bounds(self,bounds,material):
        x0,y0,z0,x1,y1,z1=bounds
        points=[(x,y,z) for x in (x0,x1) for y in (y0,y1) for z in (z0,z1)]
        self.add(points,[(0,2,6,4),(1,5,7,3),(0,4,5,1),(2,3,7,6),(0,1,3,2),(4,6,7,5)],material)

    def box(self,center,size,material):
        self.box_bounds(tuple(center[i]-size[i]/2 for i in range(3))+tuple(center[i]+size[i]/2 for i in range(3)),material)

    def paving_stone(self,x0,y0,x1,y1,material):
        # A shallow physical chamfer, not a bevel modifier. The prior support
        # remains underneath; 5mm lift avoids coincident top faces in the alley.
        inset=.006
        outer=[(x0,y0),(x1,y0),(x1,y1),(x0,y1)]
        inner=[(x0+inset,y0+inset),(x1-inset,y0+inset),(x1-inset,y1-inset),(x0+inset,y1-inset)]
        points=[(x,y,.803) for x,y in outer]
        points.extend((x,y,ground_height(y)-.003) for x,y in outer)
        points.extend((x,y,ground_height(y)) for x,y in inner)
        faces=[(3,2,1,0),(8,9,10,11)]
        for i in range(4):
            j=(i+1)%4
            faces.append((i,j,4+j,4+i))
            faces.append((4+i,4+j,8+j,8+i))
        self.add(points,faces,material)

    def finish(self,name):
        return mesh(PREFIX+name,self.vertices,self.faces,[bpy.data.materials[n] for n in self.names],GROUP,self.indices)


def _world_bounds(obj):
    points=[obj.matrix_world@Vector(p) for p in obj.bound_box]
    return {'min':[min(p[a] for p in points) for a in range(3)],
            'max':[max(p[a] for p in points) for a in range(3)]}


def _component_hash(data,vertex_indices,polygon_indices):
    index_map={old:i for i,old in enumerate(vertex_indices)}
    payload={'vertices':[tuple(data.vertices[i].co) for i in vertex_indices],
             'faces':[(tuple(index_map[v] for v in data.polygons[i].vertices),
                       data.polygons[i].material_index,data.polygons[i].use_smooth) for i in polygon_indices]}
    return hashlib.sha256(json.dumps(payload,separators=(',',':')).encode()).hexdigest()


def _open_existing_gate_batch():
    obj=bpy.data.objects[COURT_BATCH];old=obj.data
    if len(old.vertices)!=304 or len(old.polygons)!=228:
        raise RuntimeError('Courtyard batch differs from the audited 38-box source.')
    deleted=[];retained_hashes=[]
    for component in range(38):
        vertices=list(range(component*8,component*8+8))
        polygons=list(range(component*6,component*6+6))
        if not all(set(old.polygons[i].vertices).issubset(vertices) for i in polygons):
            raise RuntimeError('Source courtyard batch connectivity is not the audited box layout.')
        if component<13:
            points=[obj.matrix_world@old.vertices[i].co for i in vertices]
            deleted.append({'component':component,'source_vertices':vertices,'source_polygons':polygons,
                            'material':old.materials[old.polygons[polygons[0]].material_index].name,
                            'bounds':{'min':[min(p[a] for p in points) for a in range(3)],
                                      'max':[max(p[a] for p in points) for a in range(3)]}})
        else:retained_hashes.append(_component_hash(old,vertices,polygons))
    data=bpy.data.meshes.new(PREFIX+'OpenedSelectedOldCourtyardGateBatch')
    data.from_pydata([tuple(v.co) for v in old.vertices[104:]],[],
                     [tuple(i-104 for i in f.vertices) for f in old.polygons[78:]])
    for material in old.materials:data.materials.append(material)
    for new,original in zip(data.polygons,old.polygons[78:]):
        new.material_index=original.material_index;new.use_smooth=original.use_smooth
    data.update()
    after_hashes=[_component_hash(data,list(range(i*8,i*8+8)),list(range(i*6,i*6+6))) for i in range(25)]
    if retained_hashes!=after_hashes:raise RuntimeError('A retained original courtyard component changed.')
    obj.data=data
    return {'object':obj.name,'old_mesh':old.name,'new_mesh':data.name,
            'deleted_components':deleted,'retained_components':25,
            'retained_component_hashes':retained_hashes,'retained_components_identical':True}


def _open_rear_wall():
    obj=bpy.data.objects[REAR_WALL];old=obj.data
    if len(old.vertices)!=8 or len(old.polygons)!=6:
        raise RuntimeError('The original rear wall is no longer the audited box.')
    if any(abs(obj.matrix_world[r][c]-float(r==c))>1e-7 for r in range(3) for c in range(3)):
        raise RuntimeError('Unexpected rear-wall transform.')
    minimum=[min(v.co[a] for v in old.vertices) for a in range(3)]
    maximum=[max(v.co[a] for v in old.vertices) for a in range(3)]
    cut=[x-obj.matrix_world.translation.x for x in OPENING]
    batch=Batch()
    material_name=old.materials[0].name
    for left,right in ((minimum[0],cut[0]),(cut[1],maximum[0])):
        batch.box_bounds((left,minimum[1],minimum[2],right,maximum[1],maximum[2]),material_name)
    data=bpy.data.meshes.new(PREFIX+'RearBoundaryWithSelectedPassage')
    data.from_pydata(batch.vertices,[],batch.faces)
    for material in old.materials:data.materials.append(material)
    data.update();obj.data=data
    return {'object':obj.name,'old_mesh':old.name,'new_mesh':data.name,
            'opening_world_x':list(OPENING),'opening_width':OPENING[1]-OPENING[0],
            'opening_to_wall_top':True,'old_local_bounds':[minimum,maximum],
            'transform_material_slots_and_modifiers_preserved':True}


def _paving():
    support=Batch();stones=Batch()
    # Court support ends precisely against the retained old apron. The
    # original side-alley floor remains and supports the new shallow surface.
    source=bpy.data.objects['EXT_B02_OppositeBuildingsContinuousSupport']
    join=min((source.matrix_world@v.co).y for v in source.data.vertices)
    quay=bpy.data.objects['Individually worn wet quay paving']
    quay_back_edge=min((quay.matrix_world@v.co).y for v in quay.data.vertices)
    support.box_bounds((COURT[0],COURT[1],.66,COURT[2],join,.850),'paving')
    support.box_bounds((-8.12,join,.81,-5.98,quay_back_edge,.848),'paving')
    regions=[(-8.12,-5.98,join,quay_back_edge),
             (COURT[0],COURT[2],COURT[1],join)]
    count=0
    for region,(left,right,bottom,top) in enumerate(regions):
        if region==0:
            divisions=max(1,math.ceil((RAMP_END-bottom)/.54))
            ys=[bottom+(RAMP_END-bottom)*i/divisions for i in range(divisions+1)]+[RAMP_START,top]
        else:
            divisions=math.ceil((top-bottom)/.54)
            ys=[bottom+(top-bottom)*i/divisions for i in range(divisions+1)]
        for row,(low,high) in enumerate(zip(ys[:-1],ys[1:])):
            pitch=.61
            offset=(row%2)*pitch*.5
            first=math.floor((left-offset)/pitch)
            last=math.ceil((right-offset)/pitch)
            for column in range(first,last):
                x0=max(left,column*pitch+offset)+.004
                x1=min(right,(column+1)*pitch+offset)-.004
                if x1-x0<.03:continue
                material='paving_alt' if (column*7+row*11+region*3)%11==0 else 'paving'
                stones.paving_stone(x0,low+.004,x1,high-.004,material);count+=1
    return [support.finish('CourtAndPassageSolidSupport'),stones.finish('CourtAndPassageLaidStone')],{
        'court_slab_xy':[COURT[0],COURT[1],COURT[2],join],
        'passage_surface_xy':[-8.12,join,-5.98,quay_back_edge],
        'stone_count':count,'top_height':FLOOR,'source_support_join_y':join,
        'ramp':{'start_y':RAMP_START,'end_y':RAMP_END,'start_z':.85,'end_z':FLOOR,'interpolation':'linear'},
        'flat_quay_edge_connection_y':[RAMP_START,quay_back_edge],
        'coplanar_existing_paving_overlay':False,
        'original_apron_retained_below_new_surface':True,
    }


def _enclosure():
    batch=Batch()
    # Existing front and back walls provide enclosure. Only the left/right
    # returns are new, so the court does not acquire doubled parallel walls.
    for x in (-12.2,-6.1):
        batch.box_bounds((x-.09,-26.0,.835,x+.09,-22.45,1.95),'plaster_alt')
        batch.box_bounds((x-.13,-26.0,.66,x+.13,-22.45,.985),'stone')
        batch.box_bounds((x-.13,-26.0,1.95,x+.13,-22.45,2.04),'roof')
    # A little cap protects each newly exposed cut end of the old front wall.
    for left,right in ((-8.12,-7.97),(-6.13,-5.98)):
        batch.box_bounds((left,-22.50,2.05,right,-22.20,2.105),'roof')
    return batch.finish('CourtyardSideReturnsAndCoping')


def _entrance():
    batch=Batch()
    low=FLOOR;clear_height=2.15;header_bottom=low+clear_height
    for left,right in ((-8.15,-7.97),(-6.13,-5.95)):
        # Piers have no projecting foot that could silently narrow the gate.
        batch.box_bounds((left,-16.63,.83,right,-16.33,header_bottom),'stone_light')
        for z in (1.10,1.68,2.26):
            batch.box_bounds((left+.002,-16.635,z,right-.002,-16.325,z+.012),'stone')
    batch.box_bounds((-8.15,-16.635,header_bottom,-5.95,-16.325,header_bottom+.16),'wood')
    batch.box_bounds((-8.19,-16.70,header_bottom+.16,-5.91,-16.26,header_bottom+.225),'roof')
    return batch.finish('OpenLaneEntranceFrame'),{
        'center_xy':[-7.05,-16.48],'net_width':OPENING[1]-OPENING[0],
        'net_height_above_new_paving':clear_height,'opening_x':list(OPENING),
        'header_bottom_z':header_bottom,'old_gate_removed':True,'no_door_leaf_or_new_light':True,
    }


def _drainage():
    batch=Batch()
    # One narrow flush drain at the side of the existing alley, outside its
    # navigation strip. It explains runoff without filling the court with props.
    batch.box_bounds((-6.115,-21.90,.838,-6.025,-17.00,.851),'iron')
    for index in range(35):
        y=-21.87+index*(4.84/34)
        batch.box_bounds((-6.115,y-.014,.851,-6.025,y+.014,.857),'stone')
    return batch.finish('PassageSideDrain')


def build():
    if bpy.data.collections.get(GROUP):raise RuntimeError('SPACE05 courtyard already exists.')
    before={o.name:(o.data.as_pointer() if o.data else None,tuple(tuple(r) for r in o.matrix_world),
                   tuple(c.name for c in o.users_collection),o.hide_render,o.hide_viewport)
            for o in bpy.data.objects}
    modifications=[_open_existing_gate_batch(),_open_rear_wall()]
    additions,paving=_paving()
    additions.append(_enclosure())
    entrance,entrance_info=_entrance();additions.append(entrance)
    additions.append(_drainage())
    bpy.context.view_layer.update()
    for name,state in before.items():
        obj=bpy.data.objects[name]
        actual=(obj.data.as_pointer() if obj.data else None,tuple(tuple(r) for r in obj.matrix_world),
                tuple(c.name for c in obj.users_collection),obj.hide_render,obj.hide_viewport)
        if name not in ALLOWED and state!=actual:raise RuntimeError('Unapproved old-object change: '+name)
        if name in ALLOWED and state[1:]!=actual[1:]:raise RuntimeError('Only data may change: '+name)
    triangles=0
    for obj in additions:obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
    if triangles>6500:raise RuntimeError(f'New courtyard triangle budget exceeded: {triangles}')
    return {'scope':'One existing riverside gap opened into one small rear court; no further scene expansion.',
            'modified_source_objects':list(ALLOWED),'allowed_modified_fields':['data'],
            'source_modifications':modifications,
            'added_objects':{o.name:_world_bounds(o) for o in additions},
            'added_collection':GROUP,'added_triangles':triangles,'added_object_count':len(additions),
            'new_lights':0,'new_materials':0,'entrance':entrance_info,'paving':paving,
            'court_physical_clear_xy':[-12.07,-25.86,-6.23,-22.47],
            'court_clear_area_approx_square_metres':(12.07-6.23)*(25.86-22.47),
            'front_and_rear_walls_reused':[REAR_WALL,'SPACE01_Backland garden compartments'],
            'navigation_zones_blender':NAV_ZONES,'suggested_return_route_blender_xy':ROUTE,
            'sill_projection_limits_x':[-7.97,-6.13],
            'all_other_source_object_state_preserved':True,'saved_or_exported':False,
            'limits':['No house interiors opened.','The route enters and returns through the same alley.',
                      'Original navigation remains; only the named connector, alley and court are added.']}
