"""SPACE08 continuous frontages and small courts, added to the frozen 06 roads.

build(layout, building_metadata=None) mutates only the explicitly retired 06
house-support batch's visibility. It neither saves files nor exports a scene.
All new vertices, meshes and objects belong to SPACE08_.
"""
import json
import copy
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from build_space_05_courtyard import Batch as BaseBatch
from scene_utils import mesh

PREFIX='SPACE08_'
GROUP=PREFIX+'GroundAndCourts'
FLOOR=.855
RETIRED='SPACE06_HouseGroundingAndDoorPaths'
HEIGHT_PATCHES=[{'id':'southwest-corner-rising-tail','bounds':[-32.,-43.26,-30.9,-41.],
                'start_y':-41.,'end_y':-43.26,'start_z':FLOOR,'end_z':1.0}]


def surface_height(x,y):
    for patch in HEIGHT_PATCHES:
        if _inside(patch['bounds'],x,y,1e-7):
            t=max(0.,min(1.,(y-patch['start_y'])/(patch['end_y']-patch['start_y'])))
            return patch['start_z']+(patch['end_z']-patch['start_z'])*t
    return FLOOR


class Batch(BaseBatch):
    def finish(self,name):
        if not self.faces:return None
        return mesh(PREFIX+name,self.vertices,self.faces,
                    [bpy.data.materials[name] for name in self.names],GROUP,self.indices)

    def prism(self,xy,top,bottom,material):
        n=len(xy);tops=[top]*n if isinstance(top,(int,float)) else top
        points=[(x,y,bottom) for x,y in xy]+[(x,y,z) for (x,y),z in zip(xy,tops)]
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        faces.extend((i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n))
        self.add(points,faces,material)


def _inside(rect,x,y,eps=0.):
    return rect[0]-eps<=x<=rect[2]+eps and rect[1]-eps<=y<=rect[3]+eps


def _bounds(obj):
    points=[obj.matrix_world@v.co for v in obj.data.vertices]
    return {'min':[min(p[a] for p in points) for a in range(3)],
            'max':[max(p[a] for p in points) for a in range(3)]}


def _ground_sampler():
    trees=[]
    for name in ('ROAM01_North continuous terrain','ROAM01_South continuous terrain'):
        obj=bpy.data.objects[name]
        obj.data.calc_loop_triangles()
        trees.append(BVHTree.FromPolygons([obj.matrix_world@v.co for v in obj.data.vertices],
                                         [tuple(p.vertices) for p in obj.data.loop_triangles],all_triangles=True))
    def sample(x,y):
        hits=[tree.ray_cast(Vector((x,y,20)),Vector((0,0,-1)),40)[0] for tree in trees]
        return max((hit.z for hit in hits if hit is not None),default=None)
    return sample


def _curve_span(curve,x):
    rows=curve['section_ranges']
    for a,b in zip(rows[:-1],rows[1:]):
        if a[0]-1e-8<=x<=b[0]+1e-8:
            t=(x-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t
    return tuple(rows[0][1:]) if x<rows[0][0] else tuple(rows[-1][1:])


def _old_roads(plan):
    records=[{'id':r['id'],'bounds':r['bounds']} for r in plan['road_rectangles']]
    # These are actual old paving bounds, slightly wider than its conservative
    # navigation rectangles. Do not stack coplanar new paving onto old quays.
    records.extend([
        {'id':'old-near-quay','bounds':[-25.4575004578,-1.52,24.,1.1885]},
        {'id':'old-far-quay','bounds':[-25.4575004578,-15.4803276062,24.,-10.85]},
        {'id':'old-rear-lane','bounds':[-13.82,7.1,12.52,8.9]},
        {'id':'old-west-rear-alley','bounds':[-13.82,1.1,-11.8,8.9]},
        {'id':'old-east-rear-alley','bounds':[10.5,1.1,12.52,8.9]},
    ])
    return records


def _house_records(layout,building_metadata):
    actual={h['id']:h for h in (building_metadata or {}).get('houses',[])}
    result=[]
    for spec in layout['building_footprints']:
        house=actual.get(spec['id'],{})
        if 'footprint' in house:footprint=house['footprint']
        elif 'footprint' in spec:footprint=spec['footprint']
        else:
            x,y=spec['center'];w,d=spec['width'],spec['depth']
            if abs(spec.get('rotation_deg',spec.get('yaw_deg',0)))%180>45:w,d=d,w
            footprint=[x-w/2,y-d/2,x+w/2,y+d/2]
        result.append({**spec,**house,'footprint':footprint,'base_z':house.get('base_z',FLOOR)})
    return result


def _flat_regions(layout,houses):
    """Explicit shared layout is authoritative; no one-door stepping stones."""
    records=[]
    for group in layout.get('frontage_groups',[]):
        rect=group.get('bounds_xy',group.get('bounds'))
        if rect:records.append({'id':group['id'],'bounds':list(rect),'kind':'frontage','walkable':True})
        for index,rect in enumerate(group.get('rectangles_xy',[])):
            records.append({'id':group['id']+'-'+str(index),'bounds':list(rect),'kind':'frontage','walkable':True})
    for court in layout.get('courtyards',[]):
        rect=court.get('bounds_xy',court.get('bounds'))
        if rect and court.get('surface')!='earth':
            records.append({'id':court['id'],'bounds':list(rect),'kind':'court','walkable':court.get('walkable',True),
                            'navigation_bounds':court.get('navigation_bounds_xy',list(rect))})
        connectors=court.get('connector_rectangles_xy',[])
        if court.get('connector_bounds_xy'):connectors=[court['connector_bounds_xy']]+connectors
        for index,rect in enumerate(connectors):
            rect=list(rect)
            if court.get('walkable') is False and court.get('opening',{}).get('side')=='north':rect[1]-=.18
            records.append({'id':court['id']+'-connector-'+str(index),'bounds':rect,'kind':'connector','walkable':True})
    for region in layout.get('ground_rectangles',[]):
        records.append({'id':region['id'],'bounds':list(region.get('bounds_xy',region.get('bounds'))),
                        'kind':region.get('kind','frontage'),'walkable':region.get('walkable',True)})
    for house in houses:
        a,b,c,d=house['footprint'];margin=.11
        records.append({'id':'foundation-'+house['id'],'bounds':[a-margin,b-margin,c+margin,d+margin],
                        'kind':'foundation','walkable':False})
    if not any(r['walkable'] for r in records):raise ValueError('SPACE08 layout must supply continuous frontage/courtyard ground regions.')
    return records


def _resolve_layout(layout):
    """Small, root-authorized physical joins derived from the frozen road edges."""
    layout=copy.deepcopy(layout);adjustments=[]
    for group in layout['frontage_groups']:
        previous=list(group['bounds_xy'])
        if group['id'] in ('far-west-shared-frontage','far-east-shared-frontage'):group['bounds_xy'][3]=-13.4
        if group['id']=='near-east-shared-frontage':group['bounds_xy'][1]=-.13
        if group['bounds_xy']!=previous:adjustments.append({'id':group['id'],'from':previous,'to':group['bounds_xy'],'reason':'Fill the actual curved-quay landward join; old paving is subtracted.'})
    for region in layout.get('ground_rectangles',[]):
        previous=list(region['bounds_xy'])
        if region['id']=='south-west-corner-return':region['bounds_xy'][0]=-32.
        if region['id']=='south-east-corner-return':region['bounds_xy'][2]=32.
        if previous!=region['bounds_xy']:adjustments.append({'id':region['id'],'from':previous,'to':region['bounds_xy'],'reason':'1.1m clear supporting strip at the secondary corner door.'})
    region={'id':'near-west-corner-return','bounds_xy':[-26.,1.,-24.8,7.2],'kind':'corner-apron','walkable':True}
    if not any(r['id']==region['id'] for r in layout.get('ground_rectangles',[])):
        layout.setdefault('ground_rectangles',[]).append(region);adjustments.append({'id':region['id'],'to':region['bounds_xy'],'reason':'Connect the existing left-side corner entrance to quay and rear street.'})
    for court in layout.get('courtyards',[]):
        if court['id']=='red-box-shared-court':court['navigation_bounds_xy'][3]=-28.90
    return layout,adjustments


def _old_wall_obstacles():
    records=[]
    names=('SPACE01_Backland building courtyard returns','SPACE01_Backland garden compartments')
    for name in names:
        obj=bpy.data.objects.get(name)
        if obj is None:continue
        adjacency={v.index:set() for v in obj.data.vertices}
        for edge in obj.data.edges:
            a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
        remaining=set(adjacency);index=0
        while remaining:
            first=min(remaining);remaining.remove(first);component={first};stack=[first]
            while stack:
                for other in adjacency[stack.pop()]:
                    if other in remaining:remaining.remove(other);component.add(other);stack.append(other)
            points=[obj.matrix_world@obj.data.vertices[i].co for i in component]
            lo=[min(p[a] for p in points) for a in range(3)];hi=[max(p[a] for p in points) for a in range(3)]
            if hi[2]>.855 and lo[2]<2.855:
                records.append({'id':name+'-'+str(index),'bounds':[lo[0],lo[1],hi[0],hi[1]],'top':hi[2],
                                'source_object':name,'source_component':index})
            index+=1
    return records


def _union_cells(regions,old_roads,curves):
    # Split at all rectangle and curve breakpoints. Subtract frozen old paving,
    # preserving a single top face where new frontages, foundations and courts meet.
    cuts=set(v for r in regions+old_roads for v in (r['bounds'][0],r['bounds'][2]))
    cuts.update(v for patch in HEIGHT_PATCHES for v in (patch['bounds'][0],patch['bounds'][2]))
    minx=min(r['bounds'][0] for r in regions);maxx=max(r['bounds'][2] for r in regions)
    cuts.update(p[0] for curve in curves for p in curve['section_ranges'] if minx<p[0]<maxx)
    # Add crossings of a sloping quay edge with any proposed rectangular edge.
    levels=set(v for r in regions+old_roads for v in (r['bounds'][1],r['bounds'][3]))
    for curve in curves:
        for a,b in zip(curve['section_ranges'][:-1],curve['section_ranges'][1:]):
            for axis in (1,2):
                if abs(b[axis]-a[axis])<1e-9:continue
                for level in levels:
                    t=(level-a[axis])/(b[axis]-a[axis])
                    if 0<t<1:cuts.add(a[0]+t*(b[0]-a[0]))
    xs=sorted(x for x in cuts if minx-1e-8<=x<=maxx+1e-8);cells=[]
    for a,b in zip(xs[:-1],xs[1:]):
        if b-a<1e-7:continue
        x=(a+b)/2
        active=[r for r in regions if r['bounds'][0]<x<r['bounds'][2]]
        if not active:continue
        borders=[]
        for patch in HEIGHT_PATCHES:
            if patch['bounds'][0]<x<patch['bounds'][2]:
                borders.extend((v,v) for v in (patch['bounds'][1],patch['bounds'][3]))
        for r in active:
            borders.extend([(r['bounds'][1],r['bounds'][1]),(r['bounds'][3],r['bounds'][3])])
        excluded=[]
        for road in old_roads:
            if road['bounds'][0]<x<road['bounds'][2]:
                lo,hi=road['bounds'][1],road['bounds'][3];excluded.append((lo,hi));borders.extend([(lo,lo),(hi,hi)])
        for curve in curves:
            if curve['x_range'][0]<x<curve['x_range'][1]:
                lo,hi=_curve_span(curve,x);excluded.append((lo,hi))
                al,ah=_curve_span(curve,a);bl,bh=_curve_span(curve,b);borders.extend([(al,bl),(ah,bh)])
        borders=sorted(set(borders),key=lambda pair:sum(pair)/2)
        for low,high in zip(borders[:-1],borders[1:]):
            y=(sum(low)+sum(high))/4
            if not any(r['bounds'][1]<y<r['bounds'][3] for r in active):continue
            if any(lo-1e-7<y<hi+1e-7 for lo,hi in excluded):continue
            if min(high[0]-low[0],high[1]-low[1])<1e-7:continue
            rule=next((p['id'] for p in HEIGHT_PATCHES if _inside(p['bounds'],x,y)),'flat')
            cells.append({'x':[a,b],'y_at_start':[low[0],high[0]],'y_at_end':[low[1],high[1]],
                          'top':FLOOR,'height_rule':rule,'regions':[r['id'] for r in active if r['bounds'][1]<y<r['bounds'][3]]})
    # Remove temporary grid cuts where the physical outline is continuous.
    # Keeping all of those cuts would add hidden internal box sides for no gain.
    vertical=[]
    for cell in cells:
        previous=vertical[-1] if vertical else None
        if previous and previous['height_rule']==cell['height_rule'] and previous['x']==cell['x'] and all(abs(previous[key][1]-cell[key][0])<1e-7 for key in ('y_at_start','y_at_end')):
            previous['y_at_start'][1]=cell['y_at_start'][1];previous['y_at_end'][1]=cell['y_at_end'][1]
            previous['regions']=sorted(set(previous['regions']+cell['regions']))
        else:vertical.append(copy.deepcopy(cell))
    buckets={}
    for cell in vertical:
        a,b=cell['x'];slopes=[(cell['y_at_end'][i]-cell['y_at_start'][i])/(b-a) for i in range(2)]
        intercepts=[cell['y_at_start'][i]-slopes[i]*a for i in range(2)]
        key=tuple(round(v,7) for v in slopes+intercepts)+(cell['height_rule'],)
        buckets.setdefault(key,[]).append(cell)
    merged=[]
    for group in buckets.values():
        group.sort(key=lambda cell:cell['x'][0]);current=None
        for cell in group:
            if current and abs(current['x'][1]-cell['x'][0])<1e-7 and all(abs(current['y_at_end'][i]-cell['y_at_start'][i])<1e-7 for i in range(2)):
                current['x'][1]=cell['x'][1];current['y_at_end']=cell['y_at_end']
                current['regions']=sorted(set(current['regions']+cell['regions']))
            else:current=copy.deepcopy(cell);merged.append(current)
    return merged


def _make_surfaces(cells):
    base=Batch();surface=Batch()
    for cell in cells:
        a,b=cell['x'];lo0,hi0=cell['y_at_start'];lo1,hi1=cell['y_at_end']
        xy=[(a,lo0),(b,lo1),(b,hi1),(a,hi0)]
        heights=[surface_height(x,y) if cell['height_rule']!='flat' else FLOOR for x,y in xy]
        cell['top_heights']=heights
        base.prism(xy,[z-.025 for z in heights],.60,'stone')
        surface.prism(xy,heights,min(heights)-.025,'paving')
    return [base.finish('ContinuousFrontageSupport'),surface.finish('ContinuousFrontagePaving')]


def _make_shoulders(regions,old_roads,curves,ground,houses):
    # Blend exposed plot edges down to the unchanged soil. Building/road edges
    # are excluded; a low earthen ramp replaces the old vertical black slab edge.
    batch=Batch();records=[];width=.75
    def occupied(x,y):
        if any(_inside(r['bounds'],x,y) for r in regions+old_roads):return True
        for curve in curves:
            if curve['x_range'][0]<=x<=curve['x_range'][1]:
                lo,hi=_curve_span(curve,x)
                if lo<=y<=hi:return True
        return False
    for region in regions:
        a,b,c,d=region['bounds']
        for p,q,normal in [((a,b),(c,b),(0,-1)),((c,b),(c,d),(1,0)),((c,d),(a,d),(0,1)),((a,d),(a,b),(-1,0))]:
            length=math.dist(p,q);n=max(1,math.ceil(length/.5))
            for i in range(n):
                first=tuple(p[k]+(q[k]-p[k])*i/n for k in range(2));last=tuple(p[k]+(q[k]-p[k])*(i+1)/n for k in range(2))
                mx=(first[0]+last[0])/2;my=(first[1]+last[1])/2
                if occupied(mx+normal[0]*.02,my+normal[1]*.02):continue
                span=width
                while span>.16 and occupied(mx+normal[0]*span,my+normal[1]*span):span-=.1
                if span<=.16:continue
                outer=[(point[0]+normal[0]*span,point[1]+normal[1]*span) for point in (first,last)]
                # No water encroachment or above-grade wedges on a rising hill.
                hit_heights=[ground(*point) for point in outer]
                if any(z is None for z in hit_heights):continue
                heights=[z+.004 for z in hit_heights]
                inside=[surface_height(*p)-.004 for p in (first,last)]
                if min(heights)<.35 or max(heights)>max(inside)+.25:continue
                points=[(*first,inside[0]),(*last,inside[1]),(*outer[1],heights[1]),(*outer[0],heights[0])]
                batch.add(points,[(3,2,1,0)],'soil')
                records.append({'inner':[first,last],'inner_heights':inside,'outer':outer,'outer_heights':heights,'width':span,
                                'max_gradient':max(abs(a-b)/span for a,b in zip(inside,heights))})
    return batch.finish('SoftFrontageShoulders'),records


def _court_walls(layout,ground):
    batch=Batch();records=[]
    for court in layout.get('courtyards',[]):
        a,b,c,d=court.get('bounds_xy',court.get('bounds'));thickness=court.get('wall_thickness',.16)
        height=court.get('wall_height',.90);opening=court.get('opening',{})
        sides=court.get('wall_sides',[])
        for side in sides:
            horizontal=side in ('north','south');low,high=(a,c) if horizontal else (b,d)
            constant={'north':d,'south':b,'west':a,'east':c}[side]
            intervals=[(low,high)]
            if opening.get('side')==side:
                center=opening['center'];half=opening.get('width',1.8)/2
                intervals=[(low,center-half),(center+half,high)]
            for first,last in intervals:
                if last-first<.03:continue
                rect=[first,constant-thickness/2,last,constant+thickness/2] if horizontal else [constant-thickness/2,first,constant+thickness/2,last]
                bottom=min(FLOOR-.04,min(ground(x,y) or .69 for x in (rect[0],rect[2]) for y in (rect[1],rect[3]))-.035)
                batch.box_bounds((rect[0],rect[1],bottom,rect[2],rect[3],FLOOR+height),'plaster_alt')
                batch.box_bounds((rect[0]-.018,rect[1]-.018,FLOOR+height,rect[2]+.018,rect[3]+.018,FLOOR+height+.055),'roof')
                records.append({'id':court['id']+'-'+side,'bounds':rect,'top':FLOOR+height+.055})
        if court.get('walkable') is False and opening:
            # A visible shut timber garden gate explains why the planted soil
            # parcel is private. The stone landing remains usable from the road.
            side=opening['side'];horizontal=side in ('north','south');center=opening['center'];half=opening.get('width',1.8)/2
            constant={'north':d,'south':b,'west':a,'east':c}[side]
            rect=[center-half,constant-.045,center+half,constant+.045] if horizontal else [constant-.045,center-half,constant+.045,center+half]
            batch.box_bounds((rect[0],rect[1],FLOOR+.035,rect[2],rect[3],FLOOR+height-.04),'wood')
            for z in (FLOOR+.16,FLOOR+height-.16):
                batch.box_bounds((rect[0]-.006,rect[1]-.018,z,rect[2]+.006,rect[3]+.018,z+.05),'wood_dark' if bpy.data.materials.get('wood_dark') else 'wood')
            records.append({'id':court['id']+'-closed-garden-gate','bounds':rect,'top':FLOOR+height-.04})
    return batch.finish('CourtyardEdgesAndGateReturns'),records


def build(layout,building_metadata=None):
    if bpy.data.collections.get(GROUP):raise RuntimeError('SPACE08 ground already exists.')
    if isinstance(layout,(str,Path)):layout=json.loads(Path(layout).read_text(encoding='utf-8'))
    layout,adjustments=_resolve_layout(layout)
    houses=_house_records(layout,building_metadata);regions=_flat_regions(layout,houses)
    plan=json.loads((ROOT/'artifacts/scene-space-06/road-navigation-plan.json').read_text())
    old_roads=_old_roads(plan);curves=plan['curved_quays'];ground=_ground_sampler()
    retired=bpy.data.objects[RETIRED];retired.hide_render=True;retired.hide_viewport=True
    cells=_union_cells(regions,old_roads,curves);objects=_make_surfaces(cells)
    shoulders,shoulder_records=_make_shoulders(regions,old_roads,curves,ground,houses);objects.append(shoulders)
    walls,wall_records=_court_walls(layout,ground);objects.append(walls);objects=[obj for obj in objects if obj]
    obstacles=[]
    for house in houses:
        rect=house.get('lower_body_bounds_xy')
        if rect is None:
            a,b,c,d=house['footprint'];rect=[a-.20,b-.20,c+.20,d+.20]
        if isinstance(rect,dict):rect=[rect['min'][0],rect['min'][1],rect['max'][0],rect['max'][1]]
        obstacles.append({'id':'house-'+house['id'],'bounds':list(rect)})
    old_walls=_old_wall_obstacles();obstacles.extend(wall_records);obstacles.extend(old_walls)
    zones=[{'id':r['id'],'bounds':r.get('navigation_bounds',r['bounds']),'height':FLOOR} for r in regions if r['walkable']]
    metadata={'version':'space-08-continuous-ground','objects':[o.name for o in objects],
        'object_count':len(objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),
        'source_changes':{RETIRED:['hide_render','hide_viewport']},'road_height':FLOOR,
        'regions':regions,'surface_cells':cells,'shoulders':shoulder_records,'walls':wall_records,
        'old_wall_obstacles':old_walls,'resolved_layout_adjustments':adjustments,
        'resolved_frontage_bounds':{r['id']:r['bounds'] for r in regions if r['walkable']},
        'bounds':{o.name:_bounds(o) for o in objects},'house_grounding':houses,
        'navigation':{'zones':zones,'obstacles':obstacles,'routes':layout.get('navigation_routes',{}),
                      'spawns':layout.get('navigation_spawns',{}),'height':FLOOR,'height_patches':HEIGHT_PATCHES},
        'preserved':'Original terrain, roads, quays, water, detailed core and SPACE05 courtyard geometry are unchanged.',
        'seam_height_tolerance':.005,'shoulders_walkable':False}
    return metadata
