"""Build the independent Lijiang candidate from the preserved Napali renderer.

No model/image data is consumed. The full original land renderer, height detail,
tree geometry, shadows and sky remain source derived. This script deliberately
does not edit the retained original or assert that the artwork has passed QA.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import random
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'web/runtime/index.html'
OUTPUT = ROOT / 'web/lijiang-m3/engine.html'
EXPECTED_SOURCE_SHA = '1e6235db469ff444cac6a81a6740e1e88656796f7bdf745d758f2344649a6037'
REVISION = 'lijiang-m3-planar-karst-1'


def sha(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def replace_once(source: str, before: str, after: str) -> str:
    if source.count(before) != 1:
        raise ValueError(f'Expected exactly one native patch boundary: {before[:100]!r}')
    return source.replace(before, after, 1)


def literal(source: str, name: str) -> tuple[int, int, str]:
    match = re.search(r'\bconst\s+' + re.escape(name) + r'\s*=\s*[^`\n]*(`(?:\\.|[^`])*`)', source, re.S)
    if not match:
        raise ValueError(f'Missing source literal {name}')
    return match.start(1), match.end(1), match.group(1)


def replace_literal(source: str, name: str, body: str) -> str:
    a, b, _ = literal(source, name)
    return source[:a] + '`' + body + '`' + source[b:]


def between(source: str, start: str, end: str, replacement: str) -> str:
    if source.count(start) != 1 or source.count(end) != 1:
        raise ValueError(f'Ambiguous source boundaries: {start} / {end}')
    a = source.index(start)
    b = source.index(end, a)
    return source[:a] + replacement + source[b:]


def smooth(a: float, b: float, x: float) -> float:
    t = max(0., min(1., (x-a)/(b-a)))
    return t*t*(3.-2.*t)


def river_center(z: float) -> float:
    return 46*math.sin((z+140)*.00168)+28*math.sin((z-70)*.0031)-430*(1-smooth(-1350,-350,z))


def river_width(z: float) -> float:
    return 340*(1+.11*math.sin(z*.0013-.4)+.055*math.cos(z*.0037))


def river_clearance(peak: list[float]) -> float:
    x, z, _, rx, rz, angle, *_ = peak
    c, s = math.cos(angle), math.sin(angle)
    clear = float('inf')
    for i in range(240):
        t = i*2*math.pi/240
        qx, qz = 1.28*rx*math.cos(t), 1.28*rz*math.sin(t)
        px, pz = x+c*qx-s*qz, z+s*qx+c*qz
        clear = min(clear, abs(px-river_center(pz))-river_width(pz)/2)
    return clear


def make_peaks() -> list[list[float]]:
    # Deliberately composed foreground/middle groups; unequal heights, axes and
    # side shoulders. Every complete foot ellipse is separated from the river.
    authored = [
        [575,-170,358,222,194,-.22,0,2.1],
        [835,-560,422,210,248,.24,1,5.7],
        [360,-1120,344,165,190,-.42,2,1.5],
        [830,-1360,446,245,255,.35,3,4.3],
        [-610,-440,294,175,215,-.30,1,7.3],
        [-1010,-900,405,242,255,.42,2,3.2],
        [-1390,-1500,369,230,205,-.53,0,9.1],
        [-445,720,238,160,206,.38,3,2.5],
        [555,775,288,205,238,-.27,2,6.2],
        [1220,120,385,258,205,.55,0,4.9],
        [-1080,260,336,230,200,-.32,3,8.7],
        [150,-1850,323,170,192,.28,1,5.4],
    ]
    for p in authored:
        if river_clearance(p) < 28:
            raise ValueError(f'Composed peak intersects river envelope: {p}')
    peaks = authored[:]
    rng = random.Random(20261025)
    for _ in range(16000):
        if len(peaks) == 76:
            break
        x, z = rng.uniform(-2180,2180), rng.uniform(-2200,2120)
        rx, rz = rng.uniform(70,155), rng.uniform(80,175)
        p = [x,z,rng.uniform(145,345),rx,rz,rng.uniform(-math.pi,math.pi),rng.randrange(4),rng.uniform(0,20)]
        if abs(x)+max(rx,rz)*1.3>2350 or abs(z)+max(rx,rz)*1.3>2350:
            continue
        if river_clearance(p) < 38:
            continue
        # Allow occasional linked feet, but never a repeated forest of cones.
        if any(math.hypot((x-q[0])/(rx+q[3]),(z-q[1])/(rz+q[4])) < .76 for q in peaks):
            continue
        peaks.append(p)
    if not 60 <= len(peaks) <= 90:
        raise ValueError(f'Insufficient independent peaks: {len(peaks)}')
    return peaks


RIVER_JS = r'''
// Metre-scale inland river, independent of the retained ocean coast trace.
function liSmooth(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
function lijiangRiverCenter(z){return 46*Math.sin((z+140)*.00168)+28*Math.sin((z-70)*.0031)-430*(1-liSmooth(-1350,-350,z));}
function lijiangRiverWidth(z){return 340*(1+.11*Math.sin(z*.0013-.4)+.055*Math.cos(z*.0037));}
function buildCoastSegments(){
  const segs=[];
  for(const side of [-1,1])for(let z=-3000;z<3000;z+=24){
    const b=z+24;
    segs.push(lijiangRiverCenter(z)+side*lijiangRiverWidth(z)/2,z,lijiangRiverCenter(b)+side*lijiangRiverWidth(b)/2,b);
  }
  const d=(lijiangRiverCenter(101)-lijiangRiverCenter(99))/2,l=Math.hypot(d,1);
  return{segs:new Float32Array(segs),n:segs.length/4,coastDir:[d/l,1/l],inland:[1/l,-d/l]};
}
function buildValleys(){
  const empty=()=>new Float32Array(4);
  return{S:empty(),P:empty(),n:0,SH:empty(),nSH:0,BZ:empty(),nBZ:0,CH:empty(),nCH:0,MS:empty(),nMS:0};
}
'''

COAST_CPU = r'''function coastSDF(S,nSeg,N){
  const data=new Float32Array(N*N),cell=RECT[2]/N;
  for(let j=0;j<N;j++){
    const z=RECT[1]+(j+.5)*cell,c=lijiangRiverCenter(z),w=lijiangRiverWidth(z)/2;
    const slope=(lijiangRiverCenter(z+1)-lijiangRiverCenter(z-1))*.5,inv=1/Math.hypot(slope,1);
    for(let i=0;i<N;i++)data[j*N+i]=(Math.abs(RECT[0]+(i+.5)*cell-c)-w)*inv;
  }
  return data;
}

// Preserve independent peak silhouettes while retaining local erosion relief
// and its drainage/AO channels. This is a new pass, not a simplified FS_HEIGHT.
const FS_NATIVE_ANCHOR=GLSL_COMMON+`
uniform sampler2D uS,uBase;out vec4 o;
float liAnchorBase(ivec2 p){return texelFetch(uBase,clamp(p,ivec2(0),textureSize(uBase,0)-1),0).r;}
void main(){
  ivec2 ic=ivec2(gl_FragCoord.xy);vec4 e=texelFetch(uS,ic,0);
  float b=texelFetch(uBase,ic,0).r;
  // Roughly 24 m convexity protects actual summit/spur crests while the
  // hydraulic field retains its spatial differences along hollows and walls.
  const int r=6;
  float ring=(liAnchorBase(ic+ivec2(r,0))+liAnchorBase(ic-ivec2(r,0))+
              liAnchorBase(ic+ivec2(0,r))+liAnchorBase(ic-ivec2(0,r))+
              liAnchorBase(ic+ivec2(r,r))+liAnchorBase(ic+ivec2(-r,r))+
              liAnchorBase(ic+ivec2(r,-r))+liAnchorBase(ic-ivec2(r,r)))*.125;
  float crest=smoothstep(2.5,15.,b-ring);
  float protection=mix(1.,.25,crest),raw=e.r-b;
  float cutLimit=min(62.,max(b-12.,0.)*.20)*protection;
  // Linear retention preserves genuine drainage relief; the former +/-9 m
  // saturation reduced most of the 4000-step erosion to a constant offset.
  float delta=raw<0.?max(raw*.20*protection,-cutLimit):min(raw*.35,5.);
  e.r=b<0.?b:b+delta*smoothstep(12.,55.,b);
  o=e;
}`;

'''

VEGETATION = r'''
uniform sampler2D uH,uA;uniform vec4 uRect;uniform vec2 uRes;uniform vec4 uVGM;uniform vec4 uBZ[4];uniform int uNBZ;
out vec4 o;
float Hs(vec2 p){return textureLod(uH,(p-uRect.xy)*uRect.w,0.).r;}
void main(){
  vec2 p=uRect.xy+gl_FragCoord.xy/uRes*uRect.z;float h=Hs(p),d=coastD(p);
  if(d<0.||h<.3){o=vec4(0.);return;}
  const float e=1.8;
  vec3 n=normalize(vec3(Hs(p-vec2(e,0))-Hs(p+vec2(e,0)),2.*e,Hs(p-vec2(0,e))-Hs(p+vec2(0,e))));
  float slope=1.-n.y;
  vec4 at=textureLod(uA,(p-uRect.xy)*uRect.w,0.);
  float n1=fbm(p*.013+7.1,3),n2=fbm(p*.055+19.,3);
  float moisture=.5+.5*fbm(p*.008+vec2(3.7,h*.006),3);
  float maxSlope=.76+.08*n1+.06*n2+.08*moisture+.04*at.a;
  float cover=1.-smoothstep(maxSlope-.12,maxSlope+.07,slope+.04*vnoise(p*.2));
  // Riverbanks have fresh-water riparian forest, no salt-spray bare zone,
  // beach-sand ecology, coral or coconut-palm species.
  float rockPatch=smoothstep(.25,.7,fbm(p*.021+vec2(h*.012,31.),3)+.4)*smoothstep(.46,.84,slope);
  cover*=1.-.48*rockPatch;
  cover*=smoothstep(.35,2.1,h)*smoothstep(.8,5.,d);
  const float eb=9.;
  float slB=length(vec2(Hs(p+vec2(eb,0))-Hs(p-vec2(eb,0)),Hs(p+vec2(0,eb))-Hs(p-vec2(0,eb))))/(2.*eb);
  float disp=cover*(1.-smoothstep(.6,1.5,slB+.18*n2-.25*at.a));
  o=vec4(cover,0.,0.,disp);
}'''


def peak_glsl(peaks: list[list[float]]) -> str:
    def floats(values: list[float]) -> str:
        return ','.join(f'{v:.6f}' for v in values)
    a = ',\n'.join('vec4('+floats(p[:4])+')' for p in peaks)
    b = ',\n'.join('vec4('+floats(p[4:])+')' for p in peaks)
    return r'''
uniform vec4 uRect; uniform vec2 uRes;
uniform vec4 uVS[24],uVP[24];uniform int uNV;uniform vec4 uSH[8];uniform int uNSH;
uniform float uMtnH,uMtnL,uVW;uniform vec4 uBZ[4];uniform int uNBZ;uniform vec4 uCH[16];uniform int uNCH;uniform vec4 uMS[4];uniform int uNMS;
const vec4 LI_P[NPEAKS]=vec4[NPEAKS](PEAK_A);
const vec4 LI_Q[NPEAKS]=vec4[NPEAKS](PEAK_B);
float liLobe(vec2 q,vec2 centre,vec2 axes,float shoulder){
  vec2 v=(q-centre)/axes;
  // Rounded tip with a continuously inclined upper face. The unequal lobes
  // have independent summits and axes, rather than a common flat cliff cap.
  float r=(sqrt(dot(v,v)+.0064)-.08)/.92;
  return shoulder*pow(max(0.,1.-pow(max(r,0.),1.38)),.64);
}
float liJoin(float a,float b,float k){
  float h=clamp(.5+.5*(a-b)/k,0.,1.);
  return mix(b,a,h)+k*h*(1.-h);
}
float liSpur(vec2 q,vec2 origin,float angle,float axial,float lateral,float height){
  vec2 axis=vec2(cos(angle),sin(angle));
  vec2 v=q-origin;
  vec2 local=vec2(dot(v,axis),dot(v,vec2(-axis.y,axis.x)));
  return liLobe(local,vec2(.30,0.),vec2(axial,lateral),height);
}
float liGully(vec2 q,vec2 origin,float angle,float width,float phase){
  vec2 axis=vec2(cos(angle),sin(angle)),v=q-origin;
  float along=dot(v,axis),across=dot(v,vec2(-axis.y,axis.x));
  across-=.024*sin(along*5.3+phase)+.012*sin(along*11.+phase*.7);
  float channel=exp(-(across*across)/(width*width));
  return channel*smoothstep(.14,.30,along)*(1.-smoothstep(.76,1.04,along));
}
float baseLand(vec2 p){
  float d=coastD(p);
  if(d<0.)return -1.1-min(10.,-d*.055);
  float plain=2.1+3.8*(.5+.5*fbm(p*.006+1.7,3))+.8*vnoise(p*.023);
  plain*=smoothstep(0.,11.,d);
  float height=plain;
  for(int i=uZero;i<NPEAKS;i++){
    vec4 a=LI_P[i],b=LI_Q[i];vec2 dp=p-a.xy;
    float extent=max(a.w,b.x)*1.4;
    if(abs(dp.x)>extent||abs(dp.y)>extent)continue;
    float c=cos(b.y),s=sin(b.y);
    vec2 q=vec2(c*dp.x+s*dp.y,-s*dp.x+c*dp.y)/vec2(a.w,b.x);
    float footRadius=length(q);
    if(footRadius>=1.20)continue;
    float ph=b.w,kind=b.z;
    q+=.032*vec2(vnoise(p*.015+ph),vnoise(p*.014+ph+13.));
    float angle=atan(q.y,q.x);
    q*=1.+.026*sin(angle*3.+ph)+.016*sin(angle*7.+ph*2.);
    if(length(q)>1.22)continue;
    vec2 centreA=vec2(.14+.035*sin(ph),-.05+.07*cos(ph*1.7));
    vec2 axesA=vec2(.72+.045*sin(ph*2.),.87+.035*cos(ph));
    vec2 centreB=vec2(-.36+.03*cos(ph),.12+.07*sin(ph));
    vec2 axesB=vec2(.66,.68+.035*sin(ph*1.3));
    float heightB=.69+.15*step(1.5,kind);
    // A real second lobe wins near its own summit. Types 2/3 form a stronger
    // paired ridge, while 0/1 keep a lower, off-axis side shoulder.
    float peakA=liLobe(q,centreA,axesA,1.);
    float peakB=liLobe(q,centreB,axesB,heightB);
    float peakC=liLobe(q,vec2(.02,.43),vec2(.45,.63),.48+.07*sin(ph));
    float body=liJoin(liJoin(peakA,peakB,.035),peakC,.025);
    // Two real unequal, differently oriented lower ridges. They join beneath
    // the summit and project separate buttresses through the lower wall,
    // producing distinct face normals and actual mutual occlusion.
    float direction=ph*1.11+kind*.31;
    float spurA=liSpur(q,centreA,direction+.58,.71,.18+.025*sin(ph),.72);
    float spurB=liSpur(q,centreA,direction-.72,.62,.215,.61+.04*cos(ph));
    body=liJoin(liJoin(body,spurA,.02),spurB,.018);
    // Metre-scale, nonperiodic geological couloirs run from unequal shoulder
    // positions towards the foot; these are height-field cuts, not albedo.
    float width=clamp(13./min(a.w,b.x),.045,.115);
    float channels=liGully(q,centreA,direction,width,ph);
    channels+=.78*liGully(q,centreA,direction+1.76+.10*sin(ph),width*1.3,ph+4.);
    channels+=.60*liGully(q,centreB,direction+3.98+.12*cos(ph),width*.85,ph+9.);
    float depth=min(42.,max(14.,a.z*(.06+.03*sin(ph))));
    body=max(0.,body-(depth/a.z)*channels*smoothstep(.12,.25,body));
    // The unwarped foot is explicitly bounded, so all new ridges and cuts
    // remain strictly inside the already CPU-verified 1.28 river envelope.
    body*=smoothstep(1.20,1.08,footRadius);
    float h=a.z*(uMtnH/320.)*body;
    height=max(height,plain+h);
  }
  return height;
}'''.replace('NPEAKS',str(len(peaks))).replace('PEAK_A',a).replace('PEAK_B',b)


def build(air_accel: bool = False) -> dict:
    original = SOURCE.read_text(encoding='utf-8')
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED_SOURCE_SHA:
        raise ValueError('Preserved runtime source hash changed; inspect before rebuilding.')
    from lijiang_m3_landform import build_peak_glsl
    import lijiang_native_ecology as ecology
    from lijiang_native_atmosphere import patch as patch_atmosphere
    peaks = make_peaks()
    source = original
    source = replace_once(source,'<title>Na Pali · 完整原始渲染交互版</title>','<title>漓江 · 原生完整渲染派生候选</title>')
    source = source.replace('href="controller.css"','href="../runtime/controller.css"').replace('src="controller.js"','src="../runtime/controller.js"')
    license_text = (ROOT/'web/upstream/LICENSE').read_text(encoding='utf-8')
    source = replace_once(source,'<!doctype html>','<!doctype html>\n<!--\nDerived from Leonxlnx/napali; independent procedural Lijiang terrain.\n'+license_text+'\n-->')
    source = replace_once(source,'</head>','<style>.runtime-ui{display:none!important}</style>\n</head>')
    source = between(source,'// Traced waterline (image space, px).','// ============================================================================\n//  GLSL',RIVER_JS+'\n')
    source = replace_literal(source,'BASE_FUNCS',build_peak_glsl(peaks))
    _,_,erosion = literal(source,'FS_ERODE')
    if erosion.count('hn=max(hn,.6+.04*cd);') != 1:
        raise ValueError('Erosion floor source changed')
    source = replace_literal(source,'FS_ERODE',erosion[1:-1].replace('hn=max(hn,.6+.04*cd);','hn=max(hn,.6+.004*cd);'))
    source = replace_literal(source,'FS_VEG',ecology.VEGETATION)
    _,_,plants = literal(source,'FS_PLANTS')
    body = ecology.patch_plants(plants[1:-1])
    source = replace_literal(source,'FS_PLANTS',body)
    source = replace_once(source,"rough: num('rough', 70)","rough: num('rough', 18)")
    source = replace_once(source,'const RECT = [-2400, -700, 4800];','const RECT = [-2400, -2400, 4800];')
    source = replace_once(source,'const SPLR = [-1600, -200, 3200];','const SPLR = [-2000, -2000, 4000];')
    source = between(source,'function coastSDF(S, nSeg, N) {','async function generate()',COAST_CPU)
    source = replace_once(source,"if (num('vfill', 1) > 0)","if (num('vfill', 0) > 0)")
    if source.count("num('wt0', 1)") != 2:
        raise ValueError('Native reef-terrace uniform boundaries changed')
    source = source.replace("num('wt0', 1)","num('wt0', 0)")
    source = replace_once(source,"num('pk0', 1), num('pk1', .42), num('pk2', 0), 0","num('pk0', 1), 0, num('pk2', 0), 0")
    source = replace_once(source,'  // 4. final height',r'''  // Native bounded erosion: preserve independent karst topology and drainage.
  const nativeAnchorT=tex(EN,EN,gl.RGBA32F,gl.RGBA,gl.FLOAT,gl.LINEAR);
  const nativeAnchorP=await progDeferred(FS_NATIVE_ANCHOR,'FS_NATIVE_ANCHOR');
  gl.useProgram(nativeAnchorP.p);bindTex(0,world.eTex);gl.uniform1i(nativeAnchorP.u.uS,0);
  bindTex(1,ebT);gl.uniform1i(nativeAnchorP.u.uBase,1);
  await tiled(fbo(nativeAnchorT),EN,EN,512,null);await gpuWait();world.eTex=nativeAnchorT;
  // 4. final height''')
    quality_keys = [[0,65,64,1350,360,140,500,58],[9,75,70,1150,470,145,240,58],[18,80,72,920,560,145,0,58],[28,85,70,730,590,140,-100,58],[37,85,66,565,550,130,-190,58],[45,85,64,500,530,125,-200,58]]
    for key in quality_keys:
        key[1] = round(river_center(key[3])+key[1],4)
    keys = [[0,-13.1824,36,1350,380,92,450,58],[8,-4.4702,48,1280,420,120,180,58],[18,14.7384,76,1050,500,125,-100,58],[29,-5,54,830,530,75,-320,58],[38,-33,28,690,525,22,-440,58],[45,-50,16,650,520,0,-480,58]]
    cine = 'const CINE = num("qualityview",0)>0?'+json.dumps(quality_keys,separators=(',',':'))+':'+json.dumps(keys,separators=(',',':'))+';\n'
    source = between(source,'const CINE = [','// Flight path:',cine)
    source = replace_once(source,'m[0] = d[0]; m[n - 1] = 0;','m[0] = 0; m[n - 1] = 0;')
    source = replace_once(source,'  const tgt = [CS.lx(tf), CS.ly(tf), CS.lz(tf)];','  const nativePortrait=cv.width/cv.height<.85&&num("qualityview",0)<=0;\n  const tgt = nativePortrait?[575,0,-170]:[CS.lx(tf), CS.ly(tf), CS.lz(tf)];')
    source = replace_once(source,'  const fa = v3.norm(v3.sub([CS.lx(Math.max(tf - e, 0)), 0, CS.lz(Math.max(tf - e, 0))], pa)), fb = v3.norm(v3.sub([CS.lx(Math.min(tf + e, CS.end)), 0, CS.lz(Math.min(tf + e, CS.end))], pb));','  const fa = v3.norm(v3.sub(nativePortrait?[575,0,-170]:[CS.lx(Math.max(tf - e, 0)), 0, CS.lz(Math.max(tf - e, 0))], pa)), fb = v3.norm(v3.sub(nativePortrait?[575,0,-170]:[CS.lx(Math.min(tf + e, CS.end)), 0, CS.lz(Math.min(tf + e, CS.end))], pb));')
    source = replace_once(source,"sunEl: num('sunEl', 44)","sunEl: num('sunEl', num('qualityview',0)>0?44:18)")
    source = replace_once(source,'const CINE_HOLD = 4;','const CINE_HOLD = 0;')
    source = between(source,'  // exact reference camera at the end','  const sp = v3.len(v3.sub([CS.x',r'''  // Native end frame is this river camera, never the original 1000 m still.
  const settle=smoothstep(CS.end-1.5,CS.end,t);
  const fov=CS.fov(tf),R=r2,U=u2,F=f,P=pos;
''')
    source = replace_once(source,'flightCam = (t) => cineCam(t);','flightCam = (t) => cineCam(t);\nstillCam = () => cineCam(num(\'t\',45));')
    source = replace_once(source,'const dt = Math.min(Math.max(0, (now - last) / 1000), 0.1); last = now;','const dt = Math.max(0, (now - last) / 1000); last = now;')
    source = replace_once(source,"let t = clampTime(num('t', 0)), last = performance.now(), paused = false;","let t = clampTime(num('t', 0)), last = performance.now(), paused = Q.get('play')!=='1';")
    source = replace_once(source,'if (!paused) { t += dt; if (t > FLIGHT_END) t = 0; }','if (!paused) { t = Math.min(FLIGHT_END, t + dt); if (t >= FLIGHT_END) paused = true; }')
    source = replace_once(source,'      const cam = flightCam(t);','      const nativeFrameTime=t;\n      const cam = flightCam(nativeFrameTime);')
    source = replace_once(source,'      clearAcc(); await renderSample(cam, t, [0, 0], false);','      clearAcc(); await renderSample(cam, nativeFrameTime, [0, 0], false);')
    source = replace_once(source,'      present(true);\n      await gpuWait();','      present(true);\n      window.lijiangNativeCompletedFrame={sceneId:"lijiang-native",frame:frames+1,time:nativeFrameTime,width:cv.width,height:cv.height,renderWidth:R.w,renderHeight:R.h,camera:cam.pos.slice()};\n      await gpuWait();')
    # Byte-for-byte source-quality assertions precede the independently owned
    # river patch. Height detail, tree SDFs, lighting, forest and sky are intact.
    preserved = {}
    names = re.findall(r'\bconst\s+(\w+)\s*=\s*[^`\n]*`',original)
    changed = {'BASE_FUNCS','FS_ERODE','FS_VEG','FS_PLANTS'}
    for name in names:
        if name in changed:
            continue
        old = literal(original,name)[2]
        now = literal(source,name)[2]
        if old != now:
            raise ValueError(f'Unpermitted source shader change before river patch: {name}')
        preserved[name] = sha(old)
    if 'FS_RENDER' not in preserved or 'FS_HEIGHT' not in preserved:
        raise ValueError('Full renderer/height preservation guard did not execute')
    provenance = {
        'sceneId':'lijiang-native','duration':45,'renderer':'source-derived-full-glsl',
        'terrainRevision':REVISION,'sourceSHA256':EXPECTED_SOURCE_SHA,
        'upstreamSHA256':'616d20c66e82d070f8c6bff921c8a78b2f04309b8cf279835ce4cdeaa90f4dfd',
        'qualityStatus':'candidate','artAccepted':False,'composedPeakCount':12,
        'terrainTracing':'native-terrain-sign-root-3',
        'peakCount':len(peaks),'externalAssets':0,
        'riverDescription':'340 m sinuous fresh-water river; complete isolated peak feet clear its banks',
    }
    api = '\nwindow.lijiangNativePeakSpec='+json.dumps(peaks,separators=(',',':'))+';\nwindow.lijiangNativeProvenance=Object.freeze('+json.dumps(provenance,separators=(',',':'))+');\n'+r'''
window.lijiangNative={
  getState(){return{...window.lijiangNativeProvenance,...(window.napaliControl?.getState()||{ready:false}),sceneId:'lijiang-native',qualityStatus:'candidate'};},
  riverCenter:lijiangRiverCenter,riverWidth:lijiangRiverWidth,
  getCamera(t=45){return cineCam(t);},
  getTerrainSpec(){return{rect:RECT.slice(),erosionDomain:SPLR.slice(),roughness:PARAMS.rough,erosionIterations:PARAMS.eiters,peakCount:window.lijiangNativeProvenance.peakCount,palms:0};}
};
'''
    fieldsonly_branch = r'''
  if(Q.get("fieldsonly")==="1"){
    const generation={startedAt:performance.now(),phase:"starting",phases:{},complete:false};
    window.lijiangM3Generation=generation;
    async function m3Stage(name,work){
      generation.phase=name;const start=performance.now();
      try{return await work();}
      finally{generation.phases[name]=(generation.phases[name]||0)+performance.now()-start;generation.elapsedMilliseconds=performance.now()-generation.startedAt;}
    }
    // Available before the first expensive stage, so leaving an initializing
    // preview can retire only this owned WebGL context immediately.
    window.lijiangNativeReleaseFields=async()=>{
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      const meshBuilder=await import("./native-pilot-builder.js?v=20261026-m3");
      await meshBuilder.disposeNativeMeshBuilder?.();
      return {released:true,stage:"generating"};
    };
    const sdfResolution=Q.has("sdfres")?Number(Q.get("sdfres")):192;
    if(Q.get("sdfpilot")==="1"&&(!Number.isInteger(sdfResolution)||sdfResolution<64||sdfResolution>512))
      throw new Error("sdfres must be an integer from 64 to 512");
    await m3Stage("procedural-maps",()=>generate());
    const module=await import("./native-fields.js");
    const generatedFields=await m3Stage("read-fields-and-plants",()=>module.collectNativeFields());
    const materialOnly=Q.get("materialOnly")==="1";
    const materialSampler=materialOnly?(await import("./native-field-material.js?v=20261026-m3")).createFieldMaterialSampler(generatedFields):null;
    if(materialSampler)generatedFields.provenance={...generatedFields.provenance,materialArchitecture:materialSampler.revision,sourceFullShadeEvaluated:false,sourceHDREquivalent:false};

    if(Q.get("diagnoseVolume")==="1"){
      window.__m3VolumeDiagnosticGL=gl;
      try{
        const sdf=await import("./native-sdf-fields.js?v=20261026-m3");
        const settings={resolution:64,maxBatchPixels:60000};
        const reference=await m3Stage("diagnostic-reference",()=>sdf.collectNativeRockVolume({...settings,pruneShader:false,slicesPerReadback:1}));
        const packed=await m3Stage("diagnostic-packed",()=>sdf.collectNativeRockVolume({...settings,pruneShader:false,slicesPerReadback:8}));
        const pruned=await m3Stage("diagnostic-pruned",()=>sdf.collectNativeRockVolume({...settings,pruneShader:true,slicesPerReadback:8}));
        function compare(a,b,name){
          let maximum=0,total=0,squared=0,signMismatches=0,nonfinite=0,nearSurfaceMaximum=0;const examples=[];
          for(let i=0;i<a.length;i++){
            if(!Number.isFinite(a[i])||!Number.isFinite(b[i])){nonfinite++;continue;}
            const difference=Math.abs(a[i]-b[i]);total+=difference;squared+=difference*difference;
            if(difference>maximum){maximum=difference;if(examples.length<8)examples.push({index:i,reference:a[i],candidate:b[i]});}
            if(Math.sign(a[i])!==Math.sign(b[i]))signMismatches++;
            if(Math.abs(a[i])<12)nearSurfaceMaximum=Math.max(nearSurfaceMaximum,difference);
          }
          return {name,samples:a.length,maximumAbsoluteDifference:maximum,meanAbsoluteDifference:total/a.length,RMSE:Math.sqrt(squared/a.length),signMismatches,nonfinite,nearSurfaceMaximum,examples,exactlyEqual:maximum===0&&nonfinite===0};
        }
        window.lijiangM3VolumeDiagnosis={complete:true,error:null,resolution:64,
          comparisons:[compare(reference.field,packed.field,"packed-vs-reference"),compare(reference.field,pruned.field,"pruned-packed-vs-reference")],
          reference:reference.metadata,packed:packed.metadata,pruned:pruned.metadata,
          generation:JSON.parse(JSON.stringify(generation)),scope:"Actual GPU field diagnostic only; no art or realtime acceptance."};
      }catch(error){window.lijiangM3VolumeDiagnosis={complete:true,error:String(error.stack||error)};}
      return;
    }
    if(Q.get("sdfpilot")==="1"){
      const sdfModule=await import("./native-sdf-fields.js");
      generatedFields.sdfPilot=await m3Stage("primary-volume",()=>sdfModule.collectNativeRockVolume({resolution:sdfResolution,maxBatchPixels:60000}));
      if(Q.get("surfacebake")==="1"){
        const builder=await import("./native-pilot-builder.js?v=20261026-m3");
        generatedFields.sdfPilot=await m3Stage("primary-mesh-and-material",()=>builder.addNativeSurfaceColors(generatedFields.sdfPilot,{specializeVegetation:Q.get("surfaceSpec")==="1",materialOnly,materialSampler}));
      }
      if(Q.get("compareSurface")==="1"){
        const compare=await import("./native-surface-compare.js");
        generatedFields.sdfPilot.surfaceComparison=await compare.compareNativeSurfaceSpecialization(generatedFields.sdfPilot);
      }
    }
    if(Q.get("radiancebake")==="1"){
      const radianceModule=await import("./native-radiance-field.js?v=20261026-m3");
      const elevation=18*Math.PI/180,azimuth=25*Math.PI/180;
      const sunDirection=[Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation)];
      window.lijiangNativeBakeRadiance=(options={})=>radianceModule.collectNativeRadianceField({height:generatedFields.height,rect:generatedFields.rect,resolution:1024,sunDirection,maxBatchPixels:60000,specializeVegetation:Q.get("surfaceSpec")==="1",materialOnly,materialSampler,...options});
      generatedFields.radiance=await m3Stage("terrain-material",()=>window.lijiangNativeBakeRadiance());
    }
    if(Q.get("rocks")==="1"){
      const batch=await import("./native-pilot-batch.js?v=20261026-m3");
      generatedFields.rocks=await m3Stage("all-rocks",()=>batch.collectNativeRockBatch({primary:generatedFields.sdfPilot,specializeVegetation:Q.get("surfaceSpec")==="1",materialOnly,materialSampler}));
    }
    window.lijiangNativeReleaseFields=async()=>{
      const baker=await import("./native-surface-fields.js");
      baker.disposeNativeSurfaceBaker();
      const meshBuilder=await import("./native-pilot-builder.js?v=20261026-m3");
      await meshBuilder.disposeNativeMeshBuilder?.();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return {released:true};
    };
    generation.phase="complete";generation.complete=true;
    generation.elapsedMilliseconds=performance.now()-generation.startedAt;
    generation.components={fieldReadback:window.lijiangM3FieldReadbackTimings,primaryBuild:window.lijiangM3PrimaryBuildTimings,geometry:window.lijiangM3GeometryTimings};
    generatedFields.generationTimings=JSON.parse(JSON.stringify(generation));
    window.lijiangGeneratedFields=generatedFields;
    window.dispatchEvent(new Event("lijiang-fields-ready"));
    return;
  }
'''
    source = replace_once(source,'async function main() {',api+'\nasync function main() {\n'+fieldsonly_branch)
    river_report = {'applied':False,'reason':'river module not available at generation time'}
    river_module = ROOT/'src/lijiang_native_river.py'
    if river_module.is_file():
        spec = importlib.util.spec_from_file_location('lijiang_native_river',river_module)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        source,river_report = module.patch(source)
    march_report={'applied':False}
    march_module=ROOT/'src/lijiang_native_march.py'
    if march_module.is_file():
        spec=importlib.util.spec_from_file_location('lijiang_native_march',march_module)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        source,march_report=module.patch(source)
        previous_trace=provenance['terrainTracing']
        provenance['terrainTracing']=march_report['revision']
        source=replace_once(source,'"terrainTracing":'+json.dumps(previous_trace),'"terrainTracing":'+json.dumps(provenance['terrainTracing']))
    accel_report={'applied':False,'reason':'Experimental max-height air traversal did not improve the fixed-view actual frame time; retained behind --air-accel for comparison.'}
    accel_module=ROOT/'src/lijiang_native_accel.py'
    if air_accel and accel_module.is_file():
        spec=importlib.util.spec_from_file_location('lijiang_native_accel',accel_module)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        source,accel_report=module.patch(source)
    from lijiang_m3_rock_relief import patch as patch_rock_relief
    source, m3_rock_report = patch_rock_relief(source)
    source, atmosphere_report = patch_atmosphere(source)
    from lijiang_native_idle import patch as patch_idle
    source, idle_report = patch_idle(source)
    original_height=literal(original,'FS_HEIGHT')[2]
    native_height=literal(source,'FS_HEIGHT')[2]
    modified_height=[]
    if original_height!=native_height:
        old_bed=module._functions(original_height,'seaFloor')
        new_bed=module._functions(native_height,'seaFloor')
        if len(old_bed)!=1 or len(new_bed)!=1:
            raise ValueError('Expected one seaFloor function in each height shader')
        if original_height.replace(old_bed[0][2],'__FRESHWATER_BED__') != native_height.replace(new_bed[0][2],'__FRESHWATER_BED__'):
            raise ValueError('Freshwater patch changed height code outside seaFloor')
        modified_height=['seaFloor']
    source=replace_once(source,'gl.uniform1f(u.uOAmp, 1);','gl.uniform1f(u.uOAmp, num("waveStrength",1));gl.uniform1f(u.uLiWaveSpeed,num("waveSpeed",1));')
    post=literal(source,'FS_POST')[2][1:-1]
    post='uniform vec3 uNativeTint;\n'+post
    post=post.replace('  c*=uExpo;','  c*=uExpo*uNativeTint;',1)
    source=replace_literal(source,'FS_POST',post)
    source=replace_once(source,'  gl.uniform1f(pp.u.uExpo, PARAMS.expo);','  const nativeWB=num("colorTemperature",0);gl.uniform3f(pp.u.uNativeTint,1.+.13*nativeWB,1.+.015*nativeWB,1.-.16*nativeWB);\n  gl.uniform1f(pp.u.uExpo, PARAMS.expo);')
    source=source.replace('</head>','<script type="importmap">{"imports":{"mediabunny":"../lijiang-flythrough/node_modules/mediabunny/dist/bundles/mediabunny.min.mjs","three":"../lijiang-flythrough/node_modules/three/build/three.module.js","three/addons/":"../lijiang-flythrough/node_modules/three/examples/jsm/"}}</script>\n</head>',1)
    source=source.replace('</body>','<script type="module" src="./offline-export.js"></script><script type="module" src="./live-settings.js"></script><script type="module" src="./live-viewport.js"></script>\n</body>',1)
    manifest = {
        **provenance,'m3RockRelief':m3_rock_report,'sourceFile':'../runtime/index.html','upstreamRepository':'https://github.com/Leonxlnx/napali',
        'upstreamCommit':'4afb7c3a1aad3d0203193100305c46607134d0f5','license':'MIT; Copyright (c) 2026 Leon Lin',
        'preservedBeforeRiverPatch':preserved,'modifiedTerrainLiterals':sorted(changed),
        'addedPass':'FS_NATIVE_ANCHOR: 20% linear negative erosion, max 20% base/62m cut, convex crest protection, drainage channels preserved',
        'terrainStructure':'Authored asymmetric rounded towers, split summits, leaning shoulders and short broken ridges; all within the unchanged verified foot envelope',
        'ecologyPatch':ecology.description(), 'atmospherePatch':atmosphere_report,'idlePatch':idle_report,
        'treeRootSupport':'Four crown-footprint samples at radius R*1.2; reject >6.5..11m relief, shared lowland grove/clearing mosaic',
        'riverPatch':river_report,'marchPatch':march_report,'airAcceleration':accel_report,'modifiedHeightFunctions':modified_height,'postWhiteBalance':'Uniform linear camera tint, identity at default zero temperature','liveWaveUniforms':['uOAmp','uLiWaveSpeed'],'outputSHA256':sha(source),
        'peakLayoutSHA256':sha(json.dumps(peaks,separators=(',',':'))),
        'minPeakFootRiverClearanceMetres':round(min(map(river_clearance,peaks)),3),
        'peaks':peaks,'flightKeys':keys,'qualityProbeFlightKeys':quality_keys,
        'productionLight':{'sunElevationDegrees':18,'qualityProbeSunElevationDegrees':44},
        'portraitCamera':{'enabledBelowAspect':.85,'target':[575,0,-170],'method':'Render a real portrait viewport with its own camera framing; no post-crop or stretched wide frame.'},
        'flightHeightMetres':{'mainFlight':[28,76],'terminal':16,'note':'Final low river composition is deliberately lower than the main flight.'},
        'validation':{'cpuOnly':True,'javascriptSyntax':'pending external node --check','gpu':'not run by generator','artQuality':'candidate; requires actual frame review'},
    }
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(source,encoding='utf-8',newline='\n')
    OUTPUT.with_suffix('.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return manifest


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--air-accel',action='store_true',help='Include experimental conservative max-height air traversal for measured comparison.')
    args=parser.parse_args()
    report=build(air_accel=args.air_accel)
    print(json.dumps({k:report[k] for k in ['sceneId','qualityStatus','peakCount','minPeakFootRiverClearanceMetres','outputSHA256','riverPatch']},ensure_ascii=False))
