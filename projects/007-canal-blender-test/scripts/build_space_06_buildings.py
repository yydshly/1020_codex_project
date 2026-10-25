"""Build the finite SPACE06 neighbourhood from the shared footprint layout.

Seventeen complete exterior houses, with medium-detail roof and joinery meshes.
Only new SPACE06_ objects, collections, meshes and materials are created.
No existing scene data, geometry, light, save file or export is changed.
"""
import json
import math
from pathlib import Path
import random

import bpy
from mathutils import Vector

from scene_utils import mesh, rgb
from refine_space_03_facades import Batch as BasicBatch, Facade

ROOT=Path(__file__).resolve().parents[1]
PREFIX='SPACE06_'
GROUP=PREFIX+'NeighbourhoodBuildings'
TRIANGLE_LIMIT=65000


class Batch(BasicBatch):
    def global_box(self,center,size,material):
        self.box(center,size,material,lambda point:point)

    def finish(self):
        result=mesh(self.name,self.vertices,self.faces,
                    [self.materials[name] for name in self.names],GROUP,self.indices)
        result['exterior_only']=True
        result['enterable']=False
        return result


def material(name,colour,roughness,metallic=0,emission=None):
    full=PREFIX+name
    if bpy.data.materials.get(full):
        raise RuntimeError('New building material already exists: '+full)
    result=bpy.data.materials.new(full)
    result.use_nodes=True
    principled=result.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value=rgb(colour)
    principled.inputs['Roughness'].default_value=roughness
    principled.inputs['Metallic'].default_value=metallic
    if emission:
        principled.inputs['Emission Color'].default_value=rgb(emission[0])
        principled.inputs['Emission Strength'].default_value=emission[1]
    result.diffuse_color=rgb(colour)
    return result


def wall(facade,width,base,eaves,openings,plaster):
    holes=[(o['u']-o['w']/2,o['z']-o['h']/2,o['u']+o['w']/2,o['z']+o['h']/2) for o in openings]
    us=sorted(set([-width/2,width/2]+[x for h in holes for x in (h[0],h[2])]))
    zs=sorted(set([base,eaves]+[z for h in holes for z in (h[1],h[3])]))
    for left,right in zip(us[:-1],us[1:]):
        for bottom,top in zip(zs[:-1],zs[1:]):
            u,z=(left+right)/2,(bottom+top)/2
            if any(a<u<c and b<z<d for a,b,c,d in holes):continue
            facade.rectangle(u,z,right-left,top-bottom,0,plaster)
            facade.face([(left,-.26,bottom),(right,-.26,bottom),
                         (right,-.26,top),(left,-.26,top)],plaster)
    for index,(left,bottom,right,top) in enumerate([(-width/2,base,width/2,eaves)]+holes):
        loop=[(left,bottom),(right,bottom),(right,top),(left,top)]
        for (u,z),(v,w) in zip(loop,loop[1:]+loop[:1]):
            facade.face([(u,0,z),(v,0,w),(v,-.26,w),(u,-.26,z)],plaster,reverse=index>0)
    # A perimeter plinth with actual door breaks, avoiding the former 30cm
    # continuous footing that obscured the lower panels of the old doors.
    cuts=[(-width/2,width/2)]
    for item in openings:
        if not item.get('door'):continue
        left,right=item['u']-item['w']/2-.03,item['u']+item['w']/2+.03
        cuts=[piece for a,b in cuts for piece in ((a,min(b,left)),(max(a,right),b)) if piece[1]>piece[0]+.001]
    for left,right in cuts:
        facade.box((left+right)/2,.015,base+.135,right-left,.13,.27,'stone')


def window(facade,item,trim,warm=False,shutters=False,angle=20):
    u,z,w,h=(item[key] for key in ('u','z','w','h'))
    facade.rectangle(u,z,w-.01,h-.01,-.245,'WindowBack')
    # Real shallow linen pieces are behind the panes, independent of the old
    # SPACE04 coordinate-specific shaders for the original three houses.
    if item.get('curtains'):
        for side in (-1,1):
            facade.rectangle(u+side*w*.32,z,.105,h-.16,-.175,'Linen')
    for side in (-1,1):
        for level in (-1,1):
            facade.rectangle(u+side*(w-.14)/4,z+level*(h-.14)/4,
                             (w-.14)/2-.012,(h-.14)/2-.012,-.12,'WindowWarm' if warm else 'WindowPane')
    for side in (-1,1):
        facade.box(u+side*(w/2-.032),-.06,z,.064,.11,h,trim)
        facade.box(u,-.06,z+side*(h/2-.032),w-.128,.11,.064,trim)
    facade.box(u,-.043,z,.035,.075,h-.13,trim)
    facade.box(u,-.04,z,w-.13,.075,.035,trim)
    facade.box(u,.055,z-h/2-.055,w+.20,.28,.10,'stone_light')
    facade.box(u,.025,z+h/2+.045,w+.13,.13,.075,'stone')
    if shutters:
        for side in (-1,1):
            theta=math.radians(angle if side<0 else min(30,angle+7))
            leaf=min(.46,w*.5)
            hinge=u+side*(w/2+.06)
            def transform(point):
                s,d,zz=point
                return facade.world((hinge+side*(s*math.cos(theta)-d*math.sin(theta)),
                                     .055+s*math.sin(theta)+d*math.cos(theta),zz))
            flip=facade.reverse != (side<0)
            for center,size in [((.03,0,z),(.06,.048,h)),((leaf-.03,0,z),(.06,.048,h)),
                                ((leaf/2,0,z-h/2+.03),(leaf,.048,.06)),
                                ((leaf/2,0,z+h/2-.03),(leaf,.048,.06))]:
                facade.batch.box(center,size,trim,transform,flip)
            for row in range(6):
                zz=z-h/2+.10+(row+.5)*(h-.20)/6
                points=[(.055,-.023,zz+.055),(leaf-.055,-.023,zz+.055),
                        (leaf-.055,.023,zz-.055),(.055,.023,zz-.055)]
                facade.batch.face([transform(point) for point in points],trim,flip)


def door(facade,item,trim,base):
    u,z,w,h=(item[key] for key in ('u','z','w','h'))
    facade.box(u,-.10,z,w-.025,.12,h-.025,trim)
    for side in (-1,1):
        facade.box(u+side*(w/2+.035),.025,z,.08,.15,h+.07,'stone_light')
    facade.box(u,.025,z+h/2+.055,w+.24,.17,.11,'stone_light')
    facade.box(u,.06,base+.0375,w+.16,.30,.075,'stone')
    for panel_z,panel_h in ((z-h*.24,h*.32),(z+h*.20,h*.40)):
        facade.box(u,-.025,panel_z,w-.21,.04,panel_h,'DoorInset')
        for side in (-1,1):
            facade.box(u+side*(w/2-.11),.003,panel_z,.037,.032,panel_h+.05,trim)
            facade.box(u,.003,panel_z+side*(panel_h/2+.012),w-.22,.032,.037,trim)
    facade.box(u+w*.29,.04,z-.04,.035,.05,.15,'iron')
    facade.box(u+w*.24,.075,z-.035,.13,.04,.03,'iron')


def roof(batch,x,y,width,depth,eaves,ridge,plaster,rng):
    left,right=x-width/2-.22,x+width/2+.22
    near,far=y-depth/2-.23,y+depth/2+.23
    # Closed roof wedge and real eave thickness, with plastered end gables.
    v=[(left,near,eaves),(right,near,eaves),(left,far,eaves),(right,far,eaves),
       (left,y,ridge),(right,y,ridge)]
    for face in ((0,4,5,1),(2,3,5,4)):
        batch.face([v[i] for i in face],'roof',reverse=True)
    batch.face([v[i] for i in (0,1,3,2)],'roof',reverse=True)
    for side_x in (x-width/2,x+width/2):
        batch.face([(side_x,y-depth/2,eaves),(side_x,y+depth/2,eaves),(side_x,y,ridge-.03)],plaster,
                   reverse=side_x<x)
    for edge_y in (near,far):
        batch.global_box((x,edge_y,eaves-.075),(width+.44,.14,.15),'roof')
        batch.global_box((x,edge_y,eaves-.17),(width+.25,.105,.08),'wood')
    columns,rows=10,4
    tile_width=(right-left)/columns
    for side in (-1,1):
        run=(depth/2+.23)
        for row in range(rows):
            a=row*run/rows
            b=min(run,(row+1)*run/rows+.045)
            shift=tile_width*.5 if row%2 else 0
            for col in range(-1 if shift else 0,columns):
                l=max(left,left+col*tile_width+shift+.008)
                r=min(right,left+(col+1)*tile_width+shift-.008)
                if r-l<.08:continue
                lift=.009+rng.random()*.006
                za=ridge-(ridge-eaves)*a/run+lift
                zb=ridge-(ridge-eaves)*b/run+lift
                points=[(l,y+side*a,za),(r,y+side*a,za),(r,y+side*b,zb),(l,y+side*b,zb)]
                mat='roof_alt' if rng.random()<.075 else 'roof'
                batch.face(points,mat,reverse=side<0)
                batch.face([(l,y+side*b,zb),(r,y+side*b,zb),
                            (r,y+side*b,zb-.024),(l,y+side*b,zb-.024)],mat,reverse=side<0)
    # One low-cost rounded ridge profile rather than hundreds of copied caps.
    profile=[(math.cos(a*math.pi/6)*.085,math.sin(a*math.pi/6)*.085) for a in range(7)]
    for a,b in zip(profile[:-1],profile[1:]):
        batch.face([(left,y+a[0],ridge+a[1]),(right,y+a[0],ridge+a[1]),
                    (right,y+b[0],ridge+b[1]),(left,y+b[0],ridge+b[1])],'roof',reverse=True)
    for end,reverse in ((left,True),(right,False)):
        batch.face([(end,y+d,ridge+z) for d,z in profile],'roof',reverse)


def bounds(objects):
    points=[obj.matrix_world@Vector(point) for obj in objects for point in obj.bound_box]
    return {'min':[min(point[i] for point in points) for i in range(3)],
            'max':[max(point[i] for point in points) for i in range(3)]}


def build():
    layout=json.loads((ROOT/'assets/space-06-layout.json').read_text(encoding='utf-8-sig'))
    if bpy.data.collections.get(GROUP):raise RuntimeError('SPACE06 buildings already exist.')
    base=layout['road_top']
    before=set(bpy.data.objects.keys())
    material_before=set(bpy.data.materials.keys())
    materials={name:bpy.data.materials[name] for name in ('plaster','plaster_alt','stone','stone_light','roof','roof_alt','wood','iron')}
    materials['WeatheredWood']=bpy.data.materials['SPACE03_WeatheredWood']
    materials['FadedTeal']=bpy.data.materials['SPACE03_FadedTeal']
    materials.update({
        'WarmGrey':material('WarmGreyPlaster','c9c6b4',.87),
        'SoftOchre':material('SoftOchrePlaster','b5aa92',.88),
        'SagePaint':material('SagePaint','73816a',.64),
        'BluePaint':material('BluePaint','657a84',.62),
        'DoorInset':material('DoorInset','76533b',.66),
        'WindowPane':material('WindowPane','879391',.13),
        'WindowBack':material('WindowBack','414842',.90),
        'WindowWarm':material('WindowWarm','9f8865',.25,0,('c5a06a',.075)),
        'Linen':material('Linen','bbb2a0',.91),
    })
    summaries=[]
    for index,spec in enumerate(layout['building_footprints']):
        x,y=spec['center'];width,depth=spec['width'],spec['depth']
        direction=spec['facade_direction_y']
        ridge=base+spec['height_to_ridge']
        eaves=ridge-(1.04 if index%3 else 1.16)
        plaster=('plaster','WarmGrey','plaster_alt','SoftOchre')[index%4]
        trim=('WeatheredWood','FadedTeal','WeatheredWood','SagePaint','BluePaint')[index%5]
        rng=random.Random(6027+index*97)
        walls=Batch(PREFIX+spec['id']+'_WallsAndPlinth',materials)
        joinery=Batch(PREFIX+spec['id']+'_WindowsAndDoors',materials)
        roofing=Batch(PREFIX+spec['id']+'_RoofAndEaves',materials)
        upper=eaves-.99
        window_width=(.88,.96,1.02)[index%3]
        upper_height=(1.24,1.34,1.29)[index%3]
        front=[]
        for side in (-1,1):
            front.extend([{'u':side*width*.265,'z':upper,'w':window_width,'h':upper_height,'upper':True,'curtains':True},
                          {'u':side*width*.265,'z':base+1.24,'w':window_width-.07,'h':1.14,'curtains':index%2==0}])
        front.append({'u':(-.12,0,.16)[index%3],'z':base+1.015,'w':.94,'h':2.0,'door':True})
        rear=[{'u':side*width*.26,'z':upper,'w':.80,'h':1.08,'curtains':side<0} for side in (-1,1)]
        rear.append({'u':.32 if index%2 else -.28,'z':base+.965,'w':.83,'h':1.90,'door':True})
        sides=[{'u':0,'z':upper,'w':.83,'h':1.12,'curtains':True}]
        front_y=y+direction*depth/2;rear_y=y-direction*depth/2
        faces=[('front','Y',front_y,x,direction,width,front),
               ('rear','Y',rear_y,x,-direction,width,rear),
               ('left','X',x-width/2,y,-1,depth,sides),
               ('right','X',x+width/2,y,1,depth,sides)]
        total_windows=0;warm_count=0
        for label,axis,plane,center,out,span,openings in faces:
            wall(Facade(walls,axis,plane,center,out),span,base,eaves,openings,plaster)
            facade=Facade(joinery,axis,plane,center,out)
            for opening in openings:
                if opening.get('door'):door(facade,opening,trim,base);continue
                warm=bool(label=='front' and opening.get('upper') and opening['u']<0 and index%4==0)
                with_shutters=label=='front' and opening.get('upper') and (index%3==2 or (index%3==1 and opening['u']<0))
                window(facade,opening,trim,warm,with_shutters,16+index%3*4)
                total_windows+=1;warm_count+=int(warm)
            # A single quiet floor course joins the openings on selected houses.
            if label in ('front','rear') and index%2==0:
                facade.box(0,.025,base+2.50,span,.10,.075,'stone')
        walls.global_box((x,y,base-.025),(width,depth,.05),'stone')
        roof(roofing,x,y,width,depth,eaves,ridge,plaster,rng)
        created=[walls.finish(),joinery.finish(),roofing.finish()]
        for obj in created:
            obj['building_id']=spec['id'];obj['neighbourhood_group']=spec['group']
        bpy.context.view_layer.update()
        actual=bounds(created)
        conflicts=[]
        for road in layout['road_rectangles_xy']:
            a,b,c,d=road['bounds']
            if min(c,actual['max'][0])>max(a,actual['min'][0])+.0001 and min(d,actual['max'][1])>max(b,actual['min'][1])+.0001:
                conflicts.append(road['id'])
        if conflicts:raise RuntimeError(spec['id']+' intersects road envelopes: '+', '.join(conflicts))
        footprint=[x-width/2,y-depth/2,x+width/2,y+depth/2]
        triangle_count=sum(sum(len(face.vertices)-2 for face in obj.data.polygons) for obj in created)
        summaries.append({'id':spec['id'],'group':spec['group'],'footprint':footprint,
                          'facade_direction_y':direction,'base_z':base,'ridge_z':ridge,
                          'eaves_z':eaves,'bounds':actual,'triangles':triangle_count,
                          'windows':total_windows,'warm_windows':warm_count,'closed_doors':2,
                          'plaster':materials[plaster].name,'trim':materials[trim].name,
                          'objects':[obj.name for obj in created],'interiors_enterable':False})
    new_objects=[bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before]
    triangles=sum(item['triangles'] for item in summaries)
    if triangles>TRIANGLE_LIMIT:raise RuntimeError(f'Building triangle budget exceeded: {triangles}')
    return {'building_count':len(summaries),'object_count':len(new_objects),'triangles':triangles,
            'objects':[obj.name for obj in new_objects],'collections':[GROUP],
            'new_materials':sorted(set(bpy.data.materials.keys())-material_before),
            'web_material_aliases':{PREFIX+'WarmGreyPlaster':'plaster',PREFIX+'SoftOchrePlaster':'plaster_alt',
                                    PREFIX+'SagePaint':'olive',PREFIX+'BluePaint':'teal',PREFIX+'DoorInset':'wood'},
            'new_pane_materials':[PREFIX+'WindowPane'],'new_warm_materials':[PREFIX+'WindowWarm'],
            'new_back_materials':[PREFIX+'WindowBack'],'new_curtain_materials':[PREFIX+'Linen'],
            'pane_web_hint':{'metalness':0,'roughness':.13,'transparent':True,'opacity':.42,
                             'explicit_existing_environment':True,'vertex_colours_contain_base_colour_once':True},
            'houses':summaries,'source_objects_modified':False,'source_materials_modified':False,
            'new_lights':0,'layout_source':'assets/space-06-layout.json',
            'scope':'Seventeen grouped, four-sided exterior houses; closed shallow window layers and doors, no enterable rooms or added roads/bridges.'}
