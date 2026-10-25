"""Append restrained exterior block connections to the preserved roam-02 scene.

This module never loads/saves a blend or modifies an existing datablock.  All
new geometry is grouped under SPACE01_ collections for reversible comparison.
"""

import math

import bpy

from scene_utils import cylinder, mesh


PREFIX = 'SPACE01_'
COURTS = PREFIX + 'CourtyardConnections'
REAR = PREFIX + 'RearFacadeClosure'
BACKLAND = PREFIX + 'BacklandBuildings'


def _batch(name, entries, materials, group):
    vertices, faces, indices = [], [], []
    names = list(dict.fromkeys(entry[2] for entry in entries))
    signs = ((-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),
             (1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1))
    cube = ((0,2,6,4),(1,5,7,3),(0,4,5,1),(2,3,7,6),(0,1,3,2),(4,6,7,5))
    for center, size, material in entries:
        offset = len(vertices)
        vertices.extend(tuple(center[axis] + sign[axis] * size[axis] / 2
                              for axis in range(3)) for sign in signs)
        faces.extend(tuple(offset + index for index in face) for face in cube)
        indices.extend([names.index(material)] * 6)
    return mesh(PREFIX + name, vertices, faces,
                [materials[name] for name in names], group, indices)


def _wall(entries, start, end, height=1.1, base=.69, width=.20):
    """An axis-aligned plaster enclosure with actual masonry foot/coping."""
    x1, y1 = start
    x2, y2 = end
    along_x = abs(x2 - x1) >= abs(y2 - y1)
    length = math.dist(start, end)
    center = ((x1+x2)/2, (y1+y2)/2)
    size = (length, width) if along_x else (width, length)
    entries.append(((*center, base + height/2), (*size, height), 'plaster_alt'))
    foot = (size[0]+.06, size[1]+.06, .23)
    cap = (size[0]+.08, size[1]+.08, .09)
    entries.append(((*center, base+.115), foot, 'stone'))
    entries.append(((*center, base+height+.045), cap, 'roof'))


def _roof(name, x, y, width, depth, eaves, ridge, materials):
    left, right = x-width/2-.20, x+width/2+.20
    front, back = y-depth/2-.23, y+depth/2+.23
    verts = [(left,front,eaves),(right,front,eaves),(left,back,eaves),
             (right,back,eaves),(left,y,ridge),(right,y,ridge)]
    faces = [(0,1,3,2),(0,4,5,1),(2,3,5,4),(0,2,4),(1,5,3)]
    return mesh(PREFIX+name+' closed pitched roof', verts, faces,
                [materials['roof'],materials['plaster_alt']], BACKLAND, [0,0,0,1,1])


def _backland_building(name, spec, materials):
    x,y,width,depth,height,direction = spec
    # These four footprints remain on the source terrain's flat plateau.
    base = .64
    eaves, ridge = base+height, base+height+1.02
    entries = [((x,y,base+height/2),(width,depth,height),'plaster_alt'),
               ((x,y,base+.18),(width+.12,depth+.12,.36),'stone')]
    for side in (-1,1):
        entries.append(((x,y+side*depth/2,eaves-.10),(width+.12,.15,.18),'wood'))
        entries.append(((x+side*(width/2-.09),y,base+height/2),(.17,depth+.04,height),'stone'))
    # Opaque windows give a scale cue; these are closed exterior masses.
    front_y = y + direction * (depth/2+.035)
    for window_x in (x-width*.26,x+width*.26):
        for window_z in ([base+height*.58] if height<4.5 else [base+1.55,base+3.65]):
            entries.append(((window_x,front_y,window_z),(.68,.07,1.0),'wood'))
            entries.append(((window_x,front_y+direction*.05,window_z-.55),(.88,.17,.10),'stone_light'))
            entries.append(((window_x,front_y+direction*.05,window_z),(.045,.06,.95),'wood_light'))
    entries.append(((x,front_y,base+.95),(.88,.07,1.88),'wood'))
    entries.append(((x,y,ridge+.03),(width+.43,.15,.12),'roof_alt'))
    # Eight roof-course lines, not another detailed tile mesh.
    for side in (-1,1):
        for index in range(1,5):
            distance=(depth/2+.23)*index/4
            roof_z=ridge-(ridge-eaves)*index/4
            entries.append(((x,y+side*distance,roof_z+.027),
                            (width+.40,.035,.035),'roof_alt'))
    _batch(name+' envelope details',entries,materials,BACKLAND)
    _roof(name,x,y,width,depth,eaves,ridge,materials)
    return {'name':name,'footprint':[x-width/2,y-depth/2,x+width/2,y+depth/2],
            'ridge_z':ridge,'closed_exterior_only':True}


def build():
    if any(obj.name.startswith(PREFIX) and any(group.name in (COURTS,REAR,BACKLAND)
           for group in obj.users_collection) for obj in bpy.data.objects):
        raise RuntimeError('SPACE01 building additions already exist; refusing duplication.')
    required=('plaster_alt','roof','roof_alt','stone','stone_light','wood','wood_light','iron')
    materials={name:bpy.data.materials.get(name) for name in required}
    if any(value is None for value in materials.values()):
        raise RuntimeError('The expected original scene materials are unavailable.')
    before=set(bpy.data.objects)

    # The original opposite-bank houses are kept intact.  Low enclosures make
    # the gaps read as private courtyards instead of unrelated loose boxes.
    courts=[]
    for index,(left,right) in enumerate(((-8.20,-5.90),(-.10,2.0)),1):
        center=(left+right)/2
        gate_width=.98
        _wall(courts,(left,-16.48),(center-gate_width/2,-16.48),1.2,.85)
        _wall(courts,(center+gate_width/2,-16.48),(right,-16.48),1.2,.85)
        courts.append(((center,-16.48,1.43),(gate_width,.10,1.16),'wood'))
        for side in (-1,1):
            courts.append(((center+side*(gate_width/2+.035),-16.48,1.53),(.13,.25,1.36),'stone'))
        courts.append(((center,-16.48,2.25),(gate_width+.32,.30,.11),'roof'))
        _wall(courts,(center,-21.36),(center,-22.35),1.15,.85)
    # Modest end courtyards anchor the row without encroaching on the quay.
    for left,right in ((-16.1,-13.8),(7.6,9.8)):
        _wall(courts,(left,-17.05),(right,-17.05),1.05,.85)
        outer=left if left<0 else right
        _wall(courts,(outer,-17.05),(outer,-22.35),1.05,.85)
    _batch('Opposite row courtyard boundaries',courts,materials,COURTS)

    # Original rear doors/windows are already present.  Add missing wall bases,
    # rear eaves and drainage only, with real gaps beneath existing door panels.
    rear=[]
    for index,x in enumerate((-7.,-1.,5.),1):
        door=x+.73
        for left,right in ((x-2.9,door-.55),(door+.55,x+2.9)):
            rear.append((((left+right)/2,6.65,1.035),(right-left,.13,.37),'stone'))
        rear.extend([((x,6.69,4.55),(5.8,.16,.13),'stone_light'),
                     ((x,6.86,7.69),(6.08,.32,.16),'wood'),
                     ((x,6.80,7.53),(5.99,.23,.12),'wood')])
        cylinder(PREFIX+f'Rear gutter {index}',(x-3.04,7.035,7.72),
                 (x+3.04,7.035,7.72),.065,materials['iron'],REAR,vertices=8)
        pipe_x=x+2.76
        for part,(start,end) in enumerate((((pipe_x,7.035,7.72),(pipe_x,6.92,7.35)),
                                         ((pipe_x,6.92,7.35),(pipe_x,6.92,1.0))),1):
            cylinder(PREFIX+f'Rear drain {index} part {part}',start,end,.044,
                     materials['iron'],REAR,vertices=8)
    # Scale-defining masonry courses only on the two exposed end gables.
    for x in (-9.94,7.94):
        rear.append(((x,3.9,1.05),(.16,5.45,.40),'stone'))
        rear.append(((x,3.9,4.55),(.12,5.45,.12),'stone_light'))
        for y in (1.38,6.40):
            for course in range(8):
                rear.append(((x,y,1.4+course*.78),(.14,.38 if course%2 else .55,.23),'stone_light'))
    _batch('Rear and exposed gable closure',rear,materials,REAR)

    # Private backland courtyards create an intermediate scale between the
    # existing street and low distant silhouettes.  Existing lanes remain clear.
    garden=[]
    for x in (-9.8,-3.9,2.0,7.9):
        _wall(garden,(x,10.40),(x,15.2),.90,.69)
    _wall(garden,(-9.8,15.2),(7.9,15.2),.90,.69)
    for x in (-13.9,8.0):
        _wall(garden,(x,-22.44),(x,-26.0),1.0,.69)
    _wall(garden,(-13.9,-26.0),(-6.1,-26.0),1.0,.69)
    _wall(garden,(-4.7,-26.0),(8.0,-26.0),1.0,.69)
    _batch('Backland garden compartments',garden,materials,COURTS)

    # Four low connected/offset masses, no additional props, lights or trees.
    specs=[('South backland house',(-8.7,-29.3,8.,5.4,4.0,1)),
           ('South backland offset wing',(.2,-31.3,5.5,4.7,4.9,1)),
           ('North backland range',(-3.0,20.3,8.4,5.5,3.6,-1)),
           ('North backland low wing',(3.2,20.1,4.1,4.7,2.6,-1))]
    backland=[_backland_building(name,spec,materials) for name,spec in specs]
    linking=[]
    _wall(linking,(-4.7,-27.4),(-2.55,-27.4),1.1,.69)
    _wall(linking,(-2.55,-27.4),(-2.55,-28.95),1.1,.69)
    _wall(linking,(-7.2,15.25),(-7.2,17.55),.9,.69)
    _wall(linking,(5.25,15.25),(5.25,17.75),.9,.69)
    _batch('Backland building courtyard returns',linking,materials,COURTS)

    added=sorted(set(bpy.data.objects)-before,key=lambda obj:obj.name)
    triangles=sum(sum(len(face.vertices)-2 for face in obj.data.polygons)
                  for obj in added if obj.type=='MESH')
    assert triangles<=15000, f'Building addition geometry budget exceeded: {triangles}'
    return {'object_count':len(added),'triangles':triangles,
            'collections':[COURTS,REAR,BACKLAND],
            'objects':[obj.name for obj in added],
            'backland_buildings':backland,
            'policy':'Additive exterior connections only; old objects and materials unchanged; no open interiors.',
            'route_clearance':'No additions inside original quay, rear-lane or side-alley navigation rectangles.'}
