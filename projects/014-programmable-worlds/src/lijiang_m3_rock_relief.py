"""M3-only structural limestone relief, derived from the source block field.

Keep joint placement / surface domain and material globals, but reduce rounded
volcanic knobs and sharpen the finite risers of larger, unequal rock blocks.
No additional noise pass or external asset is introduced.
"""
from __future__ import annotations
import hashlib
from lijiang_native_march import _functions

REVISION='m3-limestone-finite-block-faces-1'

def patch(source: str):
    matches=_functions(source,'rockField')
    if len(matches)!=1:
        raise ValueError('Expected exactly one native rockField')
    begin,end,old=matches[0]
    new=old
    changes=[
      ('*6.;','*2.1;'),
      ('S=vec3(24.,14.,18.); off=vec3(11.3); A=1.6; T=.15;',
       'S=vec3(33.,17.,24.); off=vec3(11.3); A=3.2; T=.065;'),
      ('S=vec3(10.,6.5,8.5); off=vec3(0.);   A=1.4; T=.16;',
       'S=vec3(12.,7.5,10.5); off=vec3(0.);   A=1.8; T=.08;'),
      ('mix(.09,.14,smoothstep(.3,.9,gp)):.07',
       'mix(.035,.055,smoothstep(.3,.9,gp)):.035'),
      ('ru=.26*noise3(q*.33+5.)','ru=.13*noise3(q*.33+5.)'),
      ('ru+=.8*noise3(q*.14+11.)','ru+=.16*noise3(q*.14+11.)'),
      ('ru+=.45*(.35-abs(noise3(q*.29+23.)))','ru+=.13*(.35-abs(noise3(q*.29+23.)))'),
      ('ru+=1.3*(.35-abs(noise3(vec3(q.x*.17,q.y*.024,q.z*.17)+17.)))',
       'ru+=.70*(.35-abs(noise3(vec3(q.x*.17,q.y*.024,q.z*.17)+17.)))'),
      ('+fl*1.5*gRkSl+ru','+fl*.8*gRkSl+ru'),
    ]
    for before,after in changes:
        if new.count(before)!=1:
            raise ValueError('Limestone relief anchor changed: '+before)
        new=new.replace(before,after)
    report={'revision':REVISION,'function':'rockField','changes':len(changes),
      'sourceSHA256':hashlib.sha256(old.encode()).hexdigest(),
      'resultSHA256':hashlib.sha256(new.encode()).hexdigest(),
      'scope':'Larger unequal planar block faces, shorter risers, restrained rounded knobs; full source terrain/mesh sampling resolution unchanged',
      'externalAssets':0,'gpuReviewed':False}
    source=source[:begin]+new+source[end:]
    begin,end,terrain=_functions(source,'terrSD')[0]
    old_terrain=terrain
    anchor='  if(d>=12.+1.5*gEpsM){ steepW=0.; return d-10.; }'
    assert terrain.count(anchor)==1
    terrain=terrain.replace(anchor,anchor+'\n  float liReliefBase=d;')
    anchor='if(rw>.01) d=(d-rockDisp(p)*rw*.9*sqrt((1.+s2r)/(1.+max(s2,ms*ms))))*mix(1.,.6,rw);'
    assert terrain.count(anchor)==1
    terrain=terrain.replace(anchor,'''if(rw>.01){
      float liPerpendicularOffset=rockDisp(p)*rw*.9*sqrt((1.+s2r)/(1.+max(s2,ms*ms)));
      // Include bicubic correction in the same explicit bound. A new rock
      // face cannot cross zero outside the existing 12m early-out slab.
      float liCombinedOffset=clamp(liReliefBase-d+liPerpendicularOffset,-10.,10.);
      d=(liReliefBase-liCombinedOffset)*mix(1.,.6,rw);
    }''')
    report['terrainCombinedOffsetBound']=[-10,10]
    report['terrainOffsetSHA256']=hashlib.sha256(terrain.encode()).hexdigest()
    report['terrainOriginalSHA256']=hashlib.sha256(old_terrain.encode()).hexdigest()
    return source[:begin]+terrain+source[end:],report
