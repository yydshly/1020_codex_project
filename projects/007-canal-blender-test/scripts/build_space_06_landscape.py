"""Finite neighbourhood roads, green courts and planted outskirts; no save/export."""
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from build_space_05_courtyard import Batch as BaseBatch
from build_roam_scene import river_section,smooth
from scene_utils import mesh,rgb

PREFIX='SPACE06_'
GROUP=PREFIX+'Landscape'
TERRAINS=('ROAM01_North continuous terrain','ROAM01_South continuous terrain')
CURBS=('EXT_Outer alley curb','EXT_Outer alley curb.001')
PROTECTED=(-26.,-38.,24.,28.)
PALETTE={
    'Grass':('777b58',.92),'GrassShade':('5b6a4c',.93),'GrassDry':('8b8863',.94),
    'Leaf':('687b53',.86),'LeafLight':('829062',.88),'LeafShade':('506448',.88),
    'Bark':('665648',.88),'Reed':('7d875e',.91),
}


class Batch(BaseBatch):
    def finish(self,name,smooth_faces=False):
        obj=mesh(PREFIX+name,self.vertices,self.faces,[bpy.data.materials[n] for n in self.names],GROUP,self.indices)
        if smooth_faces:
            for face in obj.data.polygons:face.use_smooth=True
        return obj

    def prism(self,xy,top,bottom,material):
        n=len(xy)
        tops=[top]*n if isinstance(top,(float,int)) else top
        vertices=[(x,y,bottom) for x,y in xy]+[(x,y,z) for (x,y),z in zip(xy,tops)]
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        faces.extend((i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n))
        self.add(vertices,faces,material)

    def branch(self,start,end,r0,r1,material,sides=6):
        start,end=Vector(start),Vector(end)
        axis=(end-start).normalized()
        cross=axis.cross(Vector((0,1,0)))
        if cross.length<.1:cross=axis.cross(Vector((1,0,0)))
        u=cross.normalized();v=axis.cross(u).normalized()
        points=[p+r*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides))
                for p,r in ((start,r0),(end,r1)) for i in range(sides)]
        faces=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
        faces.extend((i,(i+1)%sides,sides+(i+1)%sides,sides+i) for i in range(sides))
        self.add(points,faces,material)


def _new_materials():
    for suffix,(colour,roughness) in PALETTE.items():
        name=PREFIX+suffix
        if bpy.data.materials.get(name):raise RuntimeError('Landscape material already exists: '+name)
        material=bpy.data.materials.new(name);material.use_nodes=True
        material.diffuse_color=rgb(colour)
        shader=material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value=rgb(colour)
        shader.inputs['Roughness'].default_value=roughness
        shader.inputs['Specular IOR Level'].default_value=.25


def _bounds(points):
    return {'min':[min(p[a] for p in points) for a in range(3)],
            'max':[max(p[a] for p in points) for a in range(3)]}


def _prepare_old_edges():
    gates=[]
    for obj in bpy.data.objects:
        if obj.name.startswith(('EXT_Access boundary gate rail','EXT_Access boundary gate bar')):
            obj.hide_render=True;obj.hide_viewport=True;gates.append(obj.name)
    if len(gates)!=36:raise RuntimeError('Expected exactly the 36 audited old gate rails/bars.')
    curb_report=[]
    for name in CURBS:
        obj=bpy.data.objects[name];old=obj.data
        lo=[min(v.co[a] for v in old.vertices) for a in range(3)]
        hi=[max(v.co[a] for v in old.vertices) for a in range(3)]
        cut=6.85-obj.matrix_world.translation.y
        top=.855-obj.matrix_world.translation.z
        batch=Batch();material=old.materials[0].name
        batch.box_bounds((lo[0],lo[1],lo[2],hi[0],cut,hi[2]),material)
        batch.box_bounds((lo[0],cut,lo[2],hi[0],hi[1],top),material)
        data=bpy.data.meshes.new(PREFIX+'LoweredCrossing_'+name)
        data.from_pydata(batch.vertices,[],batch.faces)
        for mat in old.materials:data.materials.append(mat)
        data.update();obj.data=data
        curb_report.append({'object':name,'old_mesh':old.name,'new_mesh':data.name,
                            'modified_world_y':[6.85,8.9],'new_top':.855,'remaining_long_side_unchanged':True})
    return {'hidden_gate_rails_and_bars':sorted(gates),'gate_fields':['hide_render','hide_viewport'],
            'gate_posts_preserved':True,'curb_openings':curb_report}


def _level_development(layout):
    left,bottom,right,top=PROTECTED
    dl,db,dr,dt=layout['developed_bounds_xy']
    records=[]
    for name in TERRAINS:
        obj=bpy.data.objects[name];old=obj.data
        protected=set()
        for poly in old.polygons:
            points=[old.vertices[i].co for i in poly.vertices]
            if max(p.x for p in points)<left or min(p.x for p in points)>right:continue
            if max(p.y for p in points)<bottom or min(p.y for p in points)>top:continue
            protected.update(poly.vertices)
        data=old.copy();data.name=PREFIX+'DevelopmentGrade_'+old.name
        changed=[]
        for vertex in data.vertices:
            x,y,z=vertex.co
            if vertex.index in protected:continue
            center,width=river_section(x)
            distance=abs(y-center)-width/2
            if distance<=.6001:continue
            outside=max(dl-x,x-dr,db-y,y-dt,0.)
            weight=1.-smooth(outside/8.)
            target=min(z,.69)
            value=z+(target-z)*weight
            if abs(value-z)>1e-7:
                vertex.co.z=value;changed.append(vertex.index)
        data.update();obj.data=data
        records.append({'object':name,'old_mesh':old.name,'new_mesh':data.name,
                        'changed_z_vertices':len(changed),'changed_indices':changed,
                        'protected_cell_vertex_count':len(protected),'protected_cell_vertices':sorted(protected),
                        'xy_topology_materials_unchanged':True,
                        'max_lowering':max((old.vertices[i].co.z-data.vertices[i].co.z for i in changed),default=0.)})
    bpy.context.view_layer.update()
    trees=[]
    for name in TERRAINS:
        obj=bpy.data.objects[name]
        trees.append(BVHTree.FromPolygons([obj.matrix_world@v.co for v in obj.data.vertices],
                                         [tuple(f.vertices) for f in obj.data.polygons]))
    def height(x,y):
        hits=[tree.ray_cast(Vector((x,y,30)),Vector((0,0,-1)),50)[0] for tree in trees]
        valid=[p.z for p in hits if p is not None]
        return max(valid) if valid else .69
    return records,height


def _curve_span(curve,x):
    rows=curve['section_ranges']
    for a,b in zip(rows[:-1],rows[1:]):
        if a[0]-1e-8<=x<=b[0]+1e-8:
            t=(x-a[0])/(b[0]-a[0])
            return a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t
    return tuple(rows[0][1:]) if x<rows[0][0] else tuple(rows[-1][1:])


def _curve_height(curve,x):
    rule=curve['height'];d=(x-rule['old_edge_x'])*rule['direction']
    return rule['start_z']+(rule['end_z']-rule['start_z'])*max(0.,min(1.,d/rule['ramp_length']))


def _roads(plan):
    """Union in vertical strips: intersections have one top face, not stacked roads."""
    sources=[];cuts=set();ys=set()
    for road in plan['road_rectangles']:
        x0,y0,x1,y1=road['bounds'];cuts.update((x0,x1));ys.update((y0,y1))
        sources.append({'id':road['id'],'x0':x0,'x1':x1,'span':lambda x,a=y0,b=y1:(a,b),'height':lambda x:.855})
    for curve in plan['curved_quays']:
        a,b=curve['x_range'];cuts.update(row[0] for row in curve['section_ranges'])
        cuts.add(curve['height']['old_edge_x']+curve['height']['direction']*2.)
        sources.append({'id':curve['id'],'x0':a,'x1':b,'span':lambda x,c=curve:_curve_span(c,x),
                        'height':lambda x,c=curve:_curve_height(c,x)})
        for p,q in zip(curve['section_ranges'][:-1],curve['section_ranges'][1:]):
            for axis in (1,2):
                if abs(q[axis]-p[axis])<1e-12:continue
                for y in ys:
                    t=(y-p[axis])/(q[axis]-p[axis])
                    if 0<t<1:cuts.add(p[0]+(q[0]-p[0])*t)
    base=Batch();surface=Batch();cells=[]
    xs=sorted(cuts)
    for a,b in zip(xs[:-1],xs[1:]):
        if b-a<1e-7:continue
        x=(a+b)/2
        active=sorted([(source['span'](x)[0],source['span'](x)[1],source)
                       for source in sources if source['x0']<x<source['x1']],key=lambda row:row[0])
        groups=[]
        for low,high,source in active:
            if groups and low<=groups[-1][1]+1e-6:
                groups[-1][1]=max(groups[-1][1],high);groups[-1][2].append(source)
            else:groups.append([low,high,[source]])
        for low,high,members in groups:
            lo0=min(s['span'](a)[0] for s in members);lo1=min(s['span'](b)[0] for s in members)
            hi0=max(s['span'](a)[1] for s in members);hi1=max(s['span'](b)[1] for s in members)
            z0=max(s['height'](a) for s in members);z1=max(s['height'](b) for s in members)
            xy=[(a,lo0),(b,lo1),(b,hi1),(a,hi0)];heights=[z0,z1,z1,z0]
            is_quay=any('quay' in s['id'] for s in members)
            base.prism(xy,[z-.03 for z in heights],-.16 if is_quay else .62,'stone')
            surface.prism(xy,heights,min(z0,z1)-.03,'paving')
            cells.append({'x':[a,b],'y_at_start':[lo0,hi0],'y_at_end':[lo1,hi1],'top':[z0,z1],
                          'sources':[s['id'] for s in members]})
    return [base.finish('RoadFoundations'),surface.finish('ContinuousStoneRoads')],cells


def _house_supports(layout,plan,ground):
    batch=Batch();records=[]
    def apron_edge(x,side):
        if -25.457500457763672<x<24:return 1.1885 if side==1 else -15.4803276062
        curve=next(c for c in plan['curved_quays'] if c['bank_side']==side and c['x_range'][0]-1e-6<=x<=c['x_range'][1]+1e-6)
        lo,hi=_curve_span(curve,x)
        return hi if side==1 else lo
    for house in layout['building_footprints']:
        x,y=house['center'];w,d=house['width'],house['depth'];direction=house['facade_direction_y']
        left,right=x-w/2-.14,x+w/2+.14;bottom,top=y-d/2-.14,y+d/2+.14
        zmin=min(.62,min(ground(a,b) for a in (left,right) for b in (bottom,top))-.04)
        batch.box_bounds((left,bottom,zmin,right,top,.855),'stone')
        if house['group'] in ('near-front','far-front'):
            side=1 if house['group']=='near-front' else -1
            front=y+direction*d/2
            # Forecourt strips follow the actual quay back edge where the canal bends.
            xs=sorted(set([left+(right-left)*i/8 for i in range(9)]+[v for v in (-25.457500457763672,24.) if left<v<right]))
            for a,b in zip(xs[:-1],xs[1:]):
                ea,eb=apron_edge(a,side),apron_edge(b,side)
                coords=[(a,min(ea,front)),(b,min(eb,front)),(b,max(eb,front)),(a,max(ea,front))]
                batch.prism(coords,.855,.63,'paving')
        else:
            front=y+direction*d/2
            road_edge=9.1 if house['group']=='north-backstreet' else -36.75
            batch.box_bounds((x-.85,min(front,road_edge),.63,x+.85,max(front,road_edge),.855),'paving')
        records.append({'id':house['id'],'support_bounds_xy':[left,bottom,right,top],'top':.855,'bottom':zmin})
    return batch.finish('HouseGroundingAndDoorPaths'),records


def _grass_spaces(layout,ground):
    batch=Batch();records=[]
    for index,plot in enumerate(layout['green_spaces_xy']):
        left,bottom,right,top=plot['bounds'];cx=(left+right)/2;cy=(bottom+top)/2
        rx=(right-left)/2*.94;ry=(top-bottom)/2*.94
        n=36;vertices=[(cx,cy,ground(cx,cy)+.016)]
        for ring in (.48,1.):
            for i in range(n):
                angle=math.tau*i/n;shape=1.+.035*math.sin(angle*5+index)+.025*math.cos(angle*3-index)
                x=cx+rx*ring*shape*math.cos(angle);y=cy+ry*ring*shape*math.sin(angle)
                vertices.append((x,y,ground(x,y)+(.014 if ring<1 else .004)))
        for i in range(n):
            j=(i+1)%n
            colour=PREFIX+('GrassShade' if i%9==0 else 'Grass')
            batch.add([vertices[k] for k in (0,1+i,1+j)],[(0,1,2)],colour)
            batch.add([vertices[k] for k in (1+i,1+n+i,1+n+j,1+j)],[(0,1,2,3)],PREFIX+('GrassDry' if i%11==0 else 'Grass'))
        records.append({'id':plot['id'],'bounds_xy':plot['bounds'],'shape':'Irregular planted oval with a terrain-following edge, no rectangular grass plate.'})
    return batch.finish('FivePlantedGreenSpaces',True),records


def _crown(batch,center,scale,rng):
    cx,cy,cz=center;rx,ry,rz=scale;n=7
    vertices=[(cx-.12*rx,cy+.08*ry,cz-.70*rz)]
    for level in (-.24,.29):
        for i in range(n):
            a=math.tau*i/n+(0.16 if level>0 else 0.)
            r=rng.uniform(.75,1.12)
            vertices.append((cx+math.cos(a)*rx*r,cy+math.sin(a)*ry*r,cz+level*rz+rng.uniform(-.13,.13)*rz))
    vertices.append((cx+.16*rx,cy-.11*ry,cz+.68*rz))
    for i in range(n):
        j=(i+1)%n
        faces=[(0,1+j,1+i),(1+i,1+j,1+n+j),(1+i,1+n+j,1+n+i),(1+n+i,1+n+j,len(vertices)-1)]
        name=PREFIX+rng.choices(['Leaf','LeafLight','LeafShade'],[.6,.18,.22])[0]
        batch.add(vertices,faces,name)
    # Detached pointed leaf sprays break the smooth clump silhouette.
    for i in range(10):
        a=rng.uniform(0,math.tau);x=cx+math.cos(a)*rx*.95;y=cy+math.sin(a)*ry*.95
        z=cz+rng.uniform(-.5,.5)*rz
        tangent=Vector((-math.sin(a),math.cos(a),rng.uniform(-.35,.35)))
        p=Vector((x,y,z));length=rng.uniform(.16,.28);width=.07
        points=[p-tangent*length,p+Vector((0,0,width)),p+tangent*length,p-Vector((0,0,width))]
        batch.add(points,[(0,1,2),(0,2,3)],PREFIX+'Leaf')


def _trees(plan,ground):
    trunks=Batch();crowns=Batch();records=[]
    for index,tree in enumerate(plan['trees']):
        rng=random.Random(8630+index);x,y=tree['x'],tree['blender_y'];base=ground(x,y);h=tree['height']
        r=tree['trunk_radius'];start_trunk=len(trunks.vertices);start_leaf=len(crowns.vertices)
        lean_x=rng.uniform(-.20,.20);lean_y=rng.uniform(-.20,.20)
        trunk_points=[(x,y,base-.035),(x+.03,y-.025,base+1.1),(x+lean_x*.5,y+lean_y*.5,base+2.5),(x+lean_x,y+lean_y,base+h*.79)]
        for i,(a,b) in enumerate(zip(trunk_points[:-1],trunk_points[1:])):
            trunks.branch(a,b,r*(1.3-i*.26),r*(.92-i*.24),PREFIX+'Bark',7)
        for branch in range(8):
            angle=branch*math.tau/8+rng.uniform(-.24,.24)
            reach=rng.uniform(1.0,1.65)*(h/5.5)
            anchor=(x+lean_x*.6,y+lean_y*.6,base+max(2.35,h*(.46+.018*branch)))
            tip=(x+math.cos(angle)*reach,y+math.sin(angle)*reach,base+h*rng.uniform(.64,.84))
            trunks.branch(anchor,tip,r*.34,.024,PREFIX+'Bark',5)
            twig=(tip[0]+math.cos(angle+.55)*.35,tip[1]+math.sin(angle+.55)*.35,tip[2]+.32)
            trunks.branch(tip,twig,.024,.009,PREFIX+'Bark',4)
            _crown(crowns,(twig[0],twig[1],twig[2]+.15),(.75,.66,.75),rng)
        _crown(crowns,(x+lean_x,y+lean_y,base+h*.94),(.82,.73,.82),rng)
        records.append({**tree,'base_z':base,'trunk_bounds':_bounds(trunks.vertices[start_trunk:]),
                        'crown_bounds':_bounds(crowns.vertices[start_leaf:]),'new_light':False})
    return [trunks.finish('TreeTrunksAndBranches',True),crowns.finish('IrregularLeafClusters',True)],records


def _river_plants(ground):
    batch=Batch();rng=random.Random(6021);count=0
    for side in (-1,1):
        for xbase in (-48,-44,-40,39,43,47):
            center,width=river_section(xbase)
            for clump in range(5):
                x=xbase+rng.uniform(-1.4,1.4);cy,cw=river_section(x)
                y=cy+side*(cw/2+rng.uniform(.75,1.7));z=ground(x,y)+.008
                for blade in range(5):
                    angle=rng.uniform(0,math.tau);height=rng.uniform(.30,.72)
                    dx,dy=math.cos(angle),math.sin(angle);w=.025
                    points=[(x-dy*w,y+dx*w,z),(x+dy*w,y-dx*w,z),
                            (x+dx*.14+dy*w*.4,y+dy*.14-dx*w*.4,z+height*.64),
                            (x+dx*.22,y+dy*.22,z+height)]
                    batch.add(points,[(0,1,2),(0,2,3)],PREFIX+'Reed')
                count+=1
    return batch.finish('RiverEdgeReedPatches'),count


def build():
    if bpy.data.collections.get(GROUP):raise RuntimeError('SPACE06 landscape already exists.')
    layout=json.loads((ROOT/'assets/space-06-layout.json').read_text())
    plan=json.loads((ROOT/'artifacts/scene-space-06/road-navigation-plan.json').read_text())
    before=set(bpy.data.objects.keys())
    _new_materials();old_edges=_prepare_old_edges();grading,ground=_level_development(layout)
    added,cells=_roads(plan)
    supports,house_records=_house_supports(layout,plan,ground);added.append(supports)
    grass,green_records=_grass_spaces(layout,ground);added.append(grass)
    tree_objects,tree_records=_trees(plan,ground);added.extend(tree_objects)
    reeds,reed_count=_river_plants(ground);added.append(reeds)
    bpy.context.view_layer.update()
    triangles=0
    for obj in added:obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
    if triangles>25000:raise RuntimeError(f'Landscape exceeds 25000 triangle budget: {triangles}')
    if not before.issubset(bpy.data.objects.keys()):raise RuntimeError('No old objects may be deleted.')
    return {'scope':layout['scope'],'added_objects':{o.name:_bounds([o.matrix_world@Vector(p) for p in o.bound_box]) for o in added},
            'added_object_count':len(added),'added_triangles':triangles,'new_lights':0,
            'old_edge_changes':old_edges,'terrain_changes':grading,
            'terrain_protection':{'rectangle_xy':list(PROTECTED),'whole_intersecting_cells_frozen':True,
                                  'waterline_and_first_0_6m_preserved':True,'outside_development_fade_metres':8},
            'road_plan':plan,'road_union_cells':cells,'house_grounding':house_records,
            'green_spaces':green_records,'trees':tree_records,'river_reed_patch_count':reed_count,
            'new_materials':{PREFIX+name:{'srgb':colour,'roughness':roughness} for name,(colour,roughness) in PALETTE.items()},
            'material_aliases':{},'saved_or_exported':False,
            'notes':['Original water geometry and existing buildings/routes are unchanged.',
                     'New roads follow the real curved water boundary, with single unioned tops at intersections.',
                     'Source gate bars open while original posts remain; only upper crossing sections of two curbs lower.',
                     'Trees use branching trunks, irregular small leaf masses and pointed sprays rather than one round crown.']}
