"""Bounded SPACE08 composition, keeping the canal core and road footprint."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'assets/space-08-layout.json'

def house(id,group,x,y,w,d,yaw,eaves=5.2,rise=1.1,variant='terrace',party=(),secondary=None,floors=2,proxy=None):
    spec=dict(id=id,group=group,center=[x,y],width=w,depth=d,yaw_deg=yaw,
              base_z=.855,floors=floors,eaves_height=eaves,roof_rise=rise,
              variant=variant,party_walls=list(party))
    if secondary:spec['secondary_front']=secondary
    if proxy:spec['source_proxy']=proxy
    return spec

houses=[
 house('near_west_corner','near-front',-21.2,4,7.2,4.8,0,5.15,1.18,'corner',secondary='left'),
 house('near_east_corner','near-front',20.6,4,6.6,4.8,0,5.6,1.12,party=['right']),
 house('near_east_end','near-front',27.4,4,7,4.8,0,5.0,1.20,'corner',['left'],'right'),
 house('north_west_01','north-backstreet',-27.7,12.65,6.4,6.2,0,5.05,1.12,'corner',['right'],'left'),
 house('north_west_02','north-backstreet',-20.7,12.65,7.6,6.2,0,5.55,1.12,party=['left']),
 house('north_east_01','north-backstreet',20,12.65,7.4,6.2,0,5.25,1.18,party=['right']),
 house('north_east_02','north-backstreet',27.3,12.65,7.2,6.2,0,5.65,1.08,'corner',['left'],'right'),
 house('far_west_01','far-front',-27.5,-18.9,6.8,5.4,180,5.35,1.18,'corner',['left'],'right'),
 house('far_west_02','far-front',-21,-18.9,6.2,5.4,180,4.95,1.08,party=['right']),
 house('far_east_01','far-front',19.6,-18.9,7.4,5.4,180,5.55,1.16,party=['left']),
 house('far_east_02','far-front',27.1,-18.9,7.6,5.4,180,5.1,1.20,'corner',['right'],'left'),
 house('south_01','south-street',-27.8,-40.15,6.2,6,180,5.0,1.20,'corner',['left'],'right'),
 house('south_02','south-street',-21.4,-40.15,6.6,6,180,5.5,1.12,party=['right']),
 house('south_03','south-street',-7.5,-40.15,6.4,6,180,5.65,1.16,party=['left']),
 house('south_04','south-street',-.7,-40.15,7.2,6,180,5.05,1.15,party=['right']),
 house('south_05','south-street',20.5,-40.15,6.8,6,180,5.2,1.15,party=['left']),
 house('south_06','south-street',27.4,-40.15,7,6,180,5.75,1.05,'corner',['right'],'left'),
 house('proxy_south_house','south-courtyard',-8.7,-29.3,8,5.4,0,3.3,1.20,'outbuilding',secondary='right',floors=1,proxy='South backland house'),
 house('proxy_south_wing','south-courtyard',.2,-31.3,5.5,4.7,0,5.1,1.10,'corner',secondary='left',proxy='South backland offset wing'),
 house('proxy_north_range','north-court',-3,20.3,8.4,5.5,180,3.6,1.20,'outbuilding',['left'],floors=1,proxy='North backland range'),
 house('proxy_north_wing','north-court',3.225,20.1,4.05,4.7,180,2.9,1.0,'outbuilding',['right'],floors=1,proxy='North backland low wing'),
]

frontages=[
 dict(id='near-west-frontage',bounds_xy=[-25.0,.3,-17.4,1.6],house_ids=['near_west_corner']),
 dict(id='near-east-shared-frontage',bounds_xy=[17.1,-.1,31.05,1.6],house_ids=['near_east_corner','near_east_end']),
 dict(id='north-west-street-edge',bounds_xy=[-31.1,9.1,-16.7,9.55],house_ids=['north_west_01','north_west_02']),
 dict(id='north-east-street-edge',bounds_xy=[16.1,9.1,31.1,9.55],house_ids=['north_east_01','north_east_02']),
 dict(id='far-west-shared-frontage',bounds_xy=[-31.05,-16.2,-17.7,-14.8],house_ids=['far_west_01','far_west_02']),
 dict(id='far-east-shared-frontage',bounds_xy=[15.7,-16.2,31.05,-14.4],house_ids=['far_east_01','far_east_02']),
 dict(id='south-west-street-edge',bounds_xy=[-31.1,-37.15,-17.9,-36.75],house_ids=['south_01','south_02']),
 dict(id='south-middle-street-edge',bounds_xy=[-10.9,-37.15,3.1,-36.75],house_ids=['south_03','south_04']),
 dict(id='south-east-street-edge',bounds_xy=[16.9,-37.15,31.1,-36.75],house_ids=['south_05','south_06']),
 dict(id='north-range-frontage',bounds_xy=[-7.4,23.05,1.2,24.05],house_ids=['proxy_north_range']),
 dict(id='north-wing-frontage',bounds_xy=[1.2,22.45,5.45,24.05],house_ids=['proxy_north_wing']),
]

# The old road geometry remains fixed. Narrow corner aprons make the new
# secondary entrances address the side streets without blocking their lanes.
ground_rectangles=[]
for id,rect in [
 ('north-west-corner-return',[-31.5,9.1,-30.9,15.75]),
 ('north-east-corner-return',[30.9,9.1,31.5,15.75]),
 ('near-east-corner-return',[30.9,-1.5,31.5,6.4]),
 ('far-west-corner-return',[-31.5,-21.6,-30.9,-16.2]),
 ('far-east-corner-return',[30.9,-21.6,31.5,-14.4]),
 ('south-west-corner-return',[-31.5,-43.15,-30.9,-36.75]),
 ('south-east-corner-return',[30.9,-43.15,31.5,-36.75]),
]:ground_rectangles.append(dict(id=id,bounds_xy=rect,kind='corner-apron',walkable=True))

courtyards=[
 dict(id='red-box-shared-court',bounds_xy=[-13.1,-34.25,3.15,-26.25],
      navigation_bounds_xy=[-13.1,-34.25,3.15,-29.15],
      house_ids=['proxy_south_house','proxy_south_wing'],wall_sides=['west','east'],
      wall_height=.85,wall_thickness=.16,
      opening=dict(side='south',center=-3.6,width=2.1),
      note='South entrance is open from the existing street. Retain and collide with the original return wall between the two houses; back service pockets stay private.'),
 dict(id='south-west-shared-garden',bounds_xy=[-17.35,-43.15,-11.6,-37.3],
      walkable=False,wall_sides=['west','east','south','north'],wall_height=.75,
      opening=dict(side='north',center=-14.5,width=1.8),
      connector_bounds_xy=[-15.4,-37.3,-13.6,-36.75],
      surface='earth',note='Defined planted parcel, not another vacant inter-house gap.'),
 dict(id='south-east-shared-garden',bounds_xy=[4.0,-43.15,16.2,-37.3],
      walkable=False,wall_sides=['west','east','south','north'],wall_height=.75,
      opening=dict(side='north',center=10,width=1.8),
      connector_bounds_xy=[9.1,-37.3,10.9,-36.75],surface='earth'),
]

layout=dict(version='space-08-compact-street-groups',road_top=.855,
 scope='Recompose the same finite neighbourhood; retain detailed canal core, river, bridges and original small courtyard.',
 coordinate_system='Blender X,Y,Z metres; Three X,Y,Z = Blender X,Z,-Y',
 developed_bounds_xy=[-36,-44,36,26.5],buildings=houses,building_footprints=houses,
 frontage_groups=frontages,ground_rectangles=ground_rectangles,courtyards=courtyards,
 navigation_routes={'red_box_court_return':[
  [-3.6,-35.5],[-3.6,-33.9],[-3.6,-30.2],[-3.6,-33.9],[-8.7,-33.9],[-8.7,-32.5],[-8.7,-33.9],[-3.6,-33.9],[-3.6,-35.5]]},
 navigation_spawns={'redBoxEntrance':{'x':-3.6,'y':.855,'z':35.5}},
 composition_notes=[
  'Attached street groups replace repeated independent spacing; corner variants have a secondary street-addressing facade.',
  'The red-box south proxies become a low workshop and a two-storey courtyard house, both addressing the south street.',
  'North coarse proxies become a north-facing low range with an attached wing; its former 5cm overlap is corrected at X=1.20.',
  'Existing road footprint stays fixed; frontages are continuous within each group and exposed sides receive terrain shoulders.',
  'Preserve every older file. In the new copy retire only 51 SPACE06 building objects, eight old proxy objects and the old house-support batch.'
 ])
if DEST.exists():raise RuntimeError('SPACE08 plan already exists; refusing automatic replacement.')
DEST.write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'layout':str(DEST),'houses':len(houses),'frontages':len(frontages),'courts':len(courtyards)},ensure_ascii=False))
