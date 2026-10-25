"""SPACE08 grouped street buildings; additive replacement of background shells.

Caller loads SPACE06. build(layout) only hides the explicitly replaced objects
and adds new meshes/materials. No loading, saving or exporting occurs here.
"""
import math
import random

import bpy
from mathutils import Vector

from scene_utils import mesh
from refine_space_03_facades import Batch as BaseBatch, Facade
from build_space_06_buildings import window as make_window

PREFIX='SPACE08_'
GROUP=PREFIX+'NeighbourhoodBuildings'
TRIANGLE_LIMIT=68000
OLD_PROXIES=('South backland house','South backland offset wing',
             'North backland range','North backland low wing')


def transform_for(spec):
    angle=math.radians(spec.get('yaw_deg',0));c,s=math.cos(angle),math.sin(angle)
    x,y=spec['center']
    def point(p):
        u,v,z=p
        return (x+c*u-s*v,y+s*u+c*v,z)
    def direction(p):
        u,v=p
        return (round(c*u-s*v,9),round(s*u+c*v,9))
    return point,direction


def terrain_triangles():
    """Read the immutable source terrain as world-space triangles."""
    obj=bpy.data.objects['ROAM01_South continuous terrain']
    obj.data.calc_loop_triangles()
    vertices=[obj.matrix_world@vertex.co for vertex in obj.data.vertices]
    result=[]
    for triangle in obj.data.loop_triangles:
        points=[tuple(vertices[index]) for index in triangle.vertices]
        result.append((points,(min(p[0] for p in points),min(p[1] for p in points),
                               max(p[0] for p in points),max(p[1] for p in points))))
    return result


def maximum_terrain_height(triangles,rectangle):
    """Exact maximum of the piecewise linear ground over a sill footprint."""
    left,bottom,right,top=rectangle;clipped_points=[]
    for points,box in triangles:
        if box[2]<left or box[0]>right or box[3]<bottom or box[1]>top:continue
        polygon=list(points)
        for axis,bound,sign in ((0,left,1),(0,right,-1),(1,bottom,1),(1,top,-1)):
            if not polygon:break
            output=[]
            for a,b in zip(polygon,polygon[1:]+polygon[:1]):
                a_in=sign*(a[axis]-bound)>=-1e-9;b_in=sign*(b[axis]-bound)>=-1e-9
                if a_in:output.append(a)
                if a_in!=b_in:
                    t=(bound-a[axis])/(b[axis]-a[axis])
                    output.append(tuple(a[i]+(b[i]-a[i])*t for i in range(3)))
            polygon=output
        clipped_points.extend(polygon)
    if not clipped_points:raise RuntimeError('No original terrain under rear service threshold: '+str(rectangle))
    point=max(clipped_points,key=lambda p:p[2])
    return point[2],list(point)


class Batch(BaseBatch):
    def __init__(self,name,materials,transform):
        super().__init__(name,materials);self.transform=transform

    def face(self,vertices,material,reverse=False):
        super().face([self.transform(point) for point in vertices],material,reverse)

    def local_box(self,center,size,material):
        self.box(center,size,material,lambda point:point)

    def finish(self):
        result=mesh(self.name,self.vertices,self.faces,
                    [self.materials[name] for name in self.names],GROUP,self.indices)
        result['exterior_only']=True;result['enterable']=False
        return result


def new_materials():
    sources={
        'plaster':('Plaster','plaster','plaster'),
        'plaster_alt':('PlasterAlt','plaster_alt','plaster_alt'),
        'WarmGrey':('WarmGreyPlaster','SPACE06_WarmGreyPlaster','plaster'),
        'SoftOchre':('SoftOchrePlaster','SPACE06_SoftOchrePlaster','plaster_alt'),
        'stone':('Stone','stone','stone'),'stone_light':('StoneLight','stone_light','stone_light'),
        'roof':('Roof','roof','roof'),'roof_alt':('RoofAlt','roof_alt','roof_alt'),
        'wood':('Wood','wood','wood'),'iron':('Iron','iron','iron'),
        'WeatheredWood':('WeatheredWood','SPACE03_WeatheredWood','wood'),
        'FadedTeal':('FadedTeal','SPACE03_FadedTeal','teal'),
        'SagePaint':('SagePaint','SPACE06_SagePaint','olive'),
        'BluePaint':('BluePaint','SPACE06_BluePaint','teal'),
        'DoorInset':('DoorInset','SPACE06_DoorInset','wood'),
        'WindowPane':('WindowPane','SPACE06_WindowPane',None),
        'WindowWarm':('WindowWarm','SPACE06_WindowWarm',None),
        'WindowBack':('WindowBack','SPACE06_WindowBack',None),
        'Linen':('Linen','SPACE06_Linen',None),
    }
    materials={};aliases={}
    for key,(suffix,source,alias) in sources.items():
        name=PREFIX+suffix
        if bpy.data.materials.get(name):raise RuntimeError('SPACE08 material already exists: '+name)
        material=bpy.data.materials[source].copy();material.name=name
        materials[key]=material
        if alias:aliases[name]=alias
    return materials,aliases


def wall(facade,width,base,eaves,openings,plaster,party=False):
    if party:
        # No windows, door recesses, projecting plinth or trim on an attached
        # boundary. Flush closed masonry also covers a neighbour's lower roof.
        facade.rectangle(0,(base+eaves)/2,width,eaves-base,0,plaster)
        return
    holes=[(o['u']-o['w']/2,o['z']-o['h']/2,o['u']+o['w']/2,o['z']+o['h']/2) for o in openings]
    us=sorted(set([-width/2,width/2]+[value for h in holes for value in (h[0],h[2])]))
    zs=sorted(set([base,eaves]+[value for h in holes for value in (h[1],h[3])]))
    for left,right in zip(us[:-1],us[1:]):
        for bottom,top in zip(zs[:-1],zs[1:]):
            u,z=(left+right)/2,(bottom+top)/2
            if any(a<u<c and b<z<d for a,b,c,d in holes):continue
            facade.rectangle(u,z,right-left,top-bottom,0,plaster)
            facade.face([(left,-.26,bottom),(right,-.26,bottom),(right,-.26,top),(left,-.26,top)],plaster)
    for index,(left,bottom,right,top) in enumerate([(-width/2,base,width/2,eaves)]+holes):
        loop=[(left,bottom),(right,bottom),(right,top),(left,top)]
        for (u,z),(v,w) in zip(loop,loop[1:]+loop[:1]):
            facade.face([(u,0,z),(v,0,w),(v,-.26,w),(u,-.26,z)],plaster,reverse=index>0)
    cuts=[(-width/2,width/2)]
    for item in openings:
        if not item.get('door'):continue
        left,right=item['u']-item['w']/2-.03,item['u']+item['w']/2+.03
        cuts=[piece for a,b in cuts for piece in ((a,min(b,left)),(max(a,right),b)) if piece[1]>piece[0]+.001]
    for left,right in cuts:
        facade.box((left+right)/2,.015,base+.135,right-left,.13,.27,'stone')


def make_door(facade,item,trim,base):
    """Closed door with a shallow 35mm threshold, including side entries."""
    u,z,w,h=(item[key] for key in ('u','z','w','h'))
    facade.box(u,-.10,z,w-.025,.12,h-.025,trim)
    for side in (-1,1):
        facade.box(u+side*(w/2+.035),.025,z,.08,.15,h+.07,'stone_light')
    facade.box(u,.025,z+h/2+.055,w+.24,.17,.11,'stone_light')
    facade.box(u,.04,base+.0175,w+.16,.24,.035,'stone')
    for panel_z,panel_h in ((z-h*.24,h*.32),(z+h*.20,h*.40)):
        facade.box(u,-.025,panel_z,w-.21,.04,panel_h,'DoorInset')
        for side in (-1,1):
            facade.box(u+side*(w/2-.11),.003,panel_z,.037,.032,panel_h+.05,trim)
            facade.box(u,.003,panel_z+side*(panel_h/2+.012),w-.22,.032,.037,trim)
    facade.box(u+w*.29,.04,z-.04,.035,.05,.15,'iron')
    facade.box(u+w*.24,.075,z-.035,.13,.04,.03,'iron')


def roof(batch,spec,eaves,plaster,seed):
    width,depth=spec['width'],spec['depth'];rise=spec['roof_rise'];ridge=eaves+rise
    party=set(spec.get('party_walls',[]))
    overhang={side:0. if side in party else (.22 if side in ('left','right') else .23)
              for side in ('left','right','front','rear')}
    left,right=-width/2-overhang['left'],width/2+overhang['right']
    front,rear=-depth/2-overhang['front'],depth/2+overhang['rear']
    vertices=[(left,front,eaves),(right,front,eaves),(left,rear,eaves),(right,rear,eaves),
              (left,0,ridge),(right,0,ridge)]
    for face in ((0,4,5,1),(2,3,5,4),(0,1,3,2)):
        batch.face([vertices[i] for i in face],'roof',reverse=True)
    for x in (-width/2,width/2):
        batch.face([(x,-depth/2,eaves),(x,depth/2,eaves),(x,0,ridge-.025)],plaster,reverse=x<0)
    for label,y in (('front',front),('rear',rear)):
        if label in party:continue
        # At a party edge, caps stop on the shared plane rather than extending
        # through the neighbour or leaving a visible double gutter.
        batch.local_box(((left+right)/2,y,eaves-.075),(right-left,.14,.15),'roof')
        batch.local_box(((left+right)/2,y,eaves-.17),(right-left,.105,.08),'wood')
    rng=random.Random(seed);columns=10 if width>=5 else 8;rows=4 if depth>=4.5 else 3
    tile_width=(right-left)/columns
    for side,edge in ((-1,front),(1,rear)):
        run=abs(edge)
        for row in range(rows):
            a=row*run/rows;b=min(run,(row+1)*run/rows+.045)
            shift=tile_width*.5 if row%2 else 0
            for column in range(-1 if shift else 0,columns):
                l=max(left,left+column*tile_width+shift+.008);r=min(right,left+(column+1)*tile_width+shift-.008)
                if r-l<.08:continue
                lift=.009+rng.random()*.006
                za=ridge-rise*a/run+lift;zb=ridge-rise*b/run+lift
                mat='roof_alt' if rng.random()<.06 else 'roof'
                batch.face([(l,side*a,za),(r,side*a,za),(r,side*b,zb),(l,side*b,zb)],mat,reverse=side<0)
                batch.face([(l,side*b,zb),(r,side*b,zb),(r,side*b,zb-.024),(l,side*b,zb-.024)],mat,reverse=side<0)
    profile=[(math.cos(a*math.pi/6)*.075,math.sin(a*math.pi/6)*.075) for a in range(7)]
    for a,b in zip(profile[:-1],profile[1:]):
        batch.face([(left,a[0],ridge+a[1]),(right,a[0],ridge+a[1]),
                    (right,b[0],ridge+b[1]),(left,b[0],ridge+b[1])],'roof',reverse=True)
    for label,end,reverse in (('left',left,True),('right',right,False)):
        if label not in party:batch.face([(end,d,ridge+z) for d,z in profile],'roof',reverse)
    return overhang


def bounds(objects):
    points=[obj.matrix_world@Vector(point) for obj in objects for point in obj.bound_box]
    return {'min':[min(point[i] for point in points) for i in range(3)],
            'max':[max(point[i] for point in points) for i in range(3)]}


def house_spec(raw,default_base):
    spec=dict(raw)
    spec.setdefault('base_z',default_base);spec.setdefault('yaw_deg',0);spec.setdefault('floors',2)
    spec.setdefault('eaves_height',5.4 if spec['floors']==2 else 3.25)
    spec.setdefault('roof_rise',1.05 if spec['floors']==2 else .9)
    spec.setdefault('variant','terrace');spec.setdefault('party_walls',[])
    if spec['width']<=3 or spec['depth']<=3:raise ValueError('Building too small for the declared facade: '+spec['id'])
    if spec['floors'] not in (1,2):raise ValueError('SPACE08 supports one or two storeys: '+spec['id'])
    if set(spec['party_walls'])-{'front','rear','left','right'}:raise ValueError('Unknown party wall: '+spec['id'])
    if 'front' in spec['party_walls']:raise ValueError('The principal entrance cannot be on a party wall: '+spec['id'])
    if spec.get('secondary_front') in spec['party_walls']:raise ValueError('Secondary frontage cannot be a party wall: '+spec['id'])
    return spec


def build_house(spec,materials,index,source_terrain):
    point,direction=transform_for(spec)
    seed=sum((i+1)*ord(char) for i,char in enumerate(spec['id']))+8031
    width,depth,base=spec['width'],spec['depth'],spec['base_z']
    eaves=base+spec['eaves_height'];upper=eaves-1.0;floors=spec['floors']
    plaster=spec.get('plaster',('plaster','WarmGrey','plaster_alt','SoftOchre')[seed%4])
    trim=spec.get('trim',('WeatheredWood','FadedTeal','WeatheredWood','SagePaint','BluePaint')[seed%5])
    if plaster not in materials or trim not in materials:raise ValueError('Unknown material selection: '+spec['id'])
    walls=Batch(PREFIX+spec['id']+'_WallsAndPlinth',materials,point)
    joinery=Batch(PREFIX+spec['id']+'_WindowsAndDoors',materials,point)
    roofing=Batch(PREFIX+spec['id']+'_RoofAndEaves',materials,point)
    faces=[('front','Y',-depth/2,0,-1,width),('rear','Y',depth/2,0,1,width),
           ('left','X',-width/2,0,-1,depth),('right','X',width/2,0,1,depth)]
    windows=[];doors=[];parties=[];party=set(spec['party_walls'])
    ww=min(.96,max(.76,width*.155));hh=1.23
    for label,axis,plane,center,out,span in faces:
        facade=Facade(joinery,axis,plane,center,out);openings=[]
        n=direction((0,out) if axis=='Y' else (out,0));t=direction((1,0) if axis=='Y' else (0,1))
        if label in party:
            wall(Facade(walls,axis,plane,center,out),span,base,eaves,[],plaster,True)
            a=point(facade.world((-span/2,0,base)));b=point(facade.world((span/2,0,base)))
            parties.append({'side':label,'start_xy':list(a[:2]),'end_xy':list(b[:2]),'outward_xy':list(n),
                            'eaves_z':eaves,'ridge_z':eaves+spec['roof_rise'],'openings':0,'eave_projection':0})
            continue
        is_front=label=='front' or label==spec.get('secondary_front')
        if is_front:
            for sign in (-1,1):
                if floors==2:openings.append({'u':sign*span*.265,'z':upper,'w':ww,'h':hh,'upper':True,'curtains':True})
                openings.append({'u':sign*span*.265,'z':base+1.25,'w':ww-.06,'h':1.13,'curtains':seed%2==0})
        elif label=='rear':
            for sign in (-1,1):
                openings.append({'u':sign*span*.26,'z':upper if floors==2 else base+1.34,
                                 'w':min(.86,ww),'h':1.12,'upper':floors==2,'curtains':sign<0})
        else:
            openings.append({'u':0,'z':upper if floors==2 else base+1.34,'w':.84,'h':1.12,'upper':floors==2,'curtains':True})
        if label in ('front','rear') or label==spec.get('secondary_front'):
            dw=.94 if label=='front' else .83 if label=='rear' else .90
            dh=2.0 if label=='front' else 1.90 if label=='rear' else 1.95
            door_u=(.25 if seed%2 else -.25) if label=='rear' else 0
            door_base=base;grounding={}
            if spec.get('group')=='south-street' and label=='rear':
                corners=[point(facade.world((door_u+u,d,base)))
                         for u in (-(dw+.16)/2,(dw+.16)/2) for d in (-.08,.16)]
                rectangle=[min(p[0] for p in corners),min(p[1] for p in corners),
                           max(p[0] for p in corners),max(p[1] for p in corners)]
                height,peak=maximum_terrain_height(source_terrain,rectangle)
                door_base=max(base,height)
                grounding={'terrain_source':'ROAM01_South continuous terrain','terrain_footprint_xy':rectangle,
                           'terrain_maximum_z':height,'terrain_maximum_point':peak,
                           'ground_measurement':'Exact source mesh triangle clipping over full threshold width and projection.'}
            openings.append({'u':door_u,'z':door_base+dh/2+.015,'w':dw,'h':dh,'door':True,
                             'ground_base_z':door_base,'grounding':grounding})
        wall(Facade(walls,axis,plane,center,out),span,base,eaves,openings,plaster)
        for opening in openings:
            world=point(facade.world((opening['u'],0,opening['z'])))
            if opening.get('door'):
                door_base=opening['ground_base_z']
                make_door(facade,opening,trim,door_base)
                doors.append({'id':spec['id']+'/'+label+'-door','side':label,'position_xy':list(world[:2]),
                              'center':list(world),'width':opening['w'],'height':opening['h'],'outward_xy':list(n),
                              'secondary':label==spec.get('secondary_front'),
                              'ground_base_z':door_base,'opening_bottom_z':door_base+.015,
                              'panel_bottom_z':door_base+.0275,'panel_top_z':door_base+opening['h']+.0025,
                              'threshold_top':door_base+.035,'threshold_width':opening['w']+.16,'projection':.16,
                              'threshold_center':list(point(facade.world((opening['u'],.04,door_base+.0175)))),
                              **opening['grounding']})
                continue
            warm=label=='front' and opening.get('upper',floors==1) and opening['u']<0 and seed%5==0
            shutter=label=='front' and opening.get('upper') and seed%3==1
            make_window(facade,opening,trim,warm,shutter,18+seed%3*3)
            wid=f"{spec['id']}/{label}/window-{len(windows)+1}"
            windows.append({'id':wid,'house_id':spec['id'],'side':label,'center':list(world),
                            'position_xy':list(world[:2]),'outward_xy':list(n),'tangent_xy':list(t),
                            'width':opening['w'],'height':opening['h'],'upper':bool(opening.get('upper')),
                            'pane_depth':-.12,'back_depth':-.245,'linen_depth':-.175,
                            'has_curtain':bool(opening.get('curtains')),'existing_warm':bool(warm),
                            'closed_back':True})
        if floors==2 and label in ('front','rear'):
            facade.box(0,.025,base+2.63,span,.10,.065,'stone')
    walls.local_box((0,0,base-.025),(width,depth,.05),'stone')
    overhang=roof(roofing,spec,eaves,plaster,seed)
    objects=[walls.finish(),joinery.finish(),roofing.finish()]
    for obj in objects:
        obj['building_id']=spec['id'];obj['neighbourhood_group']=spec.get('group','')
    bpy.context.view_layer.update()
    actual=bounds(objects);roof_bounds=bounds([objects[2]])
    lower_points=[]
    for obj in objects:
        for polygon in obj.data.polygons:
            points=[obj.matrix_world@obj.data.vertices[i].co for i in polygon.vertices]
            if min(p.z for p in points)>base+1.80 or max(p.z for p in points)<base-.01:continue
            lower_points.extend(points)
    lower_bounds=[min(p.x for p in lower_points),min(p.y for p in lower_points),
                  max(p.x for p in lower_points),max(p.y for p in lower_points)]
    corners=[point((x,y,base)) for x in (-width/2,width/2) for y in (-depth/2,depth/2)]
    footprint=[min(v[0] for v in corners),min(v[1] for v in corners),max(v[0] for v in corners),max(v[1] for v in corners)]
    triangles=sum(sum(len(face.vertices)-2 for face in obj.data.polygons) for obj in objects)
    return {'id':spec['id'],'group':spec.get('group',''),'variant':spec['variant'],'center':spec['center'],
            'yaw_deg':spec['yaw_deg'],'local_width':width,'local_depth':depth,'floors':floors,'base_z':base,
            'eaves_z':eaves,'ridge_z':eaves+spec['roof_rise'],'footprint':footprint,
            'occupied_bounds_xy':actual['min'][:2]+actual['max'][:2],'lower_body_bounds_xy':lower_bounds,
            'lower_body_height_band':[base,base+1.8],'max_lower_facade_projection':.195,
            'bounds':actual,'roof_bounds':roof_bounds,
            'eave_overhangs_local':overhang,'party_walls':parties,'secondary_front':spec.get('secondary_front'),
            'windows':windows,'doors':doors,'window_count':len(windows),'warm_window_count':sum(w['existing_warm'] for w in windows),
            'plaster':materials[plaster].name,'trim':materials[trim].name,'triangles':triangles,
            'objects':[obj.name for obj in objects],'source_proxy':spec.get('source_proxy'),'interiors_enterable':False}


def replaced_objects():
    collection=bpy.data.collections.get('SPACE06_NeighbourhoodBuildings')
    if not collection:raise RuntimeError('Load SPACE06 before building SPACE08.')
    names=sorted(obj.name for obj in collection.objects)
    if len(names)!=51:raise RuntimeError('Expected precisely 51 original SPACE06 house meshes.')
    names.extend('SPACE01_'+name+' '+suffix for name in OLD_PROXIES for suffix in ('envelope details','closed pitched roof'))
    if len(names)!=59 or any(name not in bpy.data.objects for name in names):raise RuntimeError('Original proxy replacement whitelist is incomplete.')
    return names


def build(layout):
    if bpy.data.collections.get(GROUP):raise RuntimeError('SPACE08 buildings already exist.')
    specs=[house_spec(raw,layout.get('road_top',.855)) for raw in layout['buildings']]
    if len(specs)!=21 or len({s['id'] for s in specs})!=21:raise RuntimeError('SPACE08 requires the 17 grouped houses plus 4 proxy replacements.')
    replacements=replaced_objects()
    source_terrain=terrain_triangles();materials,aliases=new_materials()
    houses=[build_house(spec,materials,index,source_terrain) for index,spec in enumerate(specs)]
    triangles=sum(house['triangles'] for house in houses)
    if triangles>TRIANGLE_LIMIT:raise RuntimeError('SPACE08 building triangle budget exceeded: '+str(triangles))
    for name in replacements:
        bpy.data.objects[name].hide_render=True;bpy.data.objects[name].hide_viewport=True
    meshes=[name for house in houses for name in house['objects']]
    return {'version':'space-08-grouped-neighbourhood-buildings','houses':houses,'building_count':len(houses),
            'replacedObjects':replacements,'replaced_objects':replacements,
            'allowed_original_changes':{name:['hide_render','hide_viewport'] for name in replacements},
            'meshes':meshes,'objects':meshes,'object_count':len(meshes),'triangles':triangles,
            'new_materials':[m.name for m in materials.values()],'web_material_aliases':aliases,'aliases':aliases,
            'newpaneMaterials':[materials['WindowPane'].name],'new_pane_materials':[materials['WindowPane'].name],
            'new_warm_materials':[materials['WindowWarm'].name],'new_back_materials':[materials['WindowBack'].name],
            'new_curtain_materials':[materials['Linen'].name],
            'windows':[w for house in houses for w in house['windows']],
            'doors':[d for house in houses for d in house['doors']],
            'coordinate_system':'Blender XYZ metres; window/door center and direction are explicit world values.',
            'new_lights':0,'source_geometry_and_materials_modified':False,
            'party_wall_policy':'No openings or projecting plinths at shared planes; no inner eave extension or ridge-end caps.',
            'scope':'21 complete exterior buildings; 17 grouped replacements and four upgraded background shells. No enterable interiors.'}
