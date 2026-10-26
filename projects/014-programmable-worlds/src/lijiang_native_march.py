"""Refine native terrain ray hits without treating a step bound as a surface.

The retained renderer divides height residuals by a conservative neighbourhood
maximum slope. That is suitable for safe travel, but its small positive value
does not establish a hit on a sheer karst wall. This patch changes only march
and inserts one local refinement helper; tree/branch/leaf primary hits retain
the original three-step refinement. No GPU or external asset is used here.
"""
from __future__ import annotations

import hashlib
import math
import re

REVISION = 'native-terrain-sign-root-4'


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def _body_end(source: str, start: int) -> int:
    depth, i = 0, start
    while i < len(source):
        if source.startswith('//', i):
            p = source.find('\n', i+2)
            i = len(source) if p < 0 else p+1
            continue
        if source.startswith('/*', i):
            p = source.find('*/', i+2)
            if p < 0:
                raise ValueError('Unclosed shader comment')
            i = p+2
            continue
        if source[i] == '{':
            depth += 1
        elif source[i] == '}':
            depth -= 1
            if depth == 0:
                return i+1
        i += 1
    raise ValueError('Unclosed shader function')


def _functions(source: str, name: str) -> list[tuple[int,int,str]]:
    result = []
    pattern = re.compile(r'(?m)^[ \t]*(?:float|bool|vec[234]|void)\s+'+re.escape(name)+r'\s*\(')
    for m in pattern.finditer(source):
        i, depth = m.end(), 1
        while i < len(source) and depth:
            depth += (source[i] == '(')-(source[i] == ')')
            i += 1
        while i < len(source) and source[i].isspace():
            i += 1
        if i >= len(source) or source[i] != '{':
            continue
        end = _body_end(source,i)
        result.append((m.start(),end,source[m.start():end]))
    return result


def _native_boxes(source: str) -> list[tuple[tuple[float,...],tuple[float,...]]]:
    """Recover the generated independent-peak envelope, not old ocean data."""
    arrays=[]
    for name in ('LI_P','LI_Q'):
        match=re.search(r'const\s+vec4\s+'+name+r'\[(\d+)\]\s*=\s*vec4\[\1\]\((.*?)\);',source,re.S)
        if not match:
            raise ValueError('Missing native peak envelope '+name)
        values=[tuple(map(float,v.split(','))) for v in re.findall(r'vec4\(([^)]+)\)',match[2])]
        if len(values)!=int(match[1]) or any(len(v)!=4 for v in values):
            raise ValueError('Invalid native peak array '+name)
        arrays.append(values)
    if len(arrays[0])!=len(arrays[1]) or not 60<=len(arrays[0])<=90:
        raise ValueError('Unexpected native peak count')
    boxes=[]
    for p,q in zip(*arrays):
        x,z,height,rx=p
        rz,angle,_,_=q
        c,s=math.cos(angle),math.sin(angle)
        # The authored foot is bounded at 1.20 before domain warp; 1.28 plus
        # 48 m also covers final height filtering, rock and crown reach.
        ex=1.28*math.hypot(rx*c,rz*s)+48.
        ez=1.28*math.hypot(rx*s,rz*c)+48.
        boxes.append(((x-ex,60.,z-ez),(x+ex,height*1.3+80.,z+ez)))
    return boxes


def _bounds_glsl(boxes: list[tuple[tuple[float,...],tuple[float,...]]]) -> str:
    def vector(values):
        return 'vec3('+','.join(f'{v:.7f}' for v in values)+')'
    lower=','.join(vector(lo) for lo,_ in boxes)
    upper=','.join(vector(hi) for _,hi in boxes)
    return r'''
// Conservative high-altitude search bounds from the independent native peaks.
// Lowland forest stays on the retained source path below y=60 m.
const vec3 LI_RAY_LO[COUNT]=vec3[COUNT](LOWER);
const vec3 LI_RAY_HI[COUNT]=vec3[COUNT](UPPER);
bool liNativePeakInterval(vec3 ro,vec3 rd,float tmin,float tmax,out float enter,out float leave){
  vec3 direction=mix(vec3(-1.),vec3(1.),step(vec3(0.),rd));
  vec3 inverse=direction/max(abs(rd),vec3(1e-8));
  enter=1e30;leave=-1e30;
  for(int j=uZero;j<COUNT;j++){
    vec3 ta=(LI_RAY_LO[j]-ro)*inverse,tb=(LI_RAY_HI[j]-ro)*inverse;
    vec3 near=min(ta,tb),far=max(ta,tb);
    float a=max(tmin,max(near.x,max(near.y,near.z)));
    float b=min(tmax,min(far.x,min(far.y,far.z)));
    if(b>=a){enter=min(enter,a);leave=max(leave,b);}
  }
  return leave>=enter;
}
'''.replace('COUNT',str(len(boxes))).replace('LOWER',lower).replace('UPPER',upper).strip()


# A state machine keeps only one new sceneSD call site. This matters because
# D3D shader compilers inline the very large retained forest/rock SDF graph.
REFINER = r'''
// native-terrain-sign-root-3
// Signed zero finding is independent of the conservative distance scale.
// The LOD footprint stays fixed throughout one local bracket, so all samples
// refer to the same scene field rather than a moving LOD surface.
bool liNativeGroundRoot(vec3 ro,vec3 rd,float start,float far,float exterior,
                       float initialD,vec4 initialInf,
                       out float hitT,out vec4 hitInf,out float resumeT){
  hitT=start;hitInf=initialInf;resumeT=start;
  float pixel=max(gPix,.005);
  float treeEps=pixel*.45;
  float tolerance=clamp(pixel*.14,.012,.12);
  float probe=clamp(pixel*.27,.04,.45);
  float stepLimit=clamp(pixel*3.,.35,3.);
  float travelLimit=min(far,start+clamp(pixel*96.,18.,96.));
  float positiveT=start,positiveD=initialD;
  float previousT=start,previousD=initialD;
  float a=start,b=start,da=initialD,db=initialD;
  float sampleT=min(start+probe,travelLimit);
  int phase=0; // 0 forward secant; 1 sign bracket; 2 final metadata refresh; 3 tree refinement
  int treeSteps=0;
  // A negative entry brackets against the last *tested exterior point*, even
  // after a long sky/terrain jump. It must not search only 36 m behind a point
  // hundreds of metres inside a narrow independent peak.
  bool needExterior=initialD<=0.;
  float backtrack=max(probe,tolerance*2.);
  if(needExterior){
    if(exterior>=0.&&exterior<start)backtrack=max(backtrack,start-exterior);
    sampleT=max(0.,start-backtrack);
  }
  for(int k=uZero;k<80;k++){
    gEpsM=0.;
    vec4 info;
    float value=sceneSD(ro+rd*sampleT,info);
    if(phase==2){hitT=sampleT;hitInf=info;return true;}
    if(phase==3){
      treeSteps--;
      if(treeSteps>0){sampleT+=value*.9;continue;}
      if(info.w>.5){
        if(value<treeEps){hitT=sampleT;hitInf=info;return true;}
        resumeT=sampleT;return false;
      }
      // A tree candidate can switch back to the conservative terrain field
      // during those corrections. It then needs the same ground sign proof;
      // accepting it as a tree would reintroduce the floating cliff shelves.
      phase=0;
    }
    if(needExterior){
      if(value>0.){
        a=sampleT;da=value;b=start;db=initialD;phase=1;needExterior=false;
      }else{
        if(sampleT==0.)return false;
        backtrack*=2.;sampleT=max(0.,start-backtrack);
        continue;
      }
    }else if(phase==1){
      if(value>0.){a=sampleT;da=value;}else{b=sampleT;db=value;}
    }else{
      if(value<=0.){
        a=positiveT;da=positiveD;b=sampleT;db=value;phase=1;
      }else{
        // Tree/branch/leaf candidates keep the retained renderer's exact
        // three corrections. A sign-changing probe instead gets the bracket.
        if(info.w>.5&&value<treeEps){
          phase=3;treeSteps=3;sampleT+=value*.9;continue;
        }
        resumeT=sampleT;positiveT=sampleT;positiveD=value;
        if(sampleT>=travelLimit)return false;
        float derivative=(value-previousD)/max(sampleT-previousT,1e-5);
        // Slight overshoot obtains a sign bracket rather than asymptotically
        // accepting a tiny positive lower bound as the visible surface.
        float advance=derivative<-.00001?value/(-derivative)*1.12:probe;
        advance=clamp(advance,probe,stepLimit);
        previousT=sampleT;previousD=value;
        sampleT=min(sampleT+advance,travelLimit);
        continue;
      }
    }
    if(phase==1){
      // Safeguarded secant: retain both signs and contract even when a noise
      // derivative or a material switch makes the local field nonlinear.
      float width=b-a;
      float zero=(a*db-b*da)/min(db-da,-1e-20);
      if(width<=tolerance){
        sampleT=clamp(zero,a,b);phase=2;continue;
      }
      sampleT=clamp(zero,a+width*.2,b-width*.2);
    }
  }
  // No sign bracket / no converged crossing means no hit. The caller resumes
  // conservative travel; a finite iteration budget is never a surface.
  return false;
}
'''.strip()


MARCH = r'''
bool march(vec3 ro,vec3 rd,float tmin,float tmax,out float tHit,out vec4 inf){
  float t=tmin;
  float pk=uTan*2./uRes.y*pkDbg();
  inf=vec4(0);
  bool inEnv=false;
  int activeIter=0;
  float lastExterior=-1.;
  float peakEnter,peakLeave;
  bool peakRay=liNativePeakInterval(ro,rd,tmin,tmax,peakEnter,peakLeave);
  float lowland=rd.y<-.00000001?(60.-ro.y)/rd.y:1e30;
  for(int i=uZero;i<3000;i++){
    gIt=float(i);
    if(t>tmax){gWhy=1.;gEpsM=0.;return false;}
    vec3 p=ro+rd*t;
    float nativeGround=H(p.xz);
    float hgt=p.y-nativeGround;
    if(hgt>ENV){
      lastExterior=t;
      float advance=max((hgt-ENV)*.5,.3+t*.0015);
      if(p.y>60.){
        // A large vertical gap does not bound distance to an isolated peak.
        // Jump across certified empty sky only; inside the possible peak
        // aggregate the cheap height samples advance at most four metres.
        if(!peakRay||t>peakLeave){
          if(rd.y>=0.||lowland>tmax){gWhy=1.;gEpsM=0.;return false;}
          t=max(t+.0001,lowland);inEnv=false;continue;
        }
        if(t<peakEnter){
          t=max(t+.0001,min(peakEnter,lowland));inEnv=false;continue;
        }
        advance=min(advance,4.);
        if(lowland>t)advance=min(advance,lowland-t);
      }
      t+=advance;inEnv=false;continue;
    }
    inEnv=true;
    gPix=t*pk;gVeg=t<uVegRange;
    // Air-only height samples must not enlarge true scene-field tolerances.
    // Keep total i/gIt for budgets and diagnostics; count only active work.
    float nativeIteration=float(activeIter);activeIter++;
    gEpsM=gPix*(.6+nativeIteration*.004);
    float d=sceneSD(p,inf);
    if(d>0.)lastExterior=t;
    float eps=gPix*(.6+nativeIteration*(inf.w>3.5&&inf.w<4.5?.0015:.004));
    if(d<eps){
      // The source treatment is already correct on gentle ground. Only the
      // large conservative slope factors of cliffs require a signed root.
      float nativeMaxSlope=textureLod(uMS,(p.xz-uRect.xy)*uRect.w,0.).r;
      if(nativeMaxSlope<1.8&&nativeGround>.25&&nativeGround<35.){
        for(int k=uZero;k<3;k++){t+=d*.9;d=sceneSD(ro+rd*t,inf);}
        tHit=t;gEpsM=0.;gCarpHit=gCarpIn;return true;
      }
      if(inf.w>.5){
        // Candidate search may be generous, but an actual crown/branch/leaf
        // hit cannot grow from subpixel to 5+ pixels with march iteration.
        float treeEps=max(gPix,.005)*.45;
        if(d>=treeEps){t+=max(d*.8,treeEps*.25);continue;}
        // Preserve the original three source corrections and tree geometry.
        for(int k=uZero;k<3;k++){t+=d*.9;d=sceneSD(ro+rd*t,inf);}
        if(inf.w>.5){
          if(d<treeEps){tHit=t;gEpsM=0.;gCarpHit=gCarpIn;return true;}
          t+=max(d*.8,treeEps*.25);continue;
        }
        // Material switched to ground: no unconditional tree-path return.
      }
      float refinedT,resumeT;vec4 refinedInf;
      if(liNativeGroundRoot(ro,rd,t,tmax,lastExterior,d,inf,refinedT,refinedInf,resumeT)){
        tHit=refinedT;inf=refinedInf;gEpsM=0.;gCarpHit=gCarpIn;return true;
      }
      t=max(t+max(gPix*.18,.025),resumeT);
      continue;
    }
    t+=max(d*.8,eps*.5);
  }
  // Removed the source's "budget exhausted inside vegetation => hit" rule.
  // In particular an unproven point above a steep wall cannot become a slab.
  gWhy=3.;gEpsM=0.;return false;
}
'''.strip()


PRESERVE = (
    'landH','terrSD','sceneSD','H','Hc','treesSD','bushSD','crownSD',
    'leafyShade','rockField','rockAlbedo','sceneNormal','sceneAO','shadeScene',
    'shadow','shadowH','skyView','skyDome','skyIrr','skyFill','fogApply',
    'oceanH','waterHit','shadeWater','waterEdge',
)


def patch(source: str) -> tuple[str,dict]:
    """Return candidate source and a narrowly scoped, explicit transform audit."""
    if 'bool liNativeGroundRoot(' in source:
        raise ValueError('Native terrain root patch already applied')
    before=source
    retained={name:[_sha(body) for _,_,body in _functions(source,name)] for name in PRESERVE}
    if any(not hashes for hashes in retained.values()):
        raise ValueError('Expected full source land/forest/sky/river functions missing')
    found=_functions(source,'march')
    if len(found)!=1:
        raise ValueError(f'Expected one source march definition; found {len(found)}')
    a,b,old=found[0]
    expected='if(inEnv){ tHit=t; gWhy=4.; gCarpHit=gCarpIn; return true; }'
    if expected not in old or 'if(d<eps)' not in old:
        raise ValueError('Source march hit/budget boundaries changed; inspect first')
    boxes=_native_boxes(source)
    bounds=_bounds_glsl(boxes)
    source=source[:a]+bounds+'\n\n'+REFINER+'\n\n'+MARCH+source[b:]
    old_order='''  if(tmin<far) hitT=march(ro,rd,tmin,far,tT,inf);
  float tW; bool hitW=waterHit(ro,rd,hitT?tT:far,tW);'''
    new_order='''  float tW=1e9; bool waterCandidate=waterHit(ro,rd,far,tW);
  if(tmin<far) hitT=march(ro,rd,tmin,waterCandidate?min(tW,far):far,tT,inf);
  bool hitW=waterCandidate&&(!hitT||tW<tT);'''
    if source.count(old_order)!=1:
        raise ValueError('Native water-first primary-ray boundary changed')
    source=source.replace(old_order,new_order,1)
    for name,hashes in retained.items():
        if [_sha(body) for _,_,body in _functions(source,name)]!=hashes:
            raise ValueError('Native march patch touched retained function '+name)
    report={
        'schema':'lijiang-native-march-transform-v1','revision':REVISION,
        'inputSha256':_sha(before),'outputSha256':_sha(source),
        'replacedFunction':{'name':'march','originalSha256':_sha(old),'replacementSha256':_sha(MARCH)},
        'addedFunction':{'name':'liNativeGroundRoot','sha256':_sha(REFINER)},
        'peakSearch':{'function':'liNativePeakInterval','sha256':_sha(bounds),'peakCount':len(boxes),'footRadius':1.28,'horizontalPaddingMetres':48,'heightEnvelope':'peakHeight*1.3+80','coarseStepInsideAggregateMetres':4,'lowlandBoundaryMetres':60,'outsideAggregate':'Jump to ray entry or downward y60 boundary; upward empty sky exits immediately.'},
        'preservedFunctionSha256':retained,
        'rationale':'A conservative max-slope distance bounds travel but does not prove surface proximity.',
        'steepSlopeThreshold':1.8,
        'activeIteration':'Only environment sceneSD visits increment the epsilon index; pure high-air H samples keep tolerances unchanged. Total gIt and 3000-step budget are retained.',
        'sourceFastGroundHeightRange':[.25,35.],
        'primaryWaterOrder':'Test the same physical water surface first, cap primary terrain traversal at it, preserve real above-water occlusion and avoid marching the submerged bed twice.',
        'groundHit':'Only gentle dry lowland retains the source correction; high, steep or submerged candidates use directional secant/Newton seeks a positive/negative sceneSD bracket, safeguarded secant contracts it, final exact point refreshes all source material state.',
        'rootToleranceMetres':{'minimum':.012,'maximum':.12,'pixelFraction':.14},
        'primaryTrees':'On gentle ground original source acceptance retained. On steep terrain original three correction steps and crown/branch/leaf geometry retained; actual acceptance capped at 0.45 pixel independent of iteration count. Any final switch to ground requires the terrain sign bracket.',
        'treeThresholdPixelFraction':.45,
        'negativeEntry':'Bracket from the last tested exterior ray point; exponential backtracking is a fallback when no exterior point was supplied.',
        'limits':{'marchIterations':3000,'groundRefinementSamples':80,'maximumRefinementAdvanceMetres':3,'maximumLocalTravelMetres':96},
        'exhaustion':'No invented hit on march/refinement budget exhaustion.',
        'shaderCompiler':'One additional sceneSD call site in a non-unrolled state loop.',
        'gpuStarted':False,'qualityStatus':'candidate; actual GPU frame required',
    }
    return source,report
