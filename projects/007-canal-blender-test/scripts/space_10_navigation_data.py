"""Pure SPACE10 metadata: visit actual entry positions, without loading Blender."""
FLOOR=.855

def actual_entry_routes(layout,houses):
    """Use real offset doors, never the building centre, as tour stops."""
    by_id={house['id']:house for house in houses}
    approaches=[]
    for house in houses:
        for door in house.get('doors',[]):
            if door['side']!='front' and not door.get('secondary'):continue
            x,y=door['position_xy'];dx,dy=door['outward_xy']
            approaches.append({'id':door['id'],'house_id':house['id'],'side':door['side'],
                               'door':list(door['position_xy']),'point':[x+dx*.55,y+dy*.55]})
    def approach(house_id,side):
        return next(r['point'] for r in approaches if r['house_id']==house_id and r['side']==side)
    if all(by_id.get(key,{}).get('doors') for key in ('south_03','south_04','north_east_02')):
        left=approach('south_03','left');right=approach('south_04','front')
        south=approach('north_east_02','left');east=approach('north_east_02','front')
        layout['navigation_routes']['south_middle_court_return']=[[-3.6,-35.5],[-3.6,left[1]],left,
            [-3.6,left[1]],[-3.6,right[1]],right,[-3.6,right[1]],[-3.6,-41.8],[-3.6,-35.5]]
        layout['navigation_routes']['north_east_corner_return']=[[south[0],8.0],south,[31.9,south[1]],
            [31.9,east[1]],east,[31.9,east[1]],[31.9,8.0],[south[0],8.0]]
        layout['navigation_spawns']['northEastCorner']={'x':south[0],'y':FLOOR,'z':-8.0}
    return approaches
