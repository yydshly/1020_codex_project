"""Read-only idle hierarchy/axes inspection of the shipped GLB."""
import json,math
from pathlib import Path
from audit_cat_a_glb import GLB,trs,multiply,interpolate
ROOT=Path(__file__).resolve().parents[1]
glb=GLB(ROOT/'web/models/cat-a-study.glb');doc=glb.doc;nodes=doc['nodes']
names={n.get('name',''):i for i,n in enumerate(nodes)}
parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}
anim=next(a for a in doc['animations'] if a['name']=='Walk')
overrides={};world={}
for ch in anim['channels']:
    s=anim['samplers'][ch['sampler']];t=ch['target'];times=[v[0] for v in glb.accessor(s['input'])]
    overrides.setdefault(t['node'],{})[t['path']]=interpolate(times,glb.accessor(s['output']),.426*1.125,t['path'],s.get('interpolation','LINEAR'))
def matrix(i):
    if i not in world:
        local=trs(nodes[i],overrides.get(i,{}));world[i]=multiply(matrix(parents[i]),local) if i in parents else local
    return world[i]
def descendants(i):
    result=[]
    for c in nodes[i].get('children',[]):result+=[c]+descendants(c)
    return result
report={}
for name,i in names.items():
    if not any(k in name.lower() for k in ['spine','neck','head','tail','ear']):continue
    m=matrix(i)
    axes=[]
    for c in range(3):
        n=math.sqrt(sum(m[r][c]**2 for r in range(3)))
        axes.append([round(m[r][c]/n,5) for r in range(3)])
    report[name]={'parent':nodes[parents[i]].get('name') if i in parents else None,
       'position_m':[round(m[r][3]*.07,5) for r in range(3)],'local_axis_in_world':axes,
       'descendants':[nodes[c].get('name') for c in descendants(i)],
       'descendant_feet':[nodes[c].get('name') for c in descendants(i) if any(k in nodes[c].get('name','').lower() for k in ['toe','foot'])]}
out=ROOT/'artifacts/cat-a-street-v2';out.mkdir(exist_ok=True)
(out/'idle-bone-axes.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
for name,d in report.items():print(name,'parent',d['parent'],'axes',d['local_axis_in_world'],'feet',d['descendant_feet'])
