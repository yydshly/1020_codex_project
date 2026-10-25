"""Finite SPACE10 composition: same 21 houses, deliberate street/court types.

Coordinates remain Blender metres. This only writes the new SPACE10 layout;
no Blender source, earlier layout or navigation file is changed.
"""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def make_plan():
    layout = json.loads((ROOT / 'assets/space-08-layout.json').read_text(encoding='utf-8-sig'))
    houses = copy.deepcopy(layout['buildings'])
    by_id = {house['id']: house for house in houses}
    changes = {
        'near_west_corner': dict(eaves_height=4.8, roof_rise=1.65,
            facade_style='townhouse', roof_style='hip', hip_ends=['left', 'right'], hip_length=1.05),
        'near_east_corner': dict(center=[19.85, 4], width=5.1, eaves_height=5.6,
            roof_rise=1.55, facade_style='townhouse'),
        'near_east_end': dict(center=[26.65, 4], width=8.5, floors=1,
            eaves_height=3.3, roof_rise=1.2, facade_style='workshop'),
        'north_west_01': dict(eaves_height=5.05, roof_rise=1.65, facade_style='townhouse'),
        'north_west_02': dict(floors=1, eaves_height=3.35, roof_rise=1.35, facade_style='workshop'),
        'north_east_01': dict(party_walls=[], facade_style='townhouse'),
        'north_east_02': dict(center=[28.05, 14.95], width=7.2, depth=5.7, yaw_deg=90,
            party_walls=[], secondary_front='left', facade_style='courtyard_house'),
        'south_01': dict(center=[-27.8, -40.65], depth=5, floors=1,
            eaves_height=3.3, roof_rise=1.3, facade_style='cottage'),
        'south_02': dict(center=[-21.4, -40.65], depth=5,
            eaves_height=5.4, roof_rise=1.65, facade_style='townhouse'),
        'south_03': dict(center=[-7.8, -40.15], width=5.8, party_walls=[],
            secondary_front='left', facade_style='courtyard_house'),
        'south_04': dict(center=[.1, -40.15], width=6, depth=4.8, yaw_deg=270,
            party_walls=[], secondary_front='left', facade_style='cottage',
            floors=1, eaves_height=3.4, roof_rise=1.45),
        'south_05': dict(floors=1, eaves_height=3.3, roof_rise=1.55, facade_style='workshop'),
        'south_06': dict(eaves_height=5.6, roof_rise=1.55, facade_style='townhouse',
            roof_style='end_hip', hip_ends=['left'], hip_length=1.15),
    }
    for house in houses:
        house['facade_style'] = 'legacy'
        house['roof_style'] = 'gable'
        house.update(changes.get(house['id'], {}))
        house['composition_change'] = house['id'] in changes
    layout.update(version='space-10-street-court-building-types', buildings=houses,
        building_footprints=copy.deepcopy(houses),
        scope='Same 21-house finite district; distinct roof silhouettes, house/workshop scales and two inward-facing courts; detailed canal core preserved.')
    layout['courtyards'].append({
        'id':'south-middle-entry-court', 'bounds_xy':[-4.9,-43.15,-2.3,-37.15],
        'navigation_bounds_xy':[-4.9,-42.8,-2.3,-37.15],
        'house_ids':['south_03','south_04'], 'wall_sides':['south'],
        'wall_height':.75, 'wall_thickness':.16,
        'opening':{'side':'north','center':-3.6,'width':2.6},
        'note':'North entrance opens to the unchanged south street. West/east sides are real house facades and doors, not duplicate walls.'})
    layout['landscape_parcels'] = [
        {'id':'northwest-house-garden','bounds_xy':[-30.25,17.15,-16.25,23.30]},
        {'id':'northeast-house-garden-west','bounds_xy':[15.25,17.15,24.35,23.30]},
        {'id':'northeast-house-garden-north','bounds_xy':[24.35,19.60,30.25,23.30]},
        {'id':'southwest-back-garden','bounds_xy':[-30.25,-33.30,-15.25,-23.25]},
        {'id':'southeast-back-garden','bounds_xy':[14.5,-33.30,30.25,-23.25]},
    ]
    layout['composition_notes'] = [
        'Same 21 houses; original detailed three shops/three opposite houses, bridges and original small courtyard remain unchanged.',
        'Five formerly two-storey houses become one-storey cottages or workshops; a narrow-high/long-low pair replaces repeated near-east twins.',
        'Two deliberate hip silhouettes: freestanding near-west roof and exposed outer end of south-east row; never hip through a party wall.',
        'Northeast end rotates toward the existing east street, opens an inward garden and stays south of unchanged tree05.',
        'Southwest row retains its back boundary and steps back one metre to create a connected forecourt.',
        'South-middle houses form a 2.6m entry court; north entrances still address the existing public street.',
        'Far-front four houses and four proxy replacements retain their prior dimensions/orientations and legacy facade/roof construction.',
        'Closed exterior houses only; no new interiors, district expansion or bridge.',
    ]
    layout['building_changes'] = changes
    layout['frozen_house_ids'] = [house['id'] for house in houses if house['id'] not in changes]
    assert len(houses) == 21
    assert len([house for house in houses if house['floors'] == 1]) == 8
    return layout


if __name__ == '__main__':
    target = ROOT / 'assets/space-10-layout.json'
    target.write_text(json.dumps(make_plan(), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(str(target))
