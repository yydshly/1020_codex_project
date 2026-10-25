"""Compare single Walk contact pose with half-cycle averaged pose, read-only."""
import json
from pathlib import Path
from audit_cat_a_glb import GLB,trs,multiply,interpolate
ROOT=Path(__file__).resolve().parents[1]
glb=GLB(ROOT/'web/models/cat-a-study.glb');d=glb.doc;n=d['nodes'];names={x.get('name'):i for i,x in enumerate(n)}
parents={c:i for i,node in enumerate(n) for c in node.get('children',[])}
a=next(a for a in d['animations'] if a['name']=='Walk')
tracks=[]
for c in a['channels']:
 s=a['samplers'][c['sampler']];tracks.append((c['target']['node'],c['target']['path'],[v[0] for v in glb.accessor(s['input'])],glb.accessor(s['output'])))
paws={'frontL':['Toe_ring_L_front','Toe_Pointer_L_front'],'frontR':['Toe_ring_L_front.002','Toe_Pointer_L_front.002'],'rearL':['Toe_back_L_Ring','Toe_back_L_Pointer'],'rearR':['Toe_back_L_Ring.002','Toe_back_L_Pointer.002']}
rows=[]
for blend in [0,.25,.5]:
 overrides={};world={}
 for node,path,times,values in tracks:
  v1=interpolate(times,values,.426*1.125,path,'LINEAR');v2=interpolate(times,values,.926*1.125,path,'LINEAR')
  overrides.setdefault(node,{})[path]=interpolate([0,1],[v1,v2],blend,path,'LINEAR')
 def matrix(i):
  if i not in world:
   local=trs(n[i],overrides.get(i,{}));world[i]=multiply(matrix(parents[i]),local) if i in parents else local
  return world[i]
 result={}
 for label,bones in paws.items():result[label]=[sum(matrix(names[b])[axis][3]*.07 for b in bones)/2 for axis in range(3)]
 rows.append({'blend':blend,'paws':result,'pairZspread':[abs(result['frontL'][2]-result['frontR'][2]),abs(result['rearL'][2]-result['rearR'][2])], 'heightSpread':max(p[1] for p in result.values())-min(p[1] for p in result.values())})
out=ROOT/'artifacts/cat-a-street-v2/idle-blend-review.json';out.write_text(json.dumps(rows,indent=2));print(json.dumps(rows,indent=2))
